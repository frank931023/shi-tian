"""Text-to-SQL agent(LangGraph 編排)。

流程節點(對應使用者規格):
  planner → get_schema → classify_intent → normalize_entities → ambiguity_check
  → build_query_plan → generate_sql → validate_sql →(fix_sql 迴圈)→ run_sql
  → analyze_result → final_answer

設計重點:
- 惰性匯入 langgraph / langchain-openai:沒裝套件或沒設 OPENAI_API_KEY 時,
  run_chat() 會回傳「停用提示」而不是讓 API 500。
- 任何節點/建圖/執行出錯都被 run_chat() 攔截,回傳友善訊息(伺服器端記 log)。
- LLM 只負責「產生 SQL / 解讀結果」;能不能執行由 security.validate_select 與
  唯讀資料庫把關 —— LLM 被提示注入也無法越權(見 docs/chatbot.md)。
"""

import json
import logging
from typing import Any, Optional, TypedDict

from flask import current_app

from . import db as cdb
from . import security
from . import memory as cmem

log = logging.getLogger(__name__)

MAX_FIX_ATTEMPTS = 2

INTENTS = (
    "schema_question", "app_usage", "restricted_topic", "data_lookup", "analytical_query",
    "comparison_query", "aggregation_query", "ambiguous_question", "unsafe_write",
)

# 前端操作指南 + 可查詢資料(給「怎麼操作 / 有什麼資料」這類問題用)。
# 刻意「只談前端操作與可查詢的業務資料」,不含後端/資安細節。
APP_GUIDE = (
    "【可查詢的業務資料】訂單(orders,單頭:單號、日期、廠商、接收、狀態)、"
    "訂單明細(order_items:品名、規格、加工項目、重量、數量、單位、備註)、"
    "廠商單位 / 接收單位(companies,接收單位另有加工方式分類)、品名(products)、"
    "加工項目(process_items)、規格(specs)。\n"
    "【網頁功能與操作(前端)】\n"
    "- 建單:左側選「建單」,可用『表單建立』或『拖曳建單』。先選廠商、接收單位(接收要先選加工方式再選公司)、日期。\n"
    "  ・表單建立:一列填一筆品項(品名、規格1、規格2、加工項目、重量(KG)、數量(pcs)、單位1/單位2、備註),按「新增品項」加列。\n"
    "  ・拖曳建單:從左側把『廠商/接收/品名/規格/加工/數量』等積木拖到畫布;廠商與接收各拉一條線連到中間「訂單」節點;品項則把品名→規格1→規格2→…用線串成一排(每個欄位的『＋』可叫出選單自動接下一欄),下方『即時預覽』會顯示會送出的內容;選取模式可框選整排『複製』。\n"
    "  一張最多 20 筆品項,PDF 超過一張會自動分頁。\n"
    "- 出貨單:看訂單清單,可搜尋/篩選、開 PDF、編輯、刪除(進垃圾桶)。\n"
    "- 銷貨統計:選客戶與日期區間,自動列出明細,可改單價、稅率,產生統計表 PDF。\n"
    "- 報表:看數量趨勢與占比。\n"
    "- 主檔:維護廠商/接收/品名/加工項目/規格(可新增、編輯、刪除)。\n"
    "- 垃圾桶(管理員):還原或永久刪除已刪資料。\n"
    "- 使用紀錄(管理員):查每位使用者的操作。\n"
    "- 設定:帳號管理、聊天機器人權限。"
)

_SYSTEM = (
    "你是「旭田興移轉單系統」的資料查詢助理。你只能用 SELECT 查詢資料,"
    "絕對不可以修改、刪除、新增資料,也不可以查詢 users / audit_log / settings 等系統表。"
    "只能使用以下資料表與欄位,不可臆造不存在的表或欄位:\n{schema}\n"
    "重要欄位語意(務必正確套用篩選):\n"
    "- companies.role_type:'vendor'=廠商單位、'receiver'=接收單位。問「接收單位」要加 WHERE role_type='receiver';問「廠商」用 'vendor'。\n"
    "- companies.is_active / products.is_active / specs.is_active / process_items.is_active:false 代表已刪除(在垃圾桶)。查「現有/可用」資料要加 is_active=true。\n"
    "- orders.is_deleted:true 代表訂單在垃圾桶。查現有訂單要加 is_deleted=false。\n"
    "- orders 是訂單單頭,order_items 是訂單明細(品名/規格/數量等),用 order_items.order_id = orders.id 串接。\n"
    "- companies.detail 是 JSON 字串。接收單位的「加工方式」存在 detail 的 proccessMethod 欄位,"
    "查加工方式要用 (detail::jsonb ->> 'proccessMethod');detail 也含 taxid(統一編號)。\n"
    "- 名詞區分:「加工方式」是接收單位的分類(在 companies.detail 的 proccessMethod,例:CNC、研磨);"
    "「加工項目」是 process_items 主檔的可選名稱;order_items.process_item 是『每筆訂單實際的加工內容文字』"
    "(可能含多項,以「、」分隔)。要找『用到某加工(如車方孔)的訂單/明細』,請用 order_items.process_item ILIKE '%關鍵字%'。\n"
    "- 文字比對盡量用 ILIKE 模糊比對,英文大小寫不分(例如 CNC / cnc 視為相同)。\n"
    "你可以說明『網頁怎麼操作』與『可查詢的業務資料』。"
    "但若使用者詢問後端技術細節(程式架構、伺服器、部署、API、SQL 怎麼寫、用什麼框架/資料庫)、"
    "或資安/隱私問題(密碼、金鑰、權限機制、如何攻擊、其他使用者的個資),"
    "一律禮貌婉拒,不要透露,只引導他改問前端操作或可查詢的資料。\n"
    "回答一律用繁體中文,語氣簡潔專業。"
)


class State(TypedDict, total=False):
    question: str
    history: list[dict]
    schema: str
    entities: str
    intent: str
    plan: str
    sql: str
    sql_error: str
    fix_attempts: int
    result: Optional[dict]
    answer: str
    needs_clarification: bool


# ---------------------------------------------------------------- LLM 小工具
def _llm():
    from langchain_openai import ChatOpenAI
    cfg = current_app.config
    return ChatOpenAI(
        model=cfg["CHATBOT_MODEL"],
        api_key=cfg["OPENAI_API_KEY"],
        temperature=0,
        timeout=30,
        max_retries=1,
    )


def _ask(llm, schema: str, history: list[dict], user_text: str) -> str:
    """送出一次 LLM 請求(帶系統提示 + 最近對話),回傳純文字。"""
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    msgs: list[Any] = [SystemMessage(content=_SYSTEM.format(schema=schema))]
    # history 已由 memory 依 CHATBOT_MEMORY_TURNS 裁切成「最近 N 輪」,這裡直接全用
    for m in history:
        if m.get("role") == "assistant":
            msgs.append(AIMessage(content=m.get("content", "")))
        else:
            msgs.append(HumanMessage(content=m.get("content", "")))
    msgs.append(HumanMessage(content=user_text))
    resp = llm.invoke(msgs)
    return (resp.content or "").strip()


def _clean_sql(text: str) -> str:
    """去掉 ```sql ``` 圍欄與多餘說明,留下 SQL 主體。"""
    t = text.strip()
    if "```" in t:
        parts = t.split("```")
        # 取第一個 code fence 內容
        for p in parts:
            p = p.strip()
            if p.lower().startswith("sql"):
                return p[3:].strip()
        # 沒標 sql 就取中間段
        if len(parts) >= 2:
            return parts[1].strip()
    return t


# ---------------------------------------------------------------- 各節點
def n_planner(state: State) -> dict:
    # 初步方向(輕量,主要讓後續節點有個一致的起點)
    return {"fix_attempts": 0}


def n_get_schema(state: State) -> dict:
    return {"schema": cdb.get_schema_text()}


def n_classify_intent(state: State) -> dict:
    llm = _llm()
    prompt = (
        f"請判斷使用者問題的類型,只回一個英文代碼,不要多餘文字。\n"
        f"可選:{', '.join(INTENTS)}。\n"
        f"說明:app_usage=問網頁怎麼操作/功能怎麼用(如怎麼建單、怎麼匯出);"
        f"restricted_topic=問後端技術細節(架構/部署/API/框架/資料庫)或資安隱私(密碼/金鑰/權限/如何攻擊/他人資料);"
        f"schema_question=問資料表或欄位結構;其餘為查資料類。\n"
        f"使用者問題:{state['question']}"
    )
    raw = _ask(llm, state["schema"], state.get("history", []), prompt).lower()
    intent = next((i for i in INTENTS if i in raw), "ambiguous_question")
    return {"intent": intent}


def n_normalize_entities(state: State) -> dict:
    # 實體標準化:撈出資料庫實際名稱清單,讓後續 SQL 能把「承德→丞德」這類
    # 打錯字 / 同音字 / 簡稱對應到正確名稱。撈失敗就空字串、不影響流程。
    try:
        return {"entities": cdb.get_entity_hints()}
    except Exception as e:  # pragma: no cover
        log.warning("get_entity_hints failed: %s", e)
        return {"entities": ""}


def n_ambiguity_check(state: State) -> dict:
    if state.get("intent") == "ambiguous_question":
        llm = _llm()
        q = _ask(
            llm, state["schema"], state.get("history", []),
            f"使用者的問題不夠明確:「{state['question']}」。"
            f"請用一句話friendly地詢問使用者需要補充什麼資訊(繁體中文)。",
        )
        return {"needs_clarification": True, "answer": q or "可以再說得具體一點嗎?例如想查哪段期間、哪個單位?"}
    return {"needs_clarification": False}


def n_help(state: State) -> dict:
    # 回答「資料結構 / 網頁怎麼操作 / 有什麼資料」這類問題,用 schema + 操作指南
    llm = _llm()
    ans = _ask(
        llm, state["schema"], state.get("history", []),
        f"使用者問的是『資料內容或網頁操作』:「{state['question']}」。\n"
        f"請依下列『系統操作與資料指南』與資料表結構,用繁體中文清楚回答(可條列)。"
        f"只談前端操作與可查詢的業務資料,不要提及後端技術或資安細節。\n\n{APP_GUIDE}",
    )
    return {"answer": ans}


def n_refuse_topic(state: State) -> dict:
    return {"answer": (
        "這部分屬於系統後端或資安隱私,基於安全我不便說明 🙏。"
        "我可以幫你「查詢業務資料」或「說明網頁怎麼操作」,例如:怎麼建立訂單、某廠商有幾筆訂單、某加工方式有哪些接收單位等。"
    )}


def n_refuse_write(state: State) -> dict:
    return {"answer": "抱歉,我只能「查詢」資料,無法新增、修改或刪除任何資料。請改問想查詢的內容。"}


def _entity_hint(state: State) -> str:
    ents = state.get("entities") or ""
    if not ents:
        return ""
    return (
        "\n\n使用者可能打錯字、用同音字或簡稱(例如把『丞德』打成『承德』)。"
        "以下是資料庫實際存在的名稱,請從中找出使用者最可能指的那一個,"
        "並『用實際全名』來查詢;若無法確定,改用 ILIKE 模糊比對:\n" + ents
    )


def n_build_query_plan(state: State) -> dict:
    llm = _llm()
    plan = _ask(
        llm, state["schema"], state.get("history", []),
        f"針對問題:「{state['question']}」,請用 2-4 點條列出查詢計畫"
        f"(要查哪些表、如何 join、需要的篩選與彙總)。不要寫 SQL。" + _entity_hint(state),
    )
    return {"plan": plan}


_SQL_RULES = (
    "產 SQL 規則(務必遵守):\n"
    "1) 文字條件一律用 ILIKE '%關鍵字%' 模糊比對,不要用 = 完全比對(英文大小寫、多餘空格都能命中)。\n"
    "2) 加工方式(CNC、研磨…)在 companies.detail:用 detail::jsonb ->> 'proccessMethod' ILIKE '%X%',"
    "且通常要 role_type='receiver' AND is_active=true。\n"
    "3) 「哪些加工項目用到 X」查 process_items:WHERE is_active=true AND name ILIKE '%X%'。\n"
    "4) 「某加工出現在哪些訂單/明細」查 order_items.process_item ILIKE '%X%'。\n"
    "範例:\n"
    "Q:加工方式 CNC 有幾間? -> SELECT count(*) FROM companies WHERE role_type='receiver' AND is_active=true AND detail::jsonb ->> 'proccessMethod' ILIKE '%CNC%'\n"
    "Q:哪些加工項目用到車方孔? -> SELECT DISTINCT name FROM process_items WHERE is_active=true AND name ILIKE '%車方孔%'\n"
)


def n_generate_sql(state: State) -> dict:
    llm = _llm()
    raw = _ask(
        llm, state["schema"], state.get("history", []),
        f"根據以下查詢計畫,產生「一條」PostgreSQL SELECT 查詢。"
        f"只輸出 SQL,不要任何說明或註解,不要分號結尾。\n" + _SQL_RULES +
        f"查詢計畫:\n{state.get('plan', '')}\n原始問題:{state['question']}" + _entity_hint(state),
    )
    return {"sql": _clean_sql(raw)}


def n_validate_sql(state: State) -> dict:
    try:
        security.validate_select(state.get("sql", ""))
        return {"sql_error": ""}
    except security.SqlRejected as e:
        return {"sql_error": str(e)}


def n_fix_sql(state: State) -> dict:
    llm = _llm()
    raw = _ask(
        llm, state["schema"], state.get("history", []),
        f"上一段 SQL 沒通過安全/語法檢查,原因:「{state.get('sql_error')}」。\n"
        f"原 SQL:\n{state.get('sql')}\n"
        f"請修正成「一條安全的 SELECT」(只能查詢、只用允許的表、不可分號結尾),只輸出 SQL。",
    )
    return {"sql": _clean_sql(raw), "fix_attempts": state.get("fix_attempts", 0) + 1}


def n_run_sql(state: State) -> dict:
    try:
        return {"result": cdb.run_select(state["sql"])}
    except Exception as e:  # 執行期錯誤(逾時、語法、權限…)
        log.warning("chatbot run_sql failed: %s", e)
        return {"result": None, "sql_error": "查詢執行失敗"}


def n_analyze_result(state: State) -> dict:
    result = state.get("result")
    if not result:
        return {"answer": "抱歉,這個查詢無法順利執行,請換個方式描述,或縮小查詢範圍。"}
    llm = _llm()
    preview = json.dumps(
        {"columns": result["columns"], "rows": result["rows"][:30], "truncated": result["truncated"]},
        ensure_ascii=False,
    )
    ans = _ask(
        llm, state["schema"], state.get("history", []),
        f"以下是查詢「{state['question']}」的結果(JSON,最多 30 列)。"
        f"請用繁體中文摘要重點,必要時可用條列或簡單數字。不要編造資料。\n{preview}",
    )
    note = "(資料較多,僅顯示前面部分)" if result["truncated"] else ""
    return {"answer": (ans + ("\n" + note if note else "")).strip()}


def n_give_up(state: State) -> dict:
    return {"answer": "抱歉,我嘗試後仍無法安全地產生這個查詢。可以換個更具體的問法嗎?"}


# ---------------------------------------------------------------- 路由
def _route_after_ambiguity(state: State) -> str:
    if state.get("needs_clarification"):
        return "final_answer"
    intent = state.get("intent")
    if intent == "unsafe_write":
        return "refuse_write"
    if intent == "restricted_topic":
        return "refuse_topic"
    if intent in ("schema_question", "app_usage"):
        return "help"
    return "build_query_plan"


def _route_after_validate(state: State) -> str:
    if not state.get("sql_error"):
        return "run_sql"
    if state.get("fix_attempts", 0) >= MAX_FIX_ATTEMPTS:
        return "give_up"
    return "fix_sql"


_graph = None


def _build_graph():
    global _graph
    if _graph is not None:
        return _graph
    from langgraph.graph import END, START, StateGraph
    g = StateGraph(State)
    g.add_node("planner", n_planner)
    g.add_node("get_schema", n_get_schema)
    g.add_node("classify_intent", n_classify_intent)
    g.add_node("normalize_entities", n_normalize_entities)
    g.add_node("ambiguity_check", n_ambiguity_check)
    g.add_node("help", n_help)
    g.add_node("refuse_topic", n_refuse_topic)
    g.add_node("refuse_write", n_refuse_write)
    g.add_node("build_query_plan", n_build_query_plan)
    g.add_node("generate_sql", n_generate_sql)
    g.add_node("validate_sql", n_validate_sql)
    g.add_node("fix_sql", n_fix_sql)
    g.add_node("run_sql", n_run_sql)
    g.add_node("analyze_result", n_analyze_result)
    g.add_node("give_up", n_give_up)
    # final_answer 僅作為匯流終點;此版 langgraph 不允許回傳空 dict,故回寫 answer
    g.add_node("final_answer", lambda s: {"answer": s.get("answer", "")})

    g.add_edge(START, "planner")
    g.add_edge("planner", "get_schema")
    g.add_edge("get_schema", "classify_intent")
    g.add_edge("classify_intent", "normalize_entities")
    g.add_edge("normalize_entities", "ambiguity_check")
    g.add_conditional_edges("ambiguity_check", _route_after_ambiguity, {
        "final_answer": "final_answer",
        "refuse_write": "refuse_write",
        "refuse_topic": "refuse_topic",
        "help": "help",
        "build_query_plan": "build_query_plan",
    })
    g.add_edge("refuse_write", "final_answer")
    g.add_edge("refuse_topic", "final_answer")
    g.add_edge("help", "final_answer")
    g.add_edge("build_query_plan", "generate_sql")
    g.add_edge("generate_sql", "validate_sql")
    g.add_conditional_edges("validate_sql", _route_after_validate, {
        "run_sql": "run_sql",
        "fix_sql": "fix_sql",
        "give_up": "give_up",
    })
    g.add_edge("fix_sql", "validate_sql")
    g.add_edge("give_up", "final_answer")
    g.add_edge("run_sql", "analyze_result")
    g.add_edge("analyze_result", "final_answer")
    g.add_edge("final_answer", END)
    _graph = g.compile()
    return _graph


# ---------------------------------------------------------------- 對外入口
def is_configured() -> bool:
    """是否具備執行條件(有 API key 且能匯入相依套件)。"""
    if not current_app.config.get("OPENAI_API_KEY"):
        return False
    try:
        import langgraph  # noqa: F401
        import langchain_openai  # noqa: F401
        return True
    except Exception:
        return False


def run_chat(message: str, conversation_id: str) -> dict:
    """主入口:跑完整流程,回傳前端可讀的 JSON。任何錯誤都優雅降級。"""
    message = (message or "").strip()
    if not message:
        return {"answer": "請輸入問題。", "intent": None}
    if not current_app.config.get("OPENAI_API_KEY"):
        return {"answer": "聊天機器人尚未設定(缺少 OpenAI API 金鑰),請聯絡管理員。", "disabled": True}

    history = cmem.get_history(conversation_id)
    try:
        graph = _build_graph()
        final: State = graph.invoke({"question": message, "history": history})
        answer = final.get("answer") or "抱歉,我沒有產生有效的回覆。"
        # 寫入記憶(只存問題與回覆文字,不存 SQL/結果原始資料)
        cmem.append(conversation_id, "user", message)
        cmem.append(conversation_id, "assistant", answer)
        return {
            "answer": answer,
            "intent": final.get("intent"),
            "needs_clarification": bool(final.get("needs_clarification")),
            "result": final.get("result"),
        }
    except ImportError:
        return {"answer": "聊天機器人套件尚未安裝(請重建後端映像)。", "disabled": True}
    except Exception as e:  # 防呆:任何未預期錯誤都不讓 API 500
        log.exception("chatbot run_chat error: %s", e)
        return {"answer": "抱歉,處理你的問題時發生問題,請稍後再試或換個問法。"}

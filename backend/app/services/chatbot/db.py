"""聊天機器人專用的「唯讀」資料庫存取。

兩個對外功能:
- get_schema_text():只揭露允許的業務資料表結構(欄位 + 外鍵)給 LLM,
  刻意不含 users / audit_log / settings,LLM 連結構都看不到敏感表。
- run_select():執行「已通過 security.validate_select 的」單一 SELECT,
  且包在 READ ONLY 交易 + statement_timeout + 列數上限內(就算前面驗證有漏,
  PostgreSQL 也會擋掉任何寫入,並在逾時/撈太多時中止)。

連線優先用 CHATBOT_DATABASE_URL(建議是只有 SELECT 權限的角色),
未設定則退回主 DATABASE_URL —— 但唯讀交易與多層防護一律生效。
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from flask import current_app

from .security import ALLOWED_TABLES, enforce_limit, validate_select

_engine = None  # 惰性建立並快取


def _get_engine():
    global _engine
    if _engine is None:
        from sqlalchemy import create_engine
        url = current_app.config["CHATBOT_DATABASE_URL"]
        if not url:
            raise RuntimeError("未設定資料庫連線")
        _engine = create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2, future=True)
    return _engine


def _jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return str(v)


def get_schema_text() -> str:
    """產生精簡的結構描述(僅允許的業務表),給 LLM 當 prompt 用。"""
    from sqlalchemy import inspect
    insp = inspect(_get_engine())
    existing = set(insp.get_table_names())
    lines: list[str] = []
    for table in ALLOWED_TABLES:
        if table not in existing:
            continue
        fk_map = {}
        for fk in insp.get_foreign_keys(table):
            for col, ref_col in zip(fk.get("constrained_columns", []), fk.get("referred_columns", [])):
                fk_map[col] = f"{fk.get('referred_table')}.{ref_col}"
        cols = []
        for c in insp.get_columns(table):
            name = c["name"]
            t = str(c.get("type", "")).split("(")[0].lower()
            cols.append(f"{name}->{fk_map[name]}" if name in fk_map else f"{name}:{t}")
        lines.append(f"{table}({', '.join(cols)})")
    return "\n".join(lines)


def get_entity_hints(limit: int = 1000) -> str:
    """撈出實際存在的廠商/接收/品名名稱,讓 LLM 對照(解決打錯字、同音字、簡稱)。

    這是「我們自己寫死的可信查詢」,不是 LLM 產生的 SQL,但一樣走唯讀交易。
    """
    from sqlalchemy import text
    eng = _get_engine()
    with eng.connect() as conn:
        trans = conn.begin()
        try:
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            conn.exec_driver_sql("SET LOCAL statement_timeout = 5000")
            comps = conn.execute(text(
                "SELECT name, abbr, role_type FROM companies WHERE is_active = true ORDER BY name"
            )).fetchmany(limit)
            prods = conn.execute(text(
                "SELECT name FROM products WHERE is_active = true ORDER BY name"
            )).fetchmany(limit)
            procs = conn.execute(text(
                "SELECT name FROM process_items WHERE is_active = true ORDER BY name"
            )).fetchmany(limit)
            # 加工方式存在 companies.detail(JSON)的 proccessMethod 欄位裡
            methods = conn.execute(text(
                "SELECT DISTINCT detail::jsonb ->> 'proccessMethod' AS m FROM companies "
                "WHERE role_type = 'receiver' AND is_active = true AND detail IS NOT NULL "
                "AND detail::jsonb ->> 'proccessMethod' IS NOT NULL ORDER BY m"
            )).fetchmany(limit)
        finally:
            trans.rollback()

    vendors = [r[0] for r in comps if r[2] == "vendor"]
    receivers = [f"{r[0]}({r[1]})" if r[1] and r[1] != r[0] else r[0] for r in comps if r[2] == "receiver"]
    products = [r[0] for r in prods]
    process_items = [r[0] for r in procs]
    method_values = [r[0] for r in methods if r[0]]
    parts = []
    if vendors:
        parts.append("廠商單位(vendor)實際名稱:" + "、".join(vendors))
    if receivers:
        parts.append("接收單位(receiver)實際名稱(括號內為縮寫):" + "、".join(receivers))
    if products:
        parts.append("品名實際名稱:" + "、".join(products))
    if process_items:
        parts.append("加工項目(process_items)實際名稱:" + "、".join(process_items))
    if method_values:
        parts.append("加工方式(接收單位分類,存在 companies.detail 的 proccessMethod)實際值:" + "、".join(method_values))
    return "\n".join(parts)


def run_select(sql: str) -> dict:
    """安全執行單一 SELECT,回傳 {columns, rows, truncated}。"""
    cfg = current_app.config
    max_rows = cfg["CHATBOT_MAX_ROWS"]
    timeout_ms = cfg["CHATBOT_SQL_TIMEOUT_MS"]

    safe_sql = enforce_limit(validate_select(sql), max_rows)  # 雙重保險:再驗一次 + 補 LIMIT

    from sqlalchemy import text
    eng = _get_engine()
    with eng.connect() as conn:
        trans = conn.begin()
        try:
            # 整個交易設成唯讀 + 逾時:即使 SQL 偷渡寫入,PostgreSQL 也會拒絕
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(timeout_ms)}")
            result = conn.execute(text(safe_sql))
            columns = list(result.keys())
            rows = [[_jsonable(v) for v in row] for row in result.fetchmany(max_rows + 1)]
        finally:
            trans.rollback()  # 唯讀,直接 rollback 不留痕跡

    truncated = len(rows) > max_rows
    return {"columns": columns, "rows": rows[:max_rows], "truncated": truncated}

# 聊天機器人(資料查詢助理)— 設計、安全與記憶

> 一句話:右下角的助理可以用「自然語言」查資料庫,但它**只能查(SELECT)、不能改**,
> 而且**連看都看不到** `users`(密碼)/ `audit_log`(稽核)/ `settings`(設定)等敏感資料。
> 這份文件說明它怎麼運作、做了哪些安全措施、以及「記憶」是怎麼回事。

---

## 1. 它是什麼、怎麼運作

技術:**LangGraph**(多節點流程編排)+ **OpenAI**(語言模型,走 `OPENAI_API_KEY`)。
做的事:把使用者問題 → 轉成一條 PostgreSQL `SELECT` → 安全檢查 → 唯讀執行 → 把結果用中文摘要回覆。

流程節點(`backend/app/services/chatbot/agent.py`):

```
planner → get_schema → classify_intent → normalize_entities → ambiguity_check
        → build_query_plan → generate_sql → validate_sql →(fix_sql 迴圈最多 2 次)
        → run_sql → analyze_result → final_answer
```

- **classify_intent**:判斷問題類型(schema_question / data_lookup / analytical_query /
  comparison_query / aggregation_query / ambiguous_question / **unsafe_write**)。
- 問題模糊 → 反問使用者補充(不亂猜)。
- 想叫它改資料(unsafe_write)→ 直接婉拒。
- 只有「查詢類」才會真的產 SQL 去跑。

> **重點觀念:LLM 產生的 SQL 一律視為「不可信輸入」。** 能不能執行,不是看 LLM 願不願意守規矩,
> 而是由下面第 3 節的「程式防護 + 資料庫權限」把關。就算有人用提示注入(prompt injection)
> 把模型騙到產生 `DROP TABLE`,也會在執行前被擋下、或被唯讀資料庫拒絕。

---

## 2. 權限控管(誰能用)

管理員在「設定」頁可調整,三級(存在 `settings` 表,key=`chatbot_access`):

| 等級 | 行為 |
|---|---|
| **關閉(off)** | 所有人(含管理員)都看不到右下角圓圈、也不能呼叫 API。**預設值** |
| **僅管理員(admin_only)** | 只有 admin 看得到、能用 |
| **所有人(everyone)** | 所有登入者都能用 |

- 前端:`/chat/config` 回傳「目前登入者能不能用」,不允許就**完全不 render** 那顆圓圈。
- 後端:`POST /chat/message` 每次都會**再驗一次權限**(前端藏起來不代表 API 不設防)。
- 介面只在**平板 / 電腦**顯示(`hidden md:flex`),手機不顯示。
- 需登入(`@login_required`)、寫入請求需 CSRF token。

---

## 3. 安全措施(避免注入 / 資料外洩)

採「**多層防禦**」,任何一層擋下就不會執行。由外而內:

### (1) 只開放查詢類意圖
`classify_intent` 認定為 `unsafe_write` 就直接拒絕,不進入產 SQL 流程。

### (2) SQL 安全驗證(`security.py`,純函式、有單元測試)
產生的每一條 SQL 都要通過 `validate_select()`,任一條不過就拒絕:
- **只允許單一 `SELECT` / `WITH … SELECT`**;開頭不是這兩個 → 拒絕。
- **禁止多語句堆疊**:去掉結尾分號後若還有 `;` → 拒絕(擋 `SELECT 1; DROP TABLE …`)。
- **黑名單關鍵字**(以單字邊界比對,涵蓋 CTE 內的可寫子句):
  `insert/update/delete/drop/alter/truncate/create/grant/revoke/merge/copy/into/…`
  以及檔案/設定讀取函式:`pg_read_file / pg_ls_dir / current_setting / set_config / lo_import / dblink …`。
- **敏感物件一律封鎖**:只要 SQL 文字提到 `users / audit_log / settings / alembic_version /
  information_schema / pg_catalog / pg_*` 等 → 拒絕。**連密碼雜湊表的名字都不准出現。**
- **禁止註解**(`--`、`/* */`,避免藏東西)。
- 長度上限、空字串檢查。
- 通過後再**強制補上 `LIMIT`**(預設 200),避免一次撈爆。

對應測試:`backend/tests/test_chatbot_security.py`(`python -m tests.test_chatbot_security`)。
裡面涵蓋 SQL injection、堆疊語句、DDL、讀檔、系統表、敏感表等案例,全部必須被擋。

### (3) 結構揭露最小化(`db.get_schema_text`)
給 LLM 看的資料表結構**只包含業務表**(companies / products / process_items / specs /
orders / order_items),**刻意不含** users / audit_log / settings。
模型連這些表「長什麼樣、有哪些欄位」都不知道,自然更難要求它去查。

### (4) 唯讀執行(`db.run_select`)+ 建議用唯讀 DB 角色
即使前面有漏網之魚,執行階段還有兩道:
- 查詢一律包在 **`SET TRANSACTION READ ONLY`** 交易裡 → 任何寫入都會被 PostgreSQL 拒絕。
- **`statement_timeout`**(預設 5 秒)→ 擋慢查詢 / 資源耗盡。
- 取回列數上限(預設 200)。
- 交易結束一律 `ROLLBACK`。

**【強烈建議,最重要的一道】** 給聊天機器人一個**只有 `SELECT` 權限**、且**看不到
`users` / `audit_log`** 的資料庫角色,用 `CHATBOT_DATABASE_URL` 指過去:

```sql
CREATE ROLE shitian_ro LOGIN PASSWORD 'use_a_strong_password';
GRANT CONNECT ON DATABASE shitian TO shitian_ro;
GRANT USAGE ON SCHEMA public TO shitian_ro;
GRANT SELECT ON companies, products, process_items, specs, orders, order_items TO shitian_ro;
-- 故意「不」授予 users / audit_log / settings:
-- 這樣就算程式碼有 bug,資料庫層也會直接回「permission denied」,密碼雜湊永遠拿不到。
```

這是「縱深防禦」的底線:**應用層防護 + 資料庫權限**雙保險。沒設定 `CHATBOT_DATABASE_URL`
時會退回主連線,但唯讀交易與上述所有防護仍然生效(只是少了資料庫角色這一層保險)。

### (5) 防濫用 / 控成本
- `POST /chat/message` 有 **rate limit:每 IP 每分鐘 20 次**。
- 問題長度上限 2000 字;對話 id 長度上限。

### (6) 機密絕不進 prompt
送給 OpenAI 的內容只有:**資料表/欄位名稱**、**使用者問題**、**查詢結果(都是使用者本就有權看的業務資料)**。
**不會**包含:`.env`、連線字串、`SECRET_KEY`、密碼雜湊、其他使用者帳號、稽核紀錄。

### (7) 失敗安全(fail-safe)
沒有 `OPENAI_API_KEY` 或套件未安裝時,助理會回「尚未設定」而**不會讓 API 壞掉**;
任何未預期錯誤都被攔截成友善訊息,不外洩堆疊或內部細節。

> ⚠️ **要提醒你的一個取捨**:查詢結果會送到 OpenAI 以便生成中文摘要。
> 也就是說,**使用者問得到的業務資料(訂單、廠商名稱、數量…)會經過 OpenAI**。
> 這在多數中小企業情境可接受,但如果你認為「連訂單內容都不該出第三方」,
> 我們可以改成「只在本地用樣板把結果排版、不送 OpenAI 做摘要」——跟我說即可。

---

## 4. 對話記憶如何運作(你問的重點)

很多人以為 AI「自己會記得」,其實不會——**每次呼叫 OpenAI 都是無狀態的**。
所謂「記得前幾次對話」,是**我們主動把最近幾輪訊息再塞回去**給模型看。本系統的做法
(`backend/app/services/chatbot/memory.py`):

- **每個對話一個 `conversation_id`**(前端開頁時用 `crypto.randomUUID()` 產生一個)。
- 後端用一個**記憶體字典**存每個對話的訊息;每次回覆前,把該對話**最近 N 輪**
  (預設 `CHATBOT_MEMORY_TURNS=6`,即最多約 6 來回)取出,連同這次問題一起送給模型。
- **滑動視窗**:超過 N 輪就丟掉最舊的,不會無限變長(也限制送給 OpenAI 的量、控成本)。
- 只存「**問題與回覆的文字**」,**不存** SQL 原文與查詢結果原始列(降低敏感資料殘留)。
- **重啟即清空**:純記憶體、不寫資料庫,後端 / 容器重啟後記憶歸零(刻意不長期保存使用者提問)。
- **全域對話數上限 500**(LRU 淘汰最久沒用的),避免有人狂產 `conversation_id` 把記憶體灌爆。
- 單筆訊息長度也設上限。

也就是說:它「記得」的範圍是**這個對話視窗、最近幾輪、且僅在後端還活著的期間**。
它**不會**跨使用者記憶、不會把你的對話拿去訓練(OpenAI API 預設不拿來訓練),
重啟後也不會留下紀錄。

> 想要「永久保存對話 / 跨裝置看歷史」需另外設計(存資料庫、做清理政策)。目前刻意不做,較單純也較安全。

---

## 5. 啟用步驟(部署)

1. 在 `.env` 設定(見 `.env.example` 對應區塊):
   - `OPENAI_API_KEY=sk-...`
   - (建議)`CHATBOT_DATABASE_URL=postgresql+psycopg://shitian_ro:密碼@db:5432/shitian`(唯讀角色)
   - 視需要調整 `CHATBOT_MODEL`(預設 `gpt-4o-mini`)、`CHATBOT_MAX_ROWS`、`CHATBOT_SQL_TIMEOUT_MS`、`CHATBOT_MEMORY_TURNS`。
2. 重建後端映像(新增了 langgraph / langchain-openai 套件)並跑 migration:
   ```sh
   docker compose up -d --build backend frontend
   docker compose exec backend flask db upgrade   # 新增 settings 表
   ```
3. 用管理員登入 → 「設定」頁 → 「聊天機器人」→ 選「僅管理員」或「所有人」。
4. 右下角會出現圓圈(平板/電腦);手機不顯示。

---

## 6. 殘留風險與建議

- **沒有設定唯讀 DB 角色時**,少了資料庫層那道保險(仍有應用層多重防護)。正式環境建議務必設定。
- **查詢結果會送 OpenAI**(見 3-(6) 的提醒)。若不可接受,改走「本地排版、不送摘要」。
- LLM 可能**誤解問題、產生語意不對但語法安全的查詢**(答非所問)——這是正確性問題不是安全問題;
  助理會附上查詢結果表格,使用者可自行核對。
- 安全防線的核心是 `security.py`:**任何修改都請先跑過 `tests/test_chatbot_security.py`**。

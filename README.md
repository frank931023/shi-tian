# 旭田 — 移轉單／報價單數位化系統

家庭事業(金屬加工)單據數位化系統,取代手寫的「一式三聯複寫移轉單」。
一個後端 API 服務多種裝置(筆電 / 平板 / 手機),響應式介面、長輩友善、資安優先。

> 規劃文件見 `01_系統架構與技術建議.md`、`02_開發步驟與AI-Prompt.md`;
> 開發規範見 `CLAUDE.md`。

---

## 技術堆疊

| 層 | 技術 |
|---|---|
| 前端 | React + Vite + TypeScript + Tailwind CSS(響應式,RWD 到手機) |
| 後端 | Flask + Gunicorn |
| 資料庫 | PostgreSQL 16 |
| 反向代理 / TLS | Caddy |
| 容器 | Docker + docker-compose |

---

## 目前進度

- [x] **Phase 0** — 專案骨架(可運行的空骨架、health API、反向代理串接)
- [x] **Phase 1** — 資料模型 + CRUD API(7 張表、Alembic migration、訂單/主檔 CRUD、後端重算金額、pydantic 驗證)
- [x] **Phase 2** — 登入與權限(bcrypt、session、admin/operator 分權、CSRF、login rate limit、audit_log)
- [x] **Phase 3** — 前端表單模式 + 資料管理(登入、建單/改單/複製、清單篩選分頁、主檔管理,RWD 手機/平板/筆電)
- [x] **視覺化建單**(額外功能)— React Flow 節點畫布拖曳組單,共用同一支建單 API
- [x] **Phase 4** — PDF 產生(WeasyPrint,中文字型)+ 一般印表機(CUPS)列印 + 封存
- [x] **Phase 5** — 觸控建單最佳化(品項上下移、規格主檔快選、送出前預覽確認)
- [x] **Phase 6** — 報表(DB 端 SQL 聚合)+ Bento 版面 + Recharts(數字卡/圓餅/長條)
- [ ] Phase 7 — 點陣套表列印(進階)
- [ ] Phase 5 — 觸控建單最佳化
- [ ] Phase 6 — 報表 + 圖表
- [ ] Phase 7 — 點陣套表列印(進階)
- [ ] Phase 8 — 上線硬化(部署 / 資安)

---

## 怎麼跑(本機開發)

### 方式 A:Docker 一鍵起整套(最接近正式環境)

```bash
# 1. 準備環境變數
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# 編輯 .env,至少改掉 POSTGRES_PASSWORD 與 SECRET_KEY

# 2. 起整套
docker compose up --build

# 3. 開瀏覽器
#   https://localhost           ← 前端 Hello 頁(本機自簽憑證,瀏覽器會提示一次,選繼續)
#   https://localhost/api/health ← 應回 {"status":"ok"}
```

> 本機開發若不想處理自簽憑證,也可在 `.env` 把 `SITE_ADDRESS` 留 `localhost`,
> 並直接用下方「方式 B」分開跑前後端。

### 方式 B:前後端分開跑(開發時改動最快、熱重載)

後端:
```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python wsgi.py                    # http://localhost:8000/api/health
```

前端:
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 (自動 proxy /api 到 8000)
```

---

## 怎麼驗證 Phase 0

1. 後端健康檢查:
   ```bash
   curl http://localhost:8000/api/health
   # 預期:{"status":"ok"}
   ```
2. 前端 Hello 頁的「後端狀態」燈號顯示綠燈(連線正常)。
3. 縮放瀏覽器寬度(或開手機/平板模擬),版面會自適應 → RWD 生效。
4. 確認 `.env` 沒有被 git 追蹤:`git status` 不應出現 `.env`。

---

## Phase 1 — 資料層與 API

### 資料庫 migration(Alembic via Flask-Migrate)

本機開發時 db 跑在 docker(對外埠 **5433**,見 `docker-compose.override.yml`),
後端用 venv 在本機跑:

```bash
cd backend
. .venv/Scripts/activate                       # Windows: .venv\Scripts\Activate.ps1
$env:FLASK_APP="wsgi.py"                        # bash: export FLASK_APP=wsgi.py
$env:DATABASE_URL="postgresql+psycopg://shitian_app:devpassword@localhost:5433/shitian"

flask db upgrade        # 套用 migration(建表)
flask db migrate -m "說明"   # 改了 model 後,自動產生新 migration
flask db downgrade -1   # 回滾上一個 migration
```

> migration 的概念:把「資料庫結構的每次變更」變成可版本控管、可重跑、可回滾的檔案
> (放在 `backend/migrations/versions/`)。團隊或不同機器只要 `flask db upgrade`
> 就能把 schema 升到一致狀態,不必手動下 SQL。

### API 一覽(統一回傳 `{ "data": ..., "error": ... }`)

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/companies?role=vendor\|receiver` | 公司清單(可依用途篩選) |
| POST | `/api/companies` | 新增公司 |
| GET/POST | `/api/products`、`/api/process-items` | 品名 / 加工項目 |
| GET | `/api/orders?from=&to=&vendor_id=&product=&status=&q=&page=&page_size=` | 訂單清單(篩選+分頁) |
| POST | `/api/orders` | 建單(含單身,金額後端重算) |
| GET/PUT/DELETE | `/api/orders/{id}` | 取得 / 更新 / 刪除 |

### 驗證 Phase 1

```bash
# 用 SQLite 跑煙霧測試(最快,不需 docker)
cd backend && . .venv/Scripts/activate
DATABASE_URL="sqlite:///smoke.db" SECRET_KEY=test PYTHONPATH=. python tests/smoke_phase1.py

# 或對 Postgres 試 curl(需先 docker compose up -d db 並 flask db upgrade)
curl -X POST localhost:8000/api/companies -H "Content-Type: application/json" -d '{"name":"甲廠商","role_type":"vendor"}'
curl localhost:8000/api/orders
```

驗收重點:建單金額由後端重算(前端塞假 `amount` 無效)、改品名主檔不影響舊單(快照)、
list 可依日期/廠商/品名篩選分頁、migration 可重跑可回滾。

---

## Phase 2 — 登入與權限

### 建立第一個 admin

```bash
cd backend && . .venv/Scripts/activate
$env:FLASK_APP="wsgi.py"; $env:DATABASE_URL="postgresql+psycopg://shitian_app:devpassword@localhost:5433/shitian"
flask create-admin --username admin --display-name 管理員
# 會互動詢問密碼;密碼以 bcrypt 雜湊儲存
```

### 認證/授權設計

- **認證**:Flask-Login session cookie(`HttpOnly`/`SameSite=Lax`/正式環境 `Secure`)。
- **授權**:`admin` 可改主檔、刪資料、看全部;`operator` 只能建單、改自己建的單。
- **CSRF**:登入後前端取得 `csrf`(回應 body 與 `csrf_token` cookie 各一份),
  之後 `POST/PUT/DELETE` 需在 `X-CSRF-Token` header 帶上,後端用同步器 token 比對。
- **rate limit**:login 端點 10 次/分(開發用記憶體儲存;正式環境改 Redis,見 Phase 8)。

### 驗證 Phase 2

```bash
DATABASE_URL="sqlite:///smoke2.db" SECRET_KEY=test SESSION_COOKIE_SECURE=false PYTHONPATH=. python tests/smoke_phase2.py
```

---

## Phase 3 — 前端(表單模式 + 資料管理)

### 本機跑前端

```bash
# 1. 先確保 db 與後端有起來
docker compose up -d db
cd backend && . .venv/Scripts/activate
$env:FLASK_APP="wsgi.py"; $env:SESSION_COOKIE_SECURE="false"
$env:DATABASE_URL="postgresql+psycopg://shitian_app:devpassword@localhost:5433/shitian"
flask db upgrade
flask create-admin --username admin --display-name 管理員   # 第一次才需要
python wsgi.py        # 後端在 http://localhost:8000

# 2. 另開終端跑前端
cd frontend && npm run dev   # http://localhost:5173(/api 自動 proxy 到 8000)
```

開 http://localhost:5173 → 用 admin 登入 → 建單 / 清單 / 主檔。

### 前端結構與狀態管理

- `src/api/`:`client.ts`(fetch 封裝:帶 cookie、自動補 CSRF header、解析 `{data,error}`、401 攔截)、`resources.ts`(各資源呼叫)。
- `src/lib/`:`types.ts`(型別)、`AuthContext.tsx`(登入狀態用 React Context)、`format.ts`(金額/日期)。
- `src/components/`:`ui.tsx`(Button/Input/Card…大字大點擊區)、`Layout.tsx`(RWD 導覽)、`ProtectedRoute.tsx`。
- `src/pages/`:登入、訂單清單、建單/改單、主檔、報表(Phase 6)。

> **狀態管理選擇**:登入狀態用 Context(全域、輕量);各頁資料用區域 `useState/useEffect`。
> 不引入 Redux / React Query —— 這個規模用原生 hooks 最好懂、相依最少。

### RWD 策略(手機 / 平板 / 筆電同一套)

- **手機**:單欄表單、訂單以卡片呈現、底部固定導覽。
- **平板**:雙/三欄表單、底部導覽。
- **筆電(lg+)**:左側邊欄導覽、訂單用完整表格。
- 全站基準字級 18px、主要按鈕/輸入框高度 ≥ 48px(長輩友善、觸控好點)。

---

## Phase 4 — PDF + 列印

- `GET  /api/orders/{id}/pdf`:即時產生 PDF 預覽/下載(瀏覽器直接開)。
- `POST /api/orders/{id}/pdf`:產生並封存到 `ARCHIVE_DIR/<YYYY-MM>/<單號>.pdf`。
- `POST /api/orders/{id}/print` body `{"target":"normal"|"dotmatrix"}`:送到 CUPS 佇列。

> **為什麼列印走伺服器端**:前端只發「印這張」指令,由 NAS 上的 CUPS 送印 →
> 平板/手機免裝驅動、不依賴特定裝置,最穩定。
>
> **環境注意**:WeasyPrint 需要系統庫(pango/cairo)+ 中文字型、CUPS 是 Linux 專屬,
> 都已包進**後端 Docker 映像**。Windows 本機 venv 沒有這些 → `/pdf` 會回 503 `pdf_unavailable`,
> 屬正常。**要測 PDF 請用 Docker 跑後端**(見下方),或部署到 NAS。

驗證(在後端容器內,中文 PDF 已實測可產生):
```bash
docker compose build backend
docker compose run --rm --no-deps -v "${PWD}/backend/tests:/app/tests" \
  -e SECRET_KEY=test -e DATABASE_URL=sqlite:// -e PYTHONPATH=/app \
  backend python tests/smoke_pdf.py
```

---

## 一個瀏覽器請求怎麼流動?

1. 瀏覽器送 `https://localhost/...` 到 **Caddy**(唯一對外的服務)。
2. Caddy 看路徑:`/api/*` 轉給 **backend(Flask+gunicorn:8000)**,其餘轉給 **frontend(nginx 提供 React 靜態檔)**。
3. 後端需要資料時才去連 **db(PostgreSQL)**(Phase 1 起)。
4. `frontend / backend / db` 都只在 Docker 內部網路,**不直接對公網曝露**,安全邊界由 Caddy 守住。

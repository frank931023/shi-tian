# 開發步驟與 AI Prompt(逐階段可直接貼上)

> 用法:照階段順序進行。每個階段先讀「目標/學習點」,再把「給 AI 的 Prompt」貼進 Cursor / Claude Code,做完用「驗收標準」自我檢查。
> 重要心態:**你是來學架構的,不是來看 AI 自動生成的。** 每個階段都要求 AI「先說明設計與取捨,再動手,並解釋為什麼」。
> 前置:把 `CLAUDE.md`(開發規範)放在 repo 根目錄,讓 AI 全程遵守。

---

## Phase 0 — 環境與專案骨架

**目標**:建立可運行的空骨架,理解各服務怎麼串。
**學習點**:Docker、docker-compose、前後端分離、反向代理。

**給 AI 的 Prompt**
```
我要建立一個自架的單據管理系統,跑在我的 NAS 上。請先閱讀 CLAUDE.md 並遵守。

這個 Phase 只做「可運行的空骨架」,不要寫業務功能。請:
1. 先用文字說明你打算的 monorepo 資料夾結構與每個服務的職責,讓我確認後再動手。
2. 建立結構:
   - /frontend  : React + Vite + TypeScript + Tailwind,一個 Hello 頁面
   - /backend   : Flask + Gunicorn,一個 GET /api/health 回 {"status":"ok"}
   - /db        : PostgreSQL(用官方 image,不需自訂)
   - docker-compose.yml:把 frontend / backend / db / caddy(反向代理)串起來
   - Caddyfile:/api/* 轉給 backend,其餘轉給 frontend
   - .env.example(列出需要的環境變數)與 .gitignore(排除 .env、node_modules、pgdata)
3. 寫一份 README,說明如何 `docker compose up` 起整套、以及如何驗證 health。
4. 完成後,用 3-5 句說明「一個瀏覽器請求是怎麼經過 caddy → frontend/backend → db」的流程。

每一步先解釋為什麼這樣設計,再給程式碼。不要一次倒一大包,我們一步步來。
```

**驗收標準**
- `docker compose up` 後能開到前端 Hello 頁。
- `curl https://<本機或網域>/api/health` 回 `ok`。
- `.env` 不在 git 追蹤內。
- 你能用自己的話講出請求流經哪些服務。

---

## Phase 1 — 資料模型 + CRUD API

**目標**:建立資料庫結構與訂單/主檔的 REST API。
**學習點**:資料庫設計、ORM、migration、REST、輸入驗證。

**給 AI 的 Prompt**
```
延續上一個 Phase。這個 Phase 做後端資料層與 API,先不做前端畫面。

1. 用 SQLAlchemy 建立 models:users, companies, products, process_items, orders, order_items, audit_log
   - 欄位請依我提供的 schema 草案(我會貼上,或參考 01_系統架構與技術建議.md 的 §3)。
   - 特別注意 order_items 的 product_name / spec 要做「反正規化快照」,請向我解釋為什麼。
2. 導入 Alembic,產生第一個 migration,並說明 migration 的概念與好處。
3. 實作 REST API(先不做 auth,下一個 Phase 再加):
   - companies / products / process-items 的查詢與新增
   - orders 的 list(支援 from/to/vendor_id/product/status/q 篩選 + 分頁)、get、create(含單身)、update、delete
   - 建單與改單時,金額一律後端重算,不信任前端傳入的 amount。
4. 用 marshmallow 或 pydantic 做輸入驗證,回傳統一格式 {data, error}。
5. 寫幾個範例 curl 或一支簡單測試,證明 CRUD 正常。

先把 model 設計與關聯講清楚再寫,寫完解釋「篩選查詢」在 SQLAlchemy 是怎麼組的。
```

**驗收標準**
- 能用 curl 建立公司、品名、然後建立一張含多個品項的訂單。
- list 端點能正確依日期/廠商/品名篩選並分頁。
- 改了品名主檔,不影響舊單據顯示(快照生效)。
- migration 可重跑、可回滾。

---

## Phase 2 — 登入與權限

**目標**:加上帳密登入與角色分權。
**學習點**:認證 vs 授權、密碼雜湊、session/JWT、最小權限。

**給 AI 的 Prompt**
```
這個 Phase 加上認證與授權,並把 audit_log 接上。

1. 實作登入:POST /api/auth/login、/logout、GET /api/auth/me。
   - 密碼用 bcrypt 雜湊儲存,請示範如何安全比對。
   - 自用系統優先用 session cookie(HttpOnly/Secure/SameSite);若你建議 JWT,請說明取捨。
2. 角色:admin 與 operator。
   - operator 只能建單/改自己的單;admin 可改主檔、刪資料、看全部。
   - 用 decorator 或 middleware 統一做權限檢查。
3. 所有寫入操作寫入 audit_log(誰、何時、做了什麼)。
4. 加上基本 rate limit(至少對 login)。
5. 提供一個 CLI 或 seed script 建立第一個 admin 帳號。

請先解釋「認證」與「授權」的差別,以及你選 session/JWT 的理由,再實作。
```

**驗收標準**
- 未登入打受保護端點會被擋。
- operator 嘗試刪資料被拒;admin 可以。
- 資料庫看得到 bcrypt 雜湊(非明碼)。
- login 有 rate limit。

---

## Phase 3 — 表單模式 + 資料管理介面 + 篩選

**目標**:先用「簡單的表單 UI」把資料流整個打通(這是刻意先做的)。
**學習點**:前端狀態管理、串 API、表單處理、清單/篩選 UX。

**給 AI 的 Prompt**
```
這個 Phase 做筆電用的「表單模式」與資料管理畫面,把前後端串起來。先求「能用、資料流正確」,不追求華麗。

1. 登入頁 + 登入狀態管理(React)。
2. 建單表單(表單模式):
   - 選廠商/接收(下拉,資料來自 API)、加品項(逐行:品名、規格、加工項目、淨重、數量、單位、單價,金額自動算)、備註。
   - 送出呼叫 POST /api/orders。
3. 訂單清單頁:
   - 表格 + 篩選(日期區間 / 廠商 / 品名 / 狀態)+ 關鍵字搜尋 + 分頁。
   - 可編輯、刪除、「複製成新單」。
4. 主檔管理頁(admin):公司、品名、加工項目的 CRUD。
5. 統一處理 API 錯誤與載入狀態。

請先說明你的前端資料夾結構與狀態管理方式(用什麼、為什麼),再實作。元件請保持小而清楚。
```

**驗收標準**
- 能在筆電上登入 → 建單 → 在清單看到 → 篩選查到 → 編輯/複製/刪除。
- 金額前端顯示與後端重算一致。
- 重新整理後登入狀態與資料正確。

---

## Phase 4 — PDF 產生 + 一般印表機列印

**目標**:把單據輸出成 PDF,並能送到一般印表機(C 方案)。
**學習點**:伺服器端產生文件、列印架構、CUPS。

**給 AI 的 Prompt**
```
這個 Phase 做 PDF 與「一般印表機」列印(暫不做點陣套表)。

1. 後端 POST /api/orders/{id}/pdf:用 WeasyPrint 以 HTML/CSS 排版產生單據 PDF。
   - 版面參考現行移轉單的欄位(廠商單位/接收單位/日期/單號/品名/規格/加工項目/淨重/數量/單位/單價/金額/備註)。
   - PDF 存到 NAS 的封存資料夾,並可回傳給前端預覽/下載。
2. 後端 POST /api/orders/{id}/print:把 PDF 送到 CUPS 的 `normal` 佇列。
   - 請說明 CUPS 佇列概念,以及後端如何呼叫(lp / pycups / CUPS IPP)。
   - 列印走伺服器端(前端只發指令),請解釋為什麼這比瀏覽器直接列印穩定。
3. 前端:訂單頁加「預覽 PDF」與「列印」按鈕。

先說明你選 WeasyPrint 的理由與排版策略,再實作。把列印的服務邊界(誰呼叫誰)畫清楚。
```

**驗收標準**
- 能對任一訂單產生排版正確的 PDF 並預覽。
- 按「列印」能從一般印表機印出(若還沒接印表機,先用 CUPS 的 PDF 虛擬印表機驗證流程)。
- PDF 有封存到 NAS。

---

## Phase 5 — 平板觸控建單模式

**目標**:做出長輩友善的觸控建單介面。
**學習點**:響應式/觸控 UX、元件設計、可用性。

**給 AI 的 Prompt**
```
這個 Phase 做平板用的「觸控模式」建單,給長輩使用。資料與 API 沿用既有的,不要另開一套後端。

設計需求:
- 字級大(基準 18-22px,主要按鈕更大)、高對比、點擊區 >= 48px。
- 點選式建單:廠商/接收/品名/加工項目用大卡片或大按鈕「點」選(常用值優先顯示);規格提供歷史值快選 + 數字鍵盤輸入。
- 逐行「+ 新增品項」,品項可拖曳排序(用成熟的 dnd 套件,僅用於排序)。
- 即時預覽整張單;確認後一鍵「產生 PDF + 列印」。
- 流程步驟化,一次只做一件事,避免長輩迷路;每個破壞性操作要二次確認。

請先提出觸控模式的畫面流程(wireframe 描述)與元件拆法讓我確認,再實作。並說明你如何讓它與表單模式共用資料層。
```

**驗收標準**
- 在平板(或瀏覽器縮到平板尺寸)能用「點」的完成一張單,幾乎不打字。
- 字夠大、按鈕好按、預覽清楚。
- 與表單模式共用同一份資料,互通。

---

## Phase 6 — 報表 + Bento + 圖表

**目標**:週/月與自訂區間的報表,bento 版面 + 圓餅/長條。
**學習點**:資料聚合(SQL group by)、API 設計、前端視覺化。

**給 AI 的 Prompt**
```
這個 Phase 做報表。

1. 後端聚合端點:
   - GET /api/reports/summary?from=&to=&group_by=week|month  → 期間總額、總筆數、總數量、每期金額
   - GET /api/reports/by-product?from=&to=  → 各品名占比
   - GET /api/reports/by-company?from=&to=  → 各廠商占比
   請用 SQL 的 group by 在資料庫端聚合,解釋為什麼不要把全部資料拉回前端再算。
2. 前端報表頁:
   - 時間區間選擇(週/月/自訂)。
   - Bento grid 版面:數字卡(總額/筆數/數量)+ 圓餅圖(品名或廠商占比)+ 長條圖(每週/每月金額)。
   - 用 Recharts。版面響應式。
3. 注意空資料與載入狀態。

先說明聚合查詢怎麼寫、效能上要注意什麼(索引),再實作前端。
```

**驗收標準**
- 切換週/月與自訂區間,數字與圖表正確變動。
- 圓餅、長條、數字卡都正常呈現,版面是 bento 風格。
- 聚合在資料庫端完成(非前端硬算)。

---

## Phase 7 —(進階,選做)點陣套表列印

**目標**:把資料精準填進現成三聯複寫單。
**學習點**:底層列印控制、座標定位、ESC/P。

**給 AI 的 Prompt**
```
這個 Phase 做點陣式印表機的「套表列印」,把資料填進現成的三聯複寫單空格。這是進階且需要反覆校正的功能。

1. 先幫我規劃做法,並比較兩條路線的優缺點讓我選:
   (a) 用 ReportLab 以精準座標輸出 PDF,送點陣機。
   (b) 直接組 ESC/P 控制指令,走 CUPS 的 raw 佇列。
2. 設計一個「座標設定檔」(每個欄位的 x/y、字級),讓我能微調而不用改程式。
3. 提供一個「校正頁」功能:印出帶座標格線的測試頁,協助我量測與對位。
4. 後端 POST /api/orders/{id}/print 增加 `target=dotmatrix` 選項,走點陣佇列。

請先解釋 ESC/P 與點陣套表的原理,再實作。我會用校正頁反覆微調 offset。
```

**驗收標準**
- 印出的資料能對準現成三聯單的欄位。
- offset 可透過設定檔調整,不用改程式。
- 三聯複寫清楚。

---

## Phase 8 — 上線硬化(部署與資安)

**目標**:正式上線到 NAS,做好 HTTPS、備份、資安。
**學習點**:部署、維運、資安實務。

**給 AI 的 Prompt**
```
這個 Phase 把系統正式部署到我的 NAS 並做安全硬化。請依 01_系統架構與技術建議.md 的 §7 資安檢查清單逐項處理。

1. 正式 docker-compose:多階段 build、healthcheck、restart 策略、Postgres 資料掛 NAS 路徑。
2. Caddy 申請我的網域的 Let's Encrypt 憑證,HTTP 轉 HTTPS;確認 Postgres/Flask 不對外曝露。
3. 遠端存取:幫我規劃 Tailscale 或 WireGuard 的 VPN-only 方案(優先),並說明若改公網要加哪些防護(fail2ban、rate limit、只開 443)。
4. 每日 pg_dump 自動備份到 NAS,並提供還原步驟;備份遵循 3-2-1 原則。
5. 列一份「上線前檢查表」與「日常維運清單」(更新、備份、看日誌)。

每一項都先說明風險與為什麼這樣做,再給設定。
```

**驗收標準**
- 用網域 + HTTPS 能正常使用,憑證有效。
- 對外只有反向代理(或只走 VPN);DB/後端不可直連。
- 自動備份運作,且你實際還原過一次確認可用。
- 你能照「維運清單」自行維護。

---

## 附:每個階段都別忘了問 AI 的三句話
1. 「**為什麼**這樣設計?有哪些替代方案、取捨是什麼?」
2. 「這段如果未來要擴充(例如加語音建單),**會不會卡住**?」
3. 「有沒有**資安**或效能的風險?怎麼防?」

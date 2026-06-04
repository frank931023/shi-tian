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
- [ ] Phase 1 — 資料模型 + CRUD API
- [ ] Phase 2 — 登入與權限
- [ ] Phase 3 — 表單模式 + 資料管理介面
- [ ] Phase 4 — PDF + 一般印表機列印
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

## 一個瀏覽器請求怎麼流動?

1. 瀏覽器送 `https://localhost/...` 到 **Caddy**(唯一對外的服務)。
2. Caddy 看路徑:`/api/*` 轉給 **backend(Flask+gunicorn:8000)**,其餘轉給 **frontend(nginx 提供 React 靜態檔)**。
3. 後端需要資料時才去連 **db(PostgreSQL)**(Phase 1 起)。
4. `frontend / backend / db` 都只在 Docker 內部網路,**不直接對公網曝露**,安全邊界由 Caddy 守住。

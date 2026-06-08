# NAS 部署上手指南(開發 / 正式 環境分離)

> 這份是「照著做」版本。看不懂舊的 `部署與維運.md` 沒關係,直接照這份的步驟一步步來。
> 指令都可以複製貼上,遇到要改的地方會標 **← 改這裡**。

---

## 0. 先搞懂三個檔案在做什麼(很重要)

這個專案用 **Docker Compose**,啟動時會把幾個檔案「疊」起來:

| 檔案 | 角色 | 何時用 |
|---|---|---|
| `docker-compose.yml` | **基底**:定義 5 個服務(proxy / frontend / backend / db / redis),dev 與 prod 共用 | 永遠 |
| `docker-compose.override.yml` | **開發專用**:把 db、backend 對你電腦開埠(方便直連測試)。Docker 會「自動」疊上去 | 開發 |
| `docker-compose.prod.yml` | **正式專用**:強制 HTTPS 安全旗標、Redis 限流、DB 資料存到 NAS 實體路徑 | 正式 |
| `.env` | **這台機器的設定值**(密碼、網域…)。dev / prod 各自一份內容不同 | 永遠 |

**關鍵觀念:同一份程式碼,靠「用哪個 compose 疊法 + 哪個 `.env`」決定它是開發還是正式。**

已經幫你準備好兩個啟動腳本:
- `sh scripts/dev-up.sh` → 基底 + 開發 override(自動)
- `sh scripts/prod-up.sh` → 基底 + 正式 prod(**不**套開發 override)

---

## 1. 開發 vs 正式 差在哪

| | 開發(development) | 正式(production) |
|---|---|---|
| 跑在哪 | **你的電腦**(localhost) | **NAS** |
| 連線 | http(本機) | **https(必須)** |
| `.env` 來源 | `.env.dev.example` | `.env.prod.example` |
| `SESSION_COOKIE_SECURE` | `false` | `true` |
| 密碼 / SECRET_KEY | 隨便的開發值 | **強密碼、亂數** |
| 資料庫資料 | 專案內 `./pgdata` | **NAS 實體路徑 + 備份** |
| 啟動 | `sh scripts/dev-up.sh` | `sh scripts/prod-up.sh` |

> ⚠️ **最常見的坑**:正式環境的登入 cookie 設了 `Secure`,**只有走 HTTPS 才能登入成功**。用純 http(例如 `http://NAS的IP`)會「帳密對了卻一直登不進去」。所以正式一定要有 HTTPS(見 §3-e)。

---

## 2. 推薦做法(最簡單,先照這個)

> **開發留在你的電腦,正式部署到 NAS。** 兩邊資料庫各自獨立,天生分離,不會互相影響。

- 開發(你電腦,維持現狀):`sh scripts/dev-up.sh` → 開 `https://localhost`
- 正式(NAS):照下面 §3 做一次

如果你「真的」想在**同一台 NAS** 同時跑開發和正式兩套,看 §6(進階)。

---

## 3. 把「正式環境」部署到 NAS(逐步)

### a. 準備 NAS
1. NAS 安裝 **Docker / Container Manager**(Synology)或 **Container Station**(QNAP)。
2. 開啟 **SSH**(控制台 → 終端機與 SNMP → 啟用 SSH),用電腦 SSH 連進 NAS。
   > 之後的指令都是在「SSH 進 NAS 後」打的。

### b. 取得程式碼
在 NAS 上選一個資料夾(例:`/volume1/docker/shitian`):
```sh
mkdir -p /volume1/docker/shitian
cd /volume1/docker/shitian
git clone <你的 GitHub repo 網址> .
```
> 沒裝 git 也可以用 File Station 把整個專案上傳到這個資料夾。

### c. 建立正式用的 `.env`
```sh
cp .env.prod.example .env
```
然後編輯 `.env`,**務必改這幾個**(← 改這裡):
```ini
POSTGRES_PASSWORD=<改成強密碼>                         # ← 改這裡
DATABASE_URL=postgresql+psycopg://shitian_app:<同上密碼>@db:5432/shitian   # ← 密碼要跟上面一致
SECRET_KEY=<用下面指令產生的一長串亂數>                 # ← 改這裡
SITE_ADDRESS=your.domain.tw                            # ← 你的網域(見 e)
FRONTEND_ORIGIN=https://your.domain.tw                 # ← 同網域
```
產生 SECRET_KEY(在電腦或 NAS 任一台執行):
```sh
python -c "import secrets; print(secrets.token_hex(32))"
```
> `.env` 不會進 git(已被忽略),機密只留在 NAS 上。

### d. 把資料庫資料存到 NAS 實體路徑(才不會被砍掉)
編輯 `docker-compose.prod.yml`,把 db 的 volume 改成你的實體路徑(← 改這裡):
```yaml
  db:
    volumes:
      - /volume1/docker/shitian/pgdata:/var/lib/postgresql/data   # ← 改成你的 NAS 路徑
```
並把這個 `pgdata` 資料夾**納入 NAS 的快照/備份**。

### e. 設定 HTTPS(二選一,務必其一)
**方案 1:有網域(對外服務)**
- 把網域 DNS A 紀錄指到 NAS 的公網 IP,對外開放 **80 / 443**。
- `.env` 的 `SITE_ADDRESS` 填網域 → Caddy 會自動申請 Let's Encrypt 憑證、自動把 http 轉 https。**不用自己用憑證。**

**方案 2:不想開公網(推薦,較安全)→ 用 Tailscale**
- NAS 與你的裝置都裝 **Tailscale**、加入同一個帳號(tailnet)。
- 用 Tailscale 的 **HTTPS 網域(MagicDNS)** 當 `SITE_ADDRESS`(Tailscale 會發憑證),只有你自己的裝置連得到,不曝露到網際網路。

> 重點:無論哪個方案,目的都是讓使用者用 **https://** 連進來,登入 cookie 才會生效。

### f. 啟動正式環境
```sh
cd /volume1/docker/shitian
sh scripts/prod-up.sh
```
這會用「基底 + prod」啟動,並自動:
- 建好 PostgreSQL、Redis、後端、前端、Caddy。
- 後端啟動時**自動套用資料庫 migration**(建表/升級 schema),你不用手動跑。

確認服務狀態:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

### g. 建立管理員帳號(第一次才要)
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  flask create-admin --username admin --display-name 管理員
```
會互動式問密碼(輸入兩次)。

### h. 灌入主檔資料(廠商/品名/規格…)
把專案的 `realdata/` 資料灌進資料庫:
```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  flask seed-real --path /app/../realdata
```
> 若路徑找不到,改用掛載方式:把 `realdata` 掛進容器再灌(同開發機做法)。realdata 在 repo 根目錄。

### i. 驗證
用瀏覽器開 `https://你的網域`(或 Tailscale 網域)→ 用 admin 登入 → 應該能進系統、看到廠商/品名等資料。

---

## 4. 之後要更新版本(改了程式、重新部署)

在 NAS 的專案資料夾:
```sh
cd /volume1/docker/shitian
git pull                 # 取得最新程式
sh scripts/prod-up.sh    # 重新建置 + 重啟(migration 會自動跑)
```
- 資料**不會不見**(DB 存在 NAS 實體路徑)。
- 若這版有新欄位,後端啟動會自動升級資料庫。

> 進階:你已經設好 GitHub Actions CD,會自動把映像推到 GHCR。若想改成「NAS 直接拉現成映像」而不在 NAS build,可改用 `docker-compose.images.yml`(見該檔註解)。一般情況用上面的 `git pull + prod-up.sh` 最單純。

---

## 5. 備份與還原(很重要,先設好)

**每日自動備份**(用 NAS 的排程或 crontab,每天凌晨跑):
```sh
cd /volume1/docker/shitian && sh scripts/backup.sh
```
- 會把資料庫 dump 成 `backups/shitian-YYYYmmdd-HHMMSS.sql.gz`,保留最近 14 天。
- 請再把 `backups/` 同步到**另一個地方**(外接硬碟/雲端),符合 3-2-1 原則。

**還原**(萬一要救回):
```sh
sh scripts/restore.sh backups/shitian-20260608-020000.sql.gz
```
> 上線前**先實際還原一次到測試庫**,確認備份真的能用(沒驗證過的備份 = 沒有備份)。

---

## 6.(進階)同一台 NAS 同時跑「開發 + 正式」兩套

如果你想在 NAS 上同時有一個 prod、一個給自己測試的 dev,用 **不同 compose 專案名(-p)+ 不同 `.env` + 不同對外埠**,兩套資料庫完全獨立:

```sh
# 正式(用 .env.prod 內容,對外 80/443)
docker compose -p shitian-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 開發/測試(另一份 .env.dev,Caddy 改用別的埠或別的網域)
docker compose -p shitian-dev --env-file .env.dev \
  -f docker-compose.yml up -d --build
```
注意事項:
- 兩套要用**不同的 `SITE_ADDRESS`**(不同網域/埠),否則 Caddy 80/443 會打架。
- 兩套要用**不同的 DB volume 路徑**,資料才不會混在一起。
- `-p` 專案名不同 → 容器、網路、資料卷都各自獨立。

> 多數情況不需要這樣;**開發留在你電腦**(§2)最省事。

---

## 7. 疑難排解

| 症狀 | 原因 / 解法 |
|---|---|
| 帳密對了卻登不進去 | 你是用 **http** 連的,但正式 cookie 要 **https**。改用 https 網域/Tailscale(§3-e)。 |
| 開網域沒反應 / 憑證錯誤 | DNS 沒指到 NAS、或 80/443 沒開、或 `SITE_ADDRESS` 沒填網域。 |
| 看後端日誌 | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend` |
| 重啟全部 | `sh scripts/prod-up.sh`(等同重建重啟) |
| 忘記管理員密碼 | 再跑一次 `flask create-admin` 用**新帳號**,或進 DB 重設(進階)。 |
| 資料庫升級失敗 | 看 backend 日誌的 migration 錯誤訊息;先確認是用 PostgreSQL(本系統正式只支援 PostgreSQL)。 |

---

## 上線前最終檢查清單
- [ ] `.env` 用 `.env.prod.example` 為底,改了強密碼、SECRET_KEY,且 `.env` 不在 git。
- [ ] `SITE_ADDRESS` 是你的網域(或 Tailscale 域名),能走 **HTTPS**。
- [ ] `docker-compose.prod.yml` 的 db volume 指到 **NAS 實體路徑**,並納入快照。
- [ ] 用 `sh scripts/prod-up.sh` 啟動(沒套到開發 override)。
- [ ] 已 `flask create-admin` 建管理員、`flask seed-real` 灌主檔。
- [ ] 用網域 https 能登入。
- [ ] 備份 cron 已設定,且**還原驗證過一次**。

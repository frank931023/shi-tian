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

## 3. 把「正式環境」部署到 NAS(完整逐步,從零開始)

> 以下以 **Synology(DSM 7)** 為例,全程在 **Windows** 操作。QNAP 幾乎一樣,只是套件名稱不同(下面會註明)。
> 不會指令沒關係,**一步一步照打/照點**就好。每個指令我都說明在做什麼。

### 步驟 1:找到 NAS 的區網 IP
- 開瀏覽器登入你的 NAS 管理介面(平常進 DSM 的網址,例如 `http://192.168.1.50:5000`)。
- 那個 `192.168.1.50` 就是 NAS 的 IP,**記下來**(你的會不一樣)。
- 找不到的話:路由器後台的「裝置清單」,或 Synology 官網下載「Synology Assistant」會列出來。

### 步驟 2:在 NAS 開啟 SSH(才能用指令連進去)
- DSM → **控制台** → **終端機與 SNMP** → 勾選 **「啟用 SSH 功能」**,連接埠保持 **22** → **套用**。
- (QNAP:控制台 → 系統 → Telnet/SSH → 勾「允許 SSH 連線」。)

### 步驟 3:安裝 Docker(用圖形介面,不用指令)
- DSM → **套件中心** → 搜尋 **「Container Manager」**(舊版 DSM 叫「Docker」)→ **安裝**。
- 裝好後,`docker` 與 `docker compose` 指令就能用了。
- (QNAP:App Center → 安裝 **「Container Station」**。)

### 步驟 4:建立放程式的資料夾
- DSM → **File Station** → 進入 **docker** 這個共用資料夾(Container Manager 安裝時通常會自動建)。
- 在裡面**新增資料夾** `shitian`。
- 這個資料夾的完整路徑就是 **`/volume1/docker/shitian`**(下面會一直用到)。

### 步驟 5:把程式放進 NAS(用 File Station 上傳,最直覺)
- 在你**電腦**上,進到專案資料夾 `C:\Users\frank\Desktop\code\shi-tian`。
- 把裡面**所有東西**(`backend/`、`frontend/`、`realdata/`、`docker-compose*.yml`、`Caddyfile`、`scripts/`、`.env.prod.example` …)上傳到 NAS 的 `docker/shitian` 資料夾。
  - File Station → 進 `shitian` → 上方 **上傳** → 選檔案/資料夾。
  - 不用上傳 `.venv`、`node_modules`、`pgdata`、`backups` 這些(本來就不該帶)。
- (會用 Git 的進階做法:在步驟 6 連上 SSH 後 `cd /volume1/docker/shitian` 再 `git clone <你的repo網址> .`。不會就用上傳即可。)

### 步驟 6:用 SSH 從 Windows 連進 NAS(Windows 內建,免裝軟體)
- 在 Windows 開 **PowerShell**(就是你現在這個視窗)。
- 輸入(把 `admin` 換成你的 DSM 管理員帳號、IP 換成步驟 1 記的):
  ```powershell
  ssh admin@192.168.1.50
  ```
- 第一次會出現 `Are you sure you want to continue connecting (yes/no)?` → 打 **yes** 按 Enter。
- 接著要你輸入密碼:打你的 **DSM 登入密碼**(**打字不會顯示**是正常的,打完按 Enter)。
- 看到類似 `admin@NAS:~$` 的提示字,就代表**連上了**。
- 切換成系統管理權限(Synology 必須):
  ```sh
  sudo -i
  ```
  再輸入一次密碼。提示字變成 `root@NAS:~#` 就對了。

### 步驟 7:進到程式資料夾、確認檔案都在
```sh
cd /volume1/docker/shitian
ls
```
- `ls` 會列出資料夾內容,應該看得到 `docker-compose.yml`、`backend`、`frontend`、`realdata` 等。沒看到就是步驟 5 沒上傳對位置。

### 步驟 8:建立正式設定檔 `.env`
```sh
cp .env.prod.example .env
```
- 這是「複製範本成 .env」。接著要**編輯 .env**,**用圖形介面改最簡單**:
  - File Station → 進 `docker/shitian` → 右上 **設定**(齒輪)勾「**顯示隱藏的檔案**」(`.env` 是隱藏檔)。
  - 對 `.env` 按右鍵 → **以文字編輯器開啟** → 改完**儲存**。
- **要改的只有這幾行**(其他不用動):
  ```ini
  POSTGRES_PASSWORD=這裡填一組強密碼
  DATABASE_URL=postgresql+psycopg://shitian_app:這裡填同一組密碼@db:5432/shitian
  SECRET_KEY=這裡填一串亂數(見下)
  SITE_ADDRESS=你的網域或Tailscale域名(見步驟10)
  FRONTEND_ORIGIN=https://你的網域(跟上面同一個)
  ```
- **產生 SECRET_KEY**:在你**電腦的 PowerShell**(你有 Python)執行,把印出來的長字串貼進去:
  ```powershell
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
- (不想用 File Station、想在 SSH 裡改的話:輸入 `nano .env` → 用方向鍵移動游標改字 → 改完按 `Ctrl+O` 再 `Enter` 存檔 → `Ctrl+X` 離開。)

### 步驟 9:把資料庫資料指到 NAS 實體路徑(避免重建時資料消失)
- 同樣用 File Station 文字編輯器開 `docker-compose.prod.yml`,找到 `db:` 底下的 `volumes:`,把那行改成:
  ```yaml
  - /volume1/docker/shitian/pgdata:/var/lib/postgresql/data
  ```
- 之後到 DSM → **控制台 → 快照** 或你的備份方案,把 `docker/shitian` 納入備份。

### 步驟 10:設定 HTTPS(二選一,**務必其一**,否則登不進去)
**方案 A:有自己的網域(要對外服務)**
- 把網域的 DNS **A 紀錄**指到 NAS 的公網 IP,路由器把 **80、443** 轉發到 NAS。
- `.env` 的 `SITE_ADDRESS` 填你的網域 → Caddy 會**自動申請免費憑證、自動把 http 轉 https**,你不用自己用憑證。

**方案 B:不想開放到網際網路(較安全,推薦)→ 用 Tailscale**
- NAS 套件中心安裝 **Tailscale**,你的電腦/平板也裝,登入**同一個 Tailscale 帳號**。
- 用 NAS 的 Tailscale 網域(MagicDNS,形如 `xxx.your-tailnet.ts.net`)當 `SITE_ADDRESS`。只有你自己的裝置連得到,不曝露到公網。

> 為什麼一定要 HTTPS:正式登入的 cookie 設了「只走 HTTPS」,用 `http://IP` 會「**帳密對了卻一直登不進去**」。

### 步驟 11:啟動!(回到 SSH 視窗,在 `root@NAS:/volume1/docker/shitian#`)
```sh
docker compose up -d --build
```
- 因為 `.env` 裡的 `COMPOSE_FILE` 已指定正式疊法,**直接 `docker compose` 就是正式環境**,不用加一堆 `-f`。
- 第一次會**建置映像,需要幾分鐘**(會跑很多文字,正常)。
- 完成後看狀態:
  ```sh
  docker compose ps
  ```
  五個服務(proxy / frontend / backend / db / redis)都 `Up` 就成功。後端啟動時會**自動建好資料表**。

### 步驟 12:建立管理員帳號(只有第一次)
```sh
docker compose exec backend flask create-admin --username admin --display-name 管理員
```
- 會問你**密碼兩次**(打字不顯示)。這就是之後登入系統的帳密。

### 步驟 13:灌入主檔資料(廠商/品名/規格…)
```sh
docker compose run --rm -v /volume1/docker/shitian/realdata:/seed backend flask seed-real --path /seed
```
- 這會把你上傳的 `realdata/` 內容灌進資料庫(廠商含統一編號、品名、加工項目、規格等)。
- 成功會印出「已匯入:廠商 … / 接收 … / 品名 … / 加工 … / 規格 …」。

### 步驟 14:驗證成功
- 用瀏覽器開 **`https://你的網域`**(或 Tailscale 域名)。
- 用步驟 12 建的 **admin 帳密登入** → 能進系統、看到廠商/品名等資料 → **完成!** 🎉

> 之後要關閉 SSH 視窗:輸入 `exit` 兩次(先離開 root、再離開 SSH)即可,服務會在 NAS 背景繼續跑。

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

"""應用設定:集中從環境變數讀取,避免把設定散落各處。

為什麼這樣設計:
- 機密(SECRET_KEY、DB 密碼)一律從環境變數來,絕不寫死在程式裡(CLAUDE.md §5)。
- 用一個 Config 物件集中管理,日後要分 dev/prod 設定時,只需在這裡擴充。
"""

import os


class Config:
    # Flask 用來簽 session cookie 的金鑰;正式環境一定要從 .env 提供。
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-key-change-me")

    # 資料庫連線字串(Phase 1 才會真的使用)。
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "")

    # 前端來源,給 CORS 用(本機開發時前端跑在 5173)。
    FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

    # 是否信任反向代理(Caddy)轉發的 X-Forwarded-* 標頭。
    # 正式環境後端只在內網、前面有 Caddy → true(才能取得真實 client IP 做 rate limit/audit)。
    TRUST_PROXY = os.environ.get("TRUST_PROXY", "true").lower() == "true"

    # session cookie 安全屬性(CLAUDE.md §5)。
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "true").lower() == "true"

    # PDF 封存資料夾(正式環境掛 NAS 路徑;開發預設專案內 archive/)
    ARCHIVE_DIR = os.environ.get("ARCHIVE_DIR", "archive")

    # CUPS 佇列名稱(列印走伺服器端)
    CUPS_NORMAL_QUEUE = os.environ.get("CUPS_NORMAL_QUEUE", "normal")
    CUPS_DOTMATRIX_QUEUE = os.environ.get("CUPS_DOTMATRIX_QUEUE", "dotmatrix")
    # 移轉單紙張尺寸(橫式 21×14cm)。送印時明確告訴 CUPS,避免它用 A4 直式去套、把頁面轉成直式。
    # 若你的印表機紙張不同,改這個環境變數即可(CUPS media 名稱,例:Custom.210x140mm、A5)。
    CUPS_ORDER_MEDIA = os.environ.get("CUPS_ORDER_MEDIA", "Custom.210x140mm")

    # 點陣套表的座標設定檔(可微調 offset/欄位座標而不改程式;Phase 7)
    DOTMATRIX_LAYOUT = os.environ.get("DOTMATRIX_LAYOUT", "config/dotmatrix_layout.json")

    # rate limit 儲存:開發用記憶體;正式多 worker 應用 Redis(redis://redis:6379)
    # Flask-Limiter 會自動讀這個 config key。
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")

    # 單據抬頭(公司資訊),可由環境覆蓋
    COMPANY_NAME_1 = os.environ.get("COMPANY_NAME_1", "旭田興有限公司")
    COMPANY_NAME_2 = os.environ.get("COMPANY_NAME_2", "旭田工業社")
    COMPANY_ADDRESS = os.environ.get("COMPANY_ADDRESS", "台中市大里區仁義路112號")
    COMPANY_TEL = os.environ.get("COMPANY_TEL", "04-2491-4552")
    COMPANY_FAX = os.environ.get("COMPANY_FAX", "04-2491-1453")

    # ---- 聊天機器人(Text-to-SQL,LangGraph + OpenAI)----
    # OpenAI 金鑰:沒設定時聊天機器人會優雅停用(不影響其他功能)。絕不寫死。
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
    CHATBOT_MODEL = os.environ.get("CHATBOT_MODEL", "gpt-4o-mini")
    # 給聊天機器人查資料用的「唯讀」資料庫連線(強烈建議用只有 SELECT 權限的角色)。
    # 未設定則退回主 DATABASE_URL(但查詢仍一律包在 READ ONLY 交易 + 多層防護內)。
    CHATBOT_DATABASE_URL = os.environ.get("CHATBOT_DATABASE_URL", "") or SQLALCHEMY_DATABASE_URI
    # 查詢回傳列數上限、SQL 逾時(毫秒)、可記住的對話輪數
    CHATBOT_MAX_ROWS = int(os.environ.get("CHATBOT_MAX_ROWS", "200"))
    CHATBOT_SQL_TIMEOUT_MS = int(os.environ.get("CHATBOT_SQL_TIMEOUT_MS", "5000"))
    CHATBOT_MEMORY_TURNS = int(os.environ.get("CHATBOT_MEMORY_TURNS", "6"))

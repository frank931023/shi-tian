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

    # session cookie 安全屬性(CLAUDE.md §5)。
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "true").lower() == "true"

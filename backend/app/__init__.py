"""應用工廠(application factory)。

為什麼用工廠模式:
- 可以針對測試 / 開發 / 正式建立不同設定的 app 實例,不會有全域單例的副作用。
- 各 blueprint(路由模組)與擴充套件在這裡集中初始化,結構清楚。
"""

import logging
import os

from flask import Flask

from app.core.config import Config
from app.core.db import db, migrate
from app.core.responses import err
from app.core.security import csrf_protect, limiter, login_manager

log = logging.getLogger(__name__)
_INSECURE_SECRET = "dev-insecure-key-change-me"


def create_app(config_object: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    # 正式環境若忘了設 SECRET_KEY,會用公開可知的預設值 → 任何人都能偽造 session 冒充 admin。
    # 因此在 production 直接 fail-fast,不容許 silently 用 dev 預設。
    if os.environ.get("FLASK_ENV", "").lower() == "production" and (
        not app.config.get("SECRET_KEY") or app.config["SECRET_KEY"] == _INSECURE_SECRET
    ):
        raise RuntimeError("正式環境必須設定一組安全的 SECRET_KEY(不可用預設值)")

    # 後端在 Caddy 之後:信任 X-Forwarded-* 以取得真實 client IP(rate limit / audit 用)
    if app.config.get("TRUST_PROXY"):
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # --- 初始化擴充套件 ---
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    limiter.init_app(app)

    # 對所有寫入請求做 CSRF 檢查(GET 不檢查)
    app.before_request(csrf_protect)

    # import models,讓 Flask-Migrate(Alembic)偵測得到所有資料表
    from app import models  # noqa: F401

    # --- 註冊 blueprints(全部掛在 /api 前綴下,對齊 Caddy /api/* 反代)---
    from app.api.audit import audit_bp
    from app.api.auth import auth_bp
    from app.api.chat import chat_bp
    from app.api.companies import companies_bp
    from app.api.health import health_bp
    from app.api.orders import orders_bp
    from app.api.printing import printing_bp
    from app.api.products import products_bp
    from app.api.reports import reports_bp
    from app.api.users import users_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(audit_bp, url_prefix="/api")
    app.register_blueprint(chat_bp, url_prefix="/api")
    app.register_blueprint(companies_bp, url_prefix="/api")
    app.register_blueprint(products_bp, url_prefix="/api")
    app.register_blueprint(orders_bp, url_prefix="/api")
    app.register_blueprint(reports_bp, url_prefix="/api")
    app.register_blueprint(printing_bp, url_prefix="/api")
    app.register_blueprint(users_bp, url_prefix="/api")

    # --- 自訂 CLI ---
    from app.core.cli import register_cli

    register_cli(app)

    # --- 全域錯誤處理:未預期的例外一律 rollback + 回統一 JSON(不洩漏堆疊)---
    from werkzeug.exceptions import HTTPException

    @app.errorhandler(Exception)
    def handle_unexpected(e):
        if isinstance(e, HTTPException):
            return err("http_error", e.description or e.name, e.code or 500)
        db.session.rollback()
        log.exception("未預期的伺服器錯誤:%s", e)
        return err("server_error", "伺服器發生問題,請稍後再試", 500)

    return app

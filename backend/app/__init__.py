"""應用工廠(application factory)。

為什麼用工廠模式:
- 可以針對測試 / 開發 / 正式建立不同設定的 app 實例,不會有全域單例的副作用。
- 各 blueprint(路由模組)在這裡集中註冊,結構清楚。
"""

from flask import Flask

from app.core.config import Config
from app.core.db import db, migrate


def create_app(config_object: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    # --- 初始化資料層 ---
    db.init_app(app)
    migrate.init_app(app, db)

    # import models,讓 Flask-Migrate(Alembic)偵測得到所有資料表
    from app import models  # noqa: F401

    # --- 註冊 blueprints(全部掛在 /api 前綴下,對齊 Caddy /api/* 反代)---
    from app.api.companies import companies_bp
    from app.api.health import health_bp
    from app.api.orders import orders_bp
    from app.api.products import products_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(companies_bp, url_prefix="/api")
    app.register_blueprint(products_bp, url_prefix="/api")
    app.register_blueprint(orders_bp, url_prefix="/api")

    return app

"""應用工廠(application factory)。

為什麼用工廠模式:
- 可以針對測試 / 開發 / 正式建立不同設定的 app 實例,不會有全域單例的副作用。
- 各 blueprint(路由模組)在這裡集中註冊,結構清楚。
"""

from flask import Flask

from app.core.config import Config


def create_app(config_object: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    # --- 註冊 blueprints ---
    # 所有 API 統一掛在 /api 前綴下,對齊 Caddy 的 /api/* 反代規則。
    from app.api.health import health_bp

    app.register_blueprint(health_bp, url_prefix="/api")

    return app

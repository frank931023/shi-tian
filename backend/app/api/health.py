"""健康檢查端點:用來確認後端活著、反向代理路由正確。

這也是 docker-compose healthcheck 會打的端點。
"""

from flask import Blueprint

from app.core.responses import ok

# 所有 API 都掛在 /api 之下(對齊 Caddy 的 /api/* 路由規則)。
health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health():
    # 注意:這裡為了符合「health 回 {"status":"ok"}」的驗收標準,
    # 直接回傳 status 欄位,而不是包在 data/error 殼裡。
    from flask import jsonify

    return jsonify({"status": "ok"})

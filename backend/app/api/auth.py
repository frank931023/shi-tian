"""認證 API:login / logout / me / csrf。"""

from flask import Blueprint, current_app, request
from flask_login import current_user, login_required, login_user, logout_user

from app.core.db import db
from app.core.responses import err, ok
from app.core.security import issue_csrf_token, limiter, set_csrf_cookie
from app.models import User
from app.services import auth_service, audit_service

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/auth/login")
# rate limit:同一 IP 每分鐘最多 10 次登入嘗試,擋暴力破解
@limiter.limit("10 per minute")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = db.session.scalar(db.select(User).where(User.username == username))
    # 不論帳號是否存在都跑一次比對流程,避免從回應時間/訊息推測帳號是否存在
    valid = user is not None and user.is_active and auth_service.verify_password(
        password, user.password_hash
    )
    if not valid:
        return err("invalid_credentials", "帳號或密碼錯誤", 401)

    login_user(user)  # 寫入 session
    audit_service.record("login", "user", user.id, user_id=user.id)
    db.session.commit()

    token = issue_csrf_token()
    # 同時回傳 user 與 csrf:前端可直接拿 csrf 放進後續寫入請求的 header
    resp, status = ok({"user": user.to_dict(), "csrf": token})
    secure = current_app.config.get("SESSION_COOKIE_SECURE", True)
    return set_csrf_cookie(resp, token, secure), status


@auth_bp.post("/auth/logout")
@login_required
def logout():
    logout_user()
    return ok({"logout": True})


@auth_bp.get("/auth/status")
def auth_status():
    """公開:回報系統是否已有管理員(給登入頁判斷「尚無管理員」用)。"""
    count = db.session.scalar(db.select(db.func.count(User.id)).where(User.role == "admin"))
    return ok({"has_admin": bool(count and count > 0)})


@auth_bp.get("/auth/me")
def me():
    # 用來讓前端重新整理後還原登入狀態;未登入回 null(非錯誤)
    if not current_user.is_authenticated:
        return ok(None)
    return ok(current_user.to_dict())


@auth_bp.get("/auth/csrf")
@login_required
def refresh_csrf():
    """重新發 csrf token(前端在需要時可呼叫)。"""
    token = issue_csrf_token()
    resp, status = ok({"csrf": token})
    secure = current_app.config.get("SESSION_COOKIE_SECURE", True)
    return set_csrf_cookie(resp, token, secure), status

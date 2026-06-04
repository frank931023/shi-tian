"""認證與授權的共用元件:

- login_manager:Flask-Login,管理「目前登入者」與 session。
- limiter:Flask-Limiter,做 rate limit。
- CSRF:同步器 token 模式(synchronizer token)。
- admin_required / owner_or_admin:授權用 decorator。
"""

import secrets
from functools import wraps

from flask import request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_login import LoginManager, current_user

from app.core.responses import err

login_manager = LoginManager()
# key_func 以來源 IP 當限流鍵;預設先不設全域 limit,只在 login 端點掛。
limiter = Limiter(key_func=get_remote_address)

CSRF_HEADER = "X-CSRF-Token"
CSRF_COOKIE = "csrf_token"
# 這些路徑即使是寫入方法也不檢查 CSRF(登入本身、健康檢查)
CSRF_EXEMPT = {"/api/auth/login", "/api/health"}


@login_manager.user_loader
def load_user(user_id: str):
    # Flask-Login 用 session 裡的 user_id 還原 User 物件
    from app.core.db import db
    from app.models import User

    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    # API 不做轉址,直接回 401 JSON(統一格式)
    return err("unauthorized", "請先登入", 401)


# ---------- CSRF ----------
def issue_csrf_token() -> str:
    """產生並存入 session,回傳 token(呼叫端負責下發 cookie)。"""
    token = secrets.token_urlsafe(32)
    session["csrf_token"] = token
    return token


def set_csrf_cookie(response, token: str, secure: bool):
    """下發可被前端 JS 讀取的 csrf cookie(非 HttpOnly,前端要讀來回傳 header)。"""
    response.set_cookie(
        CSRF_COOKIE, token,
        httponly=False, samesite="Lax", secure=secure, path="/",
    )
    return response


def csrf_protect():
    """在 before_request 掛上:對寫入方法檢查 CSRF token。"""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    if request.path in CSRF_EXEMPT:
        return None
    if not request.path.startswith("/api/"):
        return None
    sent = request.headers.get(CSRF_HEADER)
    expected = session.get("csrf_token")
    if not expected or not sent or not secrets.compare_digest(sent, expected):
        return err("csrf_failed", "CSRF 驗證失敗,請重新整理後再試", 403)
    return None


# ---------- 授權 decorator ----------
def admin_required(view):
    """只允許 admin。需搭配 @login_required(放在它外層)。"""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return err("unauthorized", "請先登入", 401)
        if current_user.role != "admin":
            return err("forbidden", "需要 admin 權限", 403)
        return view(*args, **kwargs)

    return wrapper

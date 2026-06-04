"""使用者管理 API(僅 admin)。

資安:回傳一律不含 password_hash;密碼是 bcrypt 雜湊(不可逆),
admin 只能「重設」成新密碼,無法檢視原密碼。
"""

from flask import Blueprint
from flask_login import current_user, login_required

from app.core.db import db
from app.core.responses import err, ok
from app.core.security import admin_required
from app.core.validation import validate_body
from app.models import User
from app.schemas.user import UserCreateIn, UserUpdateIn
from app.services import audit_service, auth_service

users_bp = Blueprint("users", __name__)


@users_bp.get("/users")
@login_required
@admin_required
def list_users():
    users = db.session.scalars(db.select(User).order_by(User.id)).all()
    return ok([u.to_dict() for u in users])


@users_bp.post("/users")
@login_required
@admin_required
@validate_body(UserCreateIn)
def create_user(payload: UserCreateIn):
    if db.session.scalar(db.select(User).where(User.username == payload.username)):
        return err("duplicate", "帳號已存在", 409)
    user = User(
        username=payload.username,
        display_name=payload.display_name or payload.username,
        role=payload.role,
        password_hash=auth_service.hash_password(payload.password),
    )
    db.session.add(user)
    db.session.flush()
    audit_service.record("create_user", "user", user.id, {"role": user.role})
    db.session.commit()
    return ok(user.to_dict(), 201)


@users_bp.patch("/users/<int:user_id>")
@login_required
@admin_required
@validate_body(UserUpdateIn)
def update_user(user_id: int, payload: UserUpdateIn):
    user = db.session.get(User, user_id)
    if not user:
        return err("not_found", "找不到該使用者", 404)

    # 防呆:不可停用自己、不可把自己降級(避免把自己鎖在門外)
    if user.id == current_user.id:
        if payload.is_active is False:
            return err("forbidden", "不可停用自己的帳號", 400)
        if payload.role and payload.role != "admin":
            return err("forbidden", "不可降級自己的權限", 400)

    changed = []
    if payload.display_name is not None:
        user.display_name = payload.display_name
        changed.append("display_name")
    if payload.role is not None:
        user.role = payload.role
        changed.append("role")
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changed.append("is_active")
    if payload.password:
        user.password_hash = auth_service.hash_password(payload.password)
        changed.append("password_reset")

    audit_service.record("update_user", "user", user.id, {"changed": changed})
    db.session.commit()
    return ok(user.to_dict())

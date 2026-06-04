"""使用者。UserMixin 提供 Flask-Login 需要的 is_authenticated / get_id 等屬性。"""

from flask_login import UserMixin

from app.core.db import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)  # bcrypt(Phase 2)
    display_name = db.Column(db.String(50))
    # 角色:'admin' | 'operator'
    role = db.Column(db.String(20), nullable=False, default="operator")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())

    def to_dict(self) -> dict:
        # 注意:絕不輸出 password_hash(bcrypt 單向,不可逆)。
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

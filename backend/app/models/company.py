"""公司:廠商單位與接收單位共用同一張表,用 role_type 區分用途(vendor / receiver)。"""

import json

from app.core.db import db


class Company(db.Model):
    __tablename__ = "companies"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    # 'vendor'(廠商) | 'receiver'(接收) | 'both'(兩者皆可)
    role_type = db.Column(db.String(20), nullable=False, default="both")
    phone = db.Column(db.String(50))
    fax = db.Column(db.String(50))
    address = db.Column(db.String(255))
    note = db.Column(db.Text)
    detail = db.Column(db.Text)  # 完整原始資料(JSON 字串):廠商多位聯絡人、接收加工方式等
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "role_type": self.role_type,
            "phone": self.phone,
            "fax": self.fax,
            "address": self.address,
            "note": self.note,
            "detail": json.loads(self.detail) if self.detail else None,
            "is_active": self.is_active,
        }

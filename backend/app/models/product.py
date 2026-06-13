"""品名主檔 + 加工項目主檔(都是下拉/點選用的小主檔)。"""

from app.core.db import db


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)        # 例:HBS
    default_unit = db.Column(db.String(20))                 # 例:K / KG / 件
    note = db.Column(db.Text)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "default_unit": self.default_unit,
            "note": self.note,
            "is_active": self.is_active,
        }


class ProcessItem(db.Model):
    __tablename__ = "process_items"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)        # 例:車刃、咬花
    note = db.Column(db.Text)                               # 備註
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "note": self.note, "is_active": self.is_active}

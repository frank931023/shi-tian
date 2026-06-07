"""規格主檔(下拉/側欄用)。

文件 §3 原本規劃規格先用文字快照即可,未來要升級成目錄再加一張 specs 表 ——
這裡就是那個升級:規格成為可維護的主檔,但 order_items.spec 仍存文字快照,
歷史單據不受主檔變更影響。
"""

from app.core.db import db


class Spec(db.Model):
    __tablename__ = "specs"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)   # 例:1/4"x 6P / 13
    kind = db.Column(db.String(10))                     # '規格1' | '規格2'(None=舊資料,兩類皆可用)
    group_index = db.Column(db.Integer)                 # 規格1↔規格2 的可搭配組合(同 group 才能配)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "kind": self.kind,
            "group_index": self.group_index, "is_active": self.is_active,
        }

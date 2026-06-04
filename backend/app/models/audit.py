"""稽核紀錄:誰、何時、對哪個實體做了什麼。資安與追溯的基礎(從第一天就留)。"""

from app.core.db import db


class AuditLog(db.Model):
    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))  # Phase 1 可能為 null
    action = db.Column(db.String(50), nullable=False)           # create_order / update_order ...
    entity = db.Column(db.String(50))                           # order / company ...
    entity_id = db.Column(db.Integer)
    detail = db.Column(db.JSON)                                 # 額外資訊(JSONB)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())

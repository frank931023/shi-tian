"""單頭(orders)與單身(order_items)。

設計重點:
- order_items.product_name / spec 是「反正規化快照」:建單當下寫死文字,
  日後改 products 主檔不影響歷史單據。product_id 只當「來源參考」可為空。
- 金額欄位(amount / total_amount)由後端 service 重算後才寫入,不信任前端。
"""

from app.core.db import db


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    order_no = db.Column(db.String(30), unique=True, nullable=False)
    vendor_id = db.Column(db.Integer, db.ForeignKey("companies.id"))
    receiver_id = db.Column(db.Integer, db.ForeignKey("companies.id"))
    order_date = db.Column(db.Date, nullable=False)
    # draft | confirmed | printed | void
    status = db.Column(db.String(20), nullable=False, default="draft")
    # 軟刪除:true=在垃圾桶(列表/報表預設不顯示,可復原或永久刪除)
    is_deleted = db.Column(db.Boolean, nullable=False, default=False)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    note = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False,
        server_default=db.func.now(), onupdate=db.func.now(),
    )

    # 關聯:刪單時一併刪單身;依 sort_order 排序回傳
    items = db.relationship(
        "OrderItem",
        backref="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.sort_order",
    )
    vendor = db.relationship("Company", foreign_keys=[vendor_id])
    receiver = db.relationship("Company", foreign_keys=[receiver_id])

    def to_dict(self, with_items: bool = True) -> dict:
        data = {
            "id": self.id,
            "order_no": self.order_no,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor.name if self.vendor else None,
            "receiver_id": self.receiver_id,
            "receiver_name": self.receiver.name if self.receiver else None,
            "order_date": self.order_date.isoformat() if self.order_date else None,
            "status": self.status,
            "is_deleted": self.is_deleted,
            "total_amount": float(self.total_amount) if self.total_amount is not None else 0,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if with_items:
            data["items"] = [it.to_dict() for it in self.items]
        return data


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)  # 行排序(支援拖曳)
    product_name = db.Column(db.String(100), nullable=False)       # 快照
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"))
    spec = db.Column(db.String(100))                               # 規格(快照)
    process_item = db.Column(db.String(100))                       # 加工項目
    net_weight_kg = db.Column(db.Numeric(10, 2))                   # 淨重
    quantity = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    unit = db.Column(db.String(20))
    unit_price = db.Column(db.Numeric(12, 2))
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)  # 後端重算
    remark = db.Column(db.String(255))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "sort_order": self.sort_order,
            "product_name": self.product_name,
            "product_id": self.product_id,
            "spec": self.spec,
            "process_item": self.process_item,
            "net_weight_kg": float(self.net_weight_kg) if self.net_weight_kg is not None else None,
            "quantity": float(self.quantity) if self.quantity is not None else 0,
            "unit": self.unit,
            "unit_price": float(self.unit_price) if self.unit_price is not None else None,
            "amount": float(self.amount) if self.amount is not None else 0,
            "remark": self.remark,
        }

"""訂單 API:list(篩選+分頁)/ get / create / update / delete。

篩選查詢是怎麼組的:
- 用 db.select(Order) 起一個查詢,再依「有帶哪些參數」一層層 .where() 疊上去。
- 全部用 SQLAlchemy 的條件物件(參數化),沒有任何字串拼接 SQL → 杜絕注入。
"""

from datetime import date, datetime

from flask import Blueprint, request

from app.core.db import db
from app.core.responses import err, ok
from app.core.validation import validate_body
from app.models import Order, OrderItem
from app.schemas.order import OrderIn
from app.services import audit_service, order_service

orders_bp = Blueprint("orders", __name__)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


@orders_bp.get("/orders")
def list_orders():
    args = request.args

    query = db.select(Order)

    # 日期區間
    d_from = _parse_date(args.get("from"))
    d_to = _parse_date(args.get("to"))
    if d_from:
        query = query.where(Order.order_date >= d_from)
    if d_to:
        query = query.where(Order.order_date <= d_to)

    # 廠商
    if args.get("vendor_id"):
        try:
            query = query.where(Order.vendor_id == int(args["vendor_id"]))
        except ValueError:
            return err("bad_param", "vendor_id 必須是數字", 400)

    # 狀態
    if args.get("status"):
        query = query.where(Order.status == args["status"])

    # 品名:單身有任一行品名包含關鍵字(用 EXISTS 子查詢)
    if args.get("product"):
        kw = f"%{args['product']}%"
        query = query.where(
            Order.items.any(OrderItem.product_name.ilike(kw))
        )

    # 關鍵字:單號或備註
    if args.get("q"):
        kw = f"%{args['q']}%"
        query = query.where(
            db.or_(Order.order_no.ilike(kw), Order.note.ilike(kw))
        )

    # 分頁
    try:
        page = max(1, int(args.get("page", 1)))
        page_size = min(100, max(1, int(args.get("page_size", 20))))
    except ValueError:
        return err("bad_param", "page / page_size 必須是數字", 400)

    # 先算總數(套用同樣的條件),再取當頁
    total = db.session.scalar(
        db.select(db.func.count()).select_from(query.subquery())
    )
    query = query.order_by(Order.order_date.desc(), Order.id.desc())
    query = query.limit(page_size).offset((page - 1) * page_size)
    orders = db.session.scalars(query).all()

    return ok({
        "items": [o.to_dict(with_items=False) for o in orders],
        "page": page,
        "page_size": page_size,
        "total": total,
    })


@orders_bp.get("/orders/<int:order_id>")
def get_order(order_id: int):
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    return ok(order.to_dict())


@orders_bp.post("/orders")
@validate_body(OrderIn)
def create_order(payload: OrderIn):
    order = order_service.create_order(payload)
    db.session.flush()
    audit_service.record("create_order", "order", order.id, {"order_no": order.order_no})
    db.session.commit()
    return ok(order.to_dict(), 201)


@orders_bp.put("/orders/<int:order_id>")
@validate_body(OrderIn)
def update_order(order_id: int, payload: OrderIn):
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    order_service.update_order(order, payload)
    audit_service.record("update_order", "order", order.id, {"order_no": order.order_no})
    db.session.commit()
    return ok(order.to_dict())


@orders_bp.delete("/orders/<int:order_id>")
def delete_order(order_id: int):
    # Phase 2 會把刪除限制為 admin;這裡先做掉功能。
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    order_no = order.order_no
    db.session.delete(order)
    audit_service.record("delete_order", "order", order_id, {"order_no": order_no})
    db.session.commit()
    return ok({"deleted": order_id})

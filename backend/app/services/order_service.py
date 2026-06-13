"""訂單商業邏輯:金額重算、單號產生、建立/更新單身。

CLAUDE.md §4:商業邏輯(尤其金額/數量計算)放後端,前端傳來的金額一律不信任。
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func

from app.core.db import db
from app.models import Order, OrderItem
from app.schemas.order import OrderIn, OrderItemIn

_CENTS = Decimal("0.01")


def _money(value: Decimal) -> Decimal:
    """統一把金額量化到 2 位小數(四捨五入)。"""
    return (value or Decimal("0")).quantize(_CENTS, rounding=ROUND_HALF_UP)


def compute_item_amount(item: OrderItemIn) -> Decimal:
    """單行金額 = 數量 × 單價(單價可為空 → 視為 0)。"""
    qty = item.quantity or Decimal("0")
    price = item.unit_price or Decimal("0")
    return _money(qty * price)


def generate_order_no(order_date: date) -> str:
    """自動產生單號:YYYYMMDD-NNN(當日序號,從 001 起跳)。

    用當天已存在的單數 + 1 當序號。家庭事業量不大,這個簡單作法足夠;
    若未來要嚴格防併發,可改用資料庫序列(sequence)。
    """
    prefix = order_date.strftime("%Y%m%d")
    count_today = db.session.scalar(
        db.select(func.count(Order.id)).where(
            Order.order_no.like(f"{prefix}-%")
        )
    ) or 0
    return f"{prefix}-{count_today + 1:03d}"


def _apply_items(order: Order, items_in: list[OrderItemIn]) -> Decimal:
    """依輸入重建單身,回傳重算後的總額。"""
    total = Decimal("0")
    for idx, item_in in enumerate(items_in):
        amount = compute_item_amount(item_in)
        total += amount
        order.items.append(
            OrderItem(
                sort_order=idx,
                product_name=item_in.product_name,   # 反正規化快照
                product_id=item_in.product_id,
                process_no=item_in.process_no,       # 加工單號(選填)
                spec=item_in.spec,
                process_item=item_in.process_item,
                net_weight_kg=item_in.net_weight_kg,
                quantity=item_in.quantity,
                unit=item_in.unit,
                unit_price=item_in.unit_price,
                amount=amount,                        # 後端重算
                remark=item_in.remark,
            )
        )
    return _money(total)


def create_order(data: OrderIn) -> Order:
    """建立訂單(含單身)。呼叫端負責 commit。"""
    order_no = data.order_no or generate_order_no(data.order_date)
    order = Order(
        order_no=order_no,
        vendor_id=data.vendor_id,
        receiver_id=data.receiver_id,
        order_date=data.order_date,
        status=data.status,
        note=data.note,
    )
    order.total_amount = _apply_items(order, data.items)
    db.session.add(order)
    return order


def update_order(order: Order, data: OrderIn) -> Order:
    """更新訂單:整批覆蓋單身並重算金額(簡單且不易出錯)。"""
    order.vendor_id = data.vendor_id
    order.receiver_id = data.receiver_id
    order.order_date = data.order_date
    order.status = data.status
    order.note = data.note
    if data.order_no:
        order.order_no = data.order_no

    # 清掉舊單身(cascade delete-orphan 會處理),重建
    order.items.clear()
    order.total_amount = _apply_items(order, data.items)
    return order

"""報表聚合 API:全部在資料庫端用 GROUP BY 聚合。

純移轉單(無金額)→ 報表以「數量」為統計維度。

為什麼在 DB 端聚合(而非拉回前端算):
- 資料量大時,傳整批回前端既慢又耗記憶體;DB 聚合只回少量彙總列。
- orders(order_date) 有索引,區間查詢有效率。

作廢單(status='void')不計入報表。
"""

from datetime import datetime

from flask import Blueprint, request
from flask_login import login_required
from sqlalchemy import func

from app.core.db import db
from app.core.responses import err, ok
from app.models import Company, Order, OrderItem

reports_bp = Blueprint("reports", __name__)


def _date(v):
    if not v:
        return None
    try:
        return datetime.strptime(v, "%Y-%m-%d").date()
    except ValueError:
        return None


def _order_filters():
    conds = [Order.status != "void"]
    d_from = _date(request.args.get("from"))
    d_to = _date(request.args.get("to"))
    if d_from:
        conds.append(Order.order_date >= d_from)
    if d_to:
        conds.append(Order.order_date <= d_to)
    return conds


@reports_bp.get("/reports/summary")
@login_required
def summary():
    group_by = request.args.get("group_by", "month")
    if group_by not in ("week", "month"):
        return err("bad_param", "group_by 必須是 week 或 month", 400)
    conds = _order_filters()

    total_count = db.session.scalar(db.select(func.count(Order.id)).where(*conds))
    total_qty = db.session.scalar(
        db.select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .select_from(OrderItem).join(Order).where(*conds)
    )

    # 每期(週/月)數量:join 單身,在 DB 端用 date_trunc 分組
    period = func.date_trunc(group_by, Order.order_date)
    rows = db.session.execute(
        db.select(period.label("period"), func.coalesce(func.sum(OrderItem.quantity), 0))
        .select_from(OrderItem).join(Order).where(*conds)
        .group_by("period").order_by("period")
    ).all()
    series = [
        {"period": r[0].date().isoformat() if r[0] else None, "quantity": float(r[1] or 0)}
        for r in rows
    ]

    return ok({
        "total_count": int(total_count or 0),
        "total_quantity": float(total_qty or 0),
        "group_by": group_by,
        "series": series,
    })


@reports_bp.get("/reports/by-product")
@login_required
def by_product():
    conds = _order_filters()
    rows = db.session.execute(
        db.select(OrderItem.product_name, func.sum(OrderItem.quantity))
        .select_from(OrderItem).join(Order).where(*conds)
        .group_by(OrderItem.product_name)
        .order_by(func.sum(OrderItem.quantity).desc())
    ).all()
    return ok([{"name": r[0], "quantity": float(r[1] or 0)} for r in rows])


@reports_bp.get("/reports/by-company")
@login_required
def by_company():
    conds = _order_filters()
    rows = db.session.execute(
        db.select(
            func.coalesce(Company.name, "未指定"),
            func.sum(OrderItem.quantity),
            func.count(func.distinct(Order.id)),
        )
        .select_from(Order)
        .outerjoin(Company, Order.vendor_id == Company.id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(*conds)
        .group_by(Company.name)
        .order_by(func.sum(OrderItem.quantity).desc())
    ).all()
    return ok([
        {"name": r[0], "quantity": float(r[1] or 0), "count": int(r[2] or 0)}
        for r in rows
    ])

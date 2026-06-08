"""訂單 API:list(篩選+分頁)/ get / create / update / delete。

篩選查詢是怎麼組的:
- 用 db.select(Order) 起一個查詢,再依「有帶哪些參數」一層層 .where() 疊上去。
- 全部用 SQLAlchemy 的條件物件(參數化),沒有任何字串拼接 SQL → 杜絕注入。
"""

import csv
from datetime import date, datetime
from io import BytesIO, StringIO

from flask import Blueprint, current_app, request, send_file
from flask_login import current_user, login_required

from app.core.db import db
from app.core.responses import err, ok
from app.core.security import admin_required
from app.core.validation import validate_body
from app.models import Order, OrderItem
from app.schemas.order import OrderIn
from app.services import audit_service, dotmatrix_service, order_service, pdf_service, print_service

orders_bp = Blueprint("orders", __name__)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _build_filtered_query(args):
    """依查詢參數組出已篩選的訂單 select(不含排序/分頁)。vendor_id 非數字會丟 ValueError。"""
    query = db.select(Order)

    # 軟刪除:預設只看未刪除;?deleted=1 只看垃圾桶
    if args.get("deleted") in ("1", "true"):
        query = query.where(Order.is_deleted.is_(True))
    else:
        query = query.where(Order.is_deleted.is_(False))

    d_from = _parse_date(args.get("from"))
    d_to = _parse_date(args.get("to"))
    if d_from:
        query = query.where(Order.order_date >= d_from)
    if d_to:
        query = query.where(Order.order_date <= d_to)

    if args.get("vendor_id"):
        query = query.where(Order.vendor_id == int(args["vendor_id"]))  # 非數字 → ValueError

    if args.get("status"):
        query = query.where(Order.status == args["status"])

    # 品名:單身有任一行品名包含關鍵字(用 EXISTS 子查詢)
    if args.get("product"):
        query = query.where(Order.items.any(OrderItem.product_name.ilike(f"%{args['product']}%")))

    # 關鍵字:單號或備註
    if args.get("q"):
        kw = f"%{args['q']}%"
        query = query.where(db.or_(Order.order_no.ilike(kw), Order.note.ilike(kw)))

    return query


@orders_bp.get("/orders")
@login_required
def list_orders():
    args = request.args

    # 看垃圾桶(已刪除)需要 admin
    if args.get("deleted") in ("1", "true") and getattr(current_user, "role", None) != "admin":
        return err("forbidden", "需管理員權限", 403)

    try:
        query = _build_filtered_query(args)
    except ValueError:
        return err("bad_param", "vendor_id 必須是數字", 400)

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


_EXPORT_HEADERS = [
    "單號", "日期", "廠商單位", "接收單位", "狀態",
    "品名", "規格", "加工項目", "重量(KG)", "數量", "單位", "品項備註", "單據備註",
]


def _export_rows(orders):
    """把訂單展開成「一個品項一列」的二維資料(含單頭欄位重複)。"""
    rows = []
    for o in orders:
        d = o.to_dict()  # 含 items
        base = [
            d["order_no"], d["order_date"] or "", d["vendor_name"] or "",
            d["receiver_name"] or "", d["status"],
        ]
        note = d["note"] or ""
        items = d.get("items") or []
        if not items:
            rows.append(base + ["", "", "", "", "", "", "", note])
            continue
        for it in items:
            rows.append(base + [
                it["product_name"], it["spec"] or "", it["process_item"] or "",
                "" if it["net_weight_kg"] is None else it["net_weight_kg"],
                it["quantity"], it["unit"] or "", it["remark"] or "", note,
            ])
    return rows


@orders_bp.get("/orders/export")
@login_required
def export_orders():
    """匯出目前篩選結果(全部,不分頁)成 CSV 或 Excel。?format=csv|xlsx,其餘篩選參數同 list。"""
    args = request.args
    try:
        query = _build_filtered_query(args)
    except ValueError:
        return err("bad_param", "vendor_id 必須是數字", 400)
    query = query.order_by(Order.order_date.desc(), Order.id.desc())
    orders = db.session.scalars(query).all()
    rows = _export_rows(orders)

    today = date.today().strftime("%Y%m%d")
    fmt = (args.get("format") or "csv").lower()

    if fmt == "xlsx":
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "訂單"
        ws.append(_EXPORT_HEADERS)
        for r in rows:
            ws.append(r)
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True, download_name=f"orders-{today}.xlsx",
        )

    # CSV:加 UTF-8 BOM,Excel 開啟中文不亂碼
    sio = StringIO()
    writer = csv.writer(sio)
    writer.writerow(_EXPORT_HEADERS)
    writer.writerows(rows)
    data = sio.getvalue().encode("utf-8-sig")  # utf-8-sig 會自動加 BOM,Excel 開中文不亂碼
    return send_file(
        BytesIO(data), mimetype="text/csv",
        as_attachment=True, download_name=f"orders-{today}.csv",
    )


@orders_bp.get("/orders/statement")
@login_required
def statement_orders():
    """銷貨統計表用:依客戶(vendor_id)+ 期間取出「含明細」的訂單(不分頁,日期由舊到新)。"""
    args = request.args
    try:
        query = _build_filtered_query(args)
    except ValueError:
        return err("bad_param", "vendor_id 必須是數字", 400)
    query = query.order_by(Order.order_date.asc(), Order.id.asc())
    orders = db.session.scalars(query).all()
    return ok([o.to_dict() for o in orders])  # to_dict 預設含 items


@orders_bp.post("/orders/statement-pdf")
@login_required
def statement_pdf():
    """把前端目前的銷貨統計表(含使用者填的單價等)產成 PDF。"""
    data = request.get_json(silent=True) or {}
    try:
        pdf = pdf_service.statement_to_pdf_bytes(data)
    except pdf_service.PdfUnavailable as e:
        return err("pdf_unavailable", str(e), 503)
    # 記錄到使用紀錄(誰在銷貨統計頁產了哪個客戶/期間的 PDF)
    audit_service.record("statement_pdf", "sales", None,
                         {"customer": data.get("customer"), "period": data.get("period")})
    db.session.commit()
    name = (data.get("customer") or "statement").strip() or "statement"
    return send_file(
        BytesIO(pdf), mimetype="application/pdf",
        as_attachment=False, download_name=f"銷貨統計表-{name}.pdf",
    )


@orders_bp.get("/orders/<int:order_id>")
@login_required
def get_order(order_id: int):
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    return ok(order.to_dict())


@orders_bp.post("/orders")
@login_required
@validate_body(OrderIn)
def create_order(payload: OrderIn):
    order = order_service.create_order(payload)
    order.created_by = current_user.id  # 記錄建單者(權限與稽核用)
    db.session.flush()
    audit_service.record("create_order", "order", order.id, {"order_no": order.order_no})
    db.session.commit()
    return ok(order.to_dict(), 201)


@orders_bp.put("/orders/<int:order_id>")
@login_required
@validate_body(OrderIn)
def update_order(order_id: int, payload: OrderIn):
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    # 授權:operator 只能改自己建的單;admin 不限
    if current_user.role != "admin" and order.created_by != current_user.id:
        return err("forbidden", "你只能修改自己建立的單", 403)
    order_service.update_order(order, payload)
    audit_service.record("update_order", "order", order.id, {"order_no": order.order_no})
    db.session.commit()
    return ok(order.to_dict())


@orders_bp.get("/orders/<int:order_id>/pdf")
@login_required
def preview_pdf(order_id: int):
    """產生並回傳 PDF 供預覽/下載(不一定封存)。"""
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    try:
        pdf = pdf_service.order_to_pdf_bytes(order)
    except pdf_service.PdfUnavailable as e:
        return err("pdf_unavailable", str(e), 503)
    return send_file(
        BytesIO(pdf), mimetype="application/pdf",
        as_attachment=False, download_name=f"{order.order_no}.pdf",
    )


@orders_bp.post("/orders/<int:order_id>/pdf")
@login_required
def generate_pdf(order_id: int):
    """產生 PDF 並封存到 NAS 資料夾。"""
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    try:
        path = pdf_service.generate_and_archive(order)
    except pdf_service.PdfUnavailable as e:
        return err("pdf_unavailable", str(e), 503)
    audit_service.record("generate_pdf", "order", order.id, {"path": str(path)})
    db.session.commit()
    return ok({"archived": str(path)})


@orders_bp.get("/orders/<int:order_id>/dotmatrix-pdf")
@login_required
def preview_dotmatrix(order_id: int):
    """預覽點陣套表(只有資料、無框線)的 PDF。"""
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    pdf = dotmatrix_service.render_overlay_pdf(order)
    return send_file(BytesIO(pdf), mimetype="application/pdf",
                     as_attachment=False, download_name=f"{order.order_no}-dotmatrix.pdf")


@orders_bp.post("/orders/<int:order_id>/print")
@login_required
def print_order(order_id: int):
    """送印到 CUPS 佇列。body: {"target": "normal"|"dotmatrix"}(預設 normal)。

    - normal:WeasyPrint 完整版面(框線+資料)送一般印表機。
    - dotmatrix:ReportLab 套表(只有資料)送點陣機,印在現成三聯單上。
    """
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    target = (request.get_json(silent=True) or {}).get("target", "normal")

    if target == "dotmatrix":
        queue = current_app.config["CUPS_DOTMATRIX_QUEUE"]
        # 套表 overlay 寫到封存資料夾當列印來源
        path = pdf_service.archive_path(order).with_name(f"{order.order_no}-dotmatrix.pdf")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(dotmatrix_service.render_overlay_pdf(order))
    else:
        queue = current_app.config["CUPS_NORMAL_QUEUE"]
        try:
            path = pdf_service.generate_and_archive(order)
        except pdf_service.PdfUnavailable as e:
            return err("pdf_unavailable", str(e), 503)

    try:
        job = print_service.print_pdf(path, queue)
    except print_service.PrintError as e:
        return err(e.code, str(e), 503)
    order.status = "printed"
    audit_service.record("print_order", "order", order.id, {"queue": queue, "target": target, "job": job})
    db.session.commit()
    return ok({"queue": queue, "job": job, "status": order.status})


@orders_bp.delete("/orders/<int:order_id>")
@login_required
def delete_order(order_id: int):
    # 軟刪除:移到垃圾桶(is_deleted=true)。一般操作員也可刪(可復原);
    # 垃圾桶的「復原 / 永久刪除」才限 admin。
    order = db.session.get(Order, order_id)
    if not order:
        return err("not_found", "找不到該訂單", 404)
    order.is_deleted = True
    audit_service.record("delete_order", "order", order_id, {"order_no": order.order_no})
    db.session.commit()
    return ok({"deleted": order_id})


@orders_bp.post("/orders/trash/restore")
@login_required
@admin_required
def restore_orders():
    """從垃圾桶復原(可多筆)。body: {"ids": [...]}"""
    ids = (request.get_json(silent=True) or {}).get("ids") or []
    n = 0
    for oid in ids:
        o = db.session.get(Order, oid)
        if o and o.is_deleted:
            o.is_deleted = False
            audit_service.record("restore_order", "order", o.id, {"order_no": o.order_no})
            n += 1
    db.session.commit()
    return ok({"restored": n})


@orders_bp.post("/orders/trash/delete")
@login_required
@admin_required
def purge_orders():
    """永久刪除(可多筆,僅垃圾桶內)。body: {"ids": [...]}"""
    ids = (request.get_json(silent=True) or {}).get("ids") or []
    n = 0
    for oid in ids:
        o = db.session.get(Order, oid)
        if o and o.is_deleted:
            no = o.order_no
            db.session.delete(o)
            audit_service.record("purge_order", "order", oid, {"order_no": no})
            n += 1
    db.session.commit()
    return ok({"deleted": n})

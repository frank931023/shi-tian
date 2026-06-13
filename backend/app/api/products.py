"""品名 + 加工項目主檔 API。"""

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy.exc import IntegrityError

from app.core.db import db
from app.core.responses import err, ok
from app.core.validation import validate_body
from app.models import ProcessItem, Product, Spec
from app.schemas.master import (
    ProcessItemIn,
    ProcessItemUpdate,
    ProductIn,
    ProductUpdate,
    SpecIn,
)
from app.services import audit_service

products_bp = Blueprint("products", __name__)


def _wants_deleted() -> bool:
    return request.args.get("deleted") in ("1", "true")


def _is_admin() -> bool:
    return getattr(current_user, "role", None) == "admin"


def _restore(model, obj_id: int, kind: str, label: str):
    """共用:把某筆主檔從垃圾桶還原(is_active=True),僅 admin。"""
    if not _is_admin():
        return err("forbidden", "僅管理員可還原", 403)
    obj = db.session.get(model, obj_id)
    if not obj:
        return err("not_found", f"找不到該{label}", 404)
    obj.is_active = True
    audit_service.record(f"restore_{kind}", kind, obj.id)
    db.session.commit()
    return ok(obj.to_dict())


def _purge(model, obj_id: int, kind: str, label: str):
    """共用:永久刪除(僅 admin、僅限已在垃圾桶者);被歷史單據參照則擋下。"""
    if not _is_admin():
        return err("forbidden", "僅管理員可永久刪除", 403)
    obj = db.session.get(model, obj_id)
    if not obj:
        return err("not_found", f"找不到該{label}", 404)
    if obj.is_active:
        return err("bad_request", "請先刪除(移到垃圾桶)再永久刪除", 400)
    audit_service.record(f"purge_{kind}", kind, obj.id)
    db.session.delete(obj)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return err("in_use", f"此{label}已被歷史單據參照,無法永久刪除(可保留在垃圾桶)", 409)
    return ok({"purged": obj_id})


# ---- 品名 ----
@products_bp.get("/products")
@login_required
def list_products():
    deleted = _wants_deleted()
    if deleted and not _is_admin():
        return err("forbidden", "僅管理員可檢視垃圾桶", 403)
    products = db.session.scalars(
        db.select(Product).where(Product.is_active.is_(not deleted)).order_by(Product.name)
    ).all()
    return ok([p.to_dict() for p in products])


@products_bp.post("/products")
@login_required
@validate_body(ProductIn)
def create_product(payload: ProductIn):
    product = Product(**payload.model_dump())
    db.session.add(product)
    db.session.flush()
    audit_service.record("create_product", "product", product.id)
    db.session.commit()
    return ok(product.to_dict(), 201)


@products_bp.patch("/products/<int:product_id>")
@login_required
@validate_body(ProductUpdate)
def update_product(product_id: int, payload: ProductUpdate):
    product = db.session.get(Product, product_id)
    if not product or not product.is_active:
        return err("not_found", "找不到該品名", 404)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    audit_service.record("update_product", "product", product.id)
    db.session.commit()
    return ok(product.to_dict())


@products_bp.delete("/products/<int:product_id>")
@login_required
def delete_product(product_id: int):
    product = db.session.get(Product, product_id)
    if not product or not product.is_active:
        return err("not_found", "找不到該品名", 404)
    product.is_active = False  # 軟刪除:移到垃圾桶,歷史單據的快照不受影響
    audit_service.record("delete_product", "product", product.id)
    db.session.commit()
    return ok({"deleted": product_id})


@products_bp.post("/products/<int:product_id>/restore")
@login_required
def restore_product(product_id: int):
    return _restore(Product, product_id, "product", "品名")


@products_bp.delete("/products/<int:product_id>/purge")
@login_required
def purge_product(product_id: int):
    return _purge(Product, product_id, "product", "品名")


# ---- 加工項目 ----
@products_bp.get("/process-items")
@login_required
def list_process_items():
    deleted = _wants_deleted()
    if deleted and not _is_admin():
        return err("forbidden", "僅管理員可檢視垃圾桶", 403)
    items = db.session.scalars(
        db.select(ProcessItem).where(ProcessItem.is_active.is_(not deleted)).order_by(ProcessItem.name)
    ).all()
    return ok([i.to_dict() for i in items])


@products_bp.post("/process-items")
@login_required
@validate_body(ProcessItemIn)
def create_process_item(payload: ProcessItemIn):
    item = ProcessItem(**payload.model_dump())
    db.session.add(item)
    db.session.flush()
    audit_service.record("create_process_item", "process_item", item.id)
    db.session.commit()
    return ok(item.to_dict(), 201)


@products_bp.patch("/process-items/<int:item_id>")
@login_required
@validate_body(ProcessItemUpdate)
def update_process_item(item_id: int, payload: ProcessItemUpdate):
    item = db.session.get(ProcessItem, item_id)
    if not item or not item.is_active:
        return err("not_found", "找不到該加工項目", 404)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    audit_service.record("update_process_item", "process_item", item.id)
    db.session.commit()
    return ok(item.to_dict())


@products_bp.delete("/process-items/<int:item_id>")
@login_required
def delete_process_item(item_id: int):
    item = db.session.get(ProcessItem, item_id)
    if not item or not item.is_active:
        return err("not_found", "找不到該加工項目", 404)
    item.is_active = False
    audit_service.record("delete_process_item", "process_item", item.id)
    db.session.commit()
    return ok({"deleted": item_id})


@products_bp.post("/process-items/<int:item_id>/restore")
@login_required
def restore_process_item(item_id: int):
    return _restore(ProcessItem, item_id, "process_item", "加工項目")


@products_bp.delete("/process-items/<int:item_id>/purge")
@login_required
def purge_process_item(item_id: int):
    return _purge(ProcessItem, item_id, "process_item", "加工項目")


# ---- 規格 ----
@products_bp.get("/specs")
@login_required
def list_specs():
    deleted = _wants_deleted()
    if deleted and not _is_admin():
        return err("forbidden", "僅管理員可檢視垃圾桶", 403)
    specs = db.session.scalars(
        db.select(Spec).where(Spec.is_active.is_(not deleted)).order_by(Spec.name)
    ).all()
    return ok([s.to_dict() for s in specs])


@products_bp.post("/specs")
@login_required
@validate_body(SpecIn)
def create_spec(payload: SpecIn):
    spec = Spec(**payload.model_dump())
    db.session.add(spec)
    db.session.flush()
    audit_service.record("create_spec", "spec", spec.id)
    db.session.commit()
    return ok(spec.to_dict(), 201)


@products_bp.delete("/specs/<int:spec_id>")
@login_required
def delete_spec(spec_id: int):
    spec = db.session.get(Spec, spec_id)
    if not spec or not spec.is_active:
        return err("not_found", "找不到該規格", 404)
    spec.is_active = False
    audit_service.record("delete_spec", "spec", spec.id)
    db.session.commit()
    return ok({"deleted": spec_id})


@products_bp.post("/specs/<int:spec_id>/restore")
@login_required
def restore_spec(spec_id: int):
    return _restore(Spec, spec_id, "spec", "規格")


@products_bp.delete("/specs/<int:spec_id>/purge")
@login_required
def purge_spec(spec_id: int):
    return _purge(Spec, spec_id, "spec", "規格")

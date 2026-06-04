"""品名 + 加工項目主檔 API。"""

from flask import Blueprint
from flask_login import login_required

from app.core.db import db
from app.core.responses import ok
from app.core.security import admin_required
from app.core.validation import validate_body
from app.models import ProcessItem, Product, Spec
from app.schemas.master import ProcessItemIn, ProductIn, SpecIn
from app.services import audit_service

products_bp = Blueprint("products", __name__)


# ---- 品名 ----
@products_bp.get("/products")
@login_required
def list_products():
    products = db.session.scalars(
        db.select(Product).where(Product.is_active.is_(True)).order_by(Product.name)
    ).all()
    return ok([p.to_dict() for p in products])


@products_bp.post("/products")
@login_required
@admin_required
@validate_body(ProductIn)
def create_product(payload: ProductIn):
    product = Product(**payload.model_dump())
    db.session.add(product)
    db.session.flush()
    audit_service.record("create_product", "product", product.id)
    db.session.commit()
    return ok(product.to_dict(), 201)


# ---- 加工項目 ----
@products_bp.get("/process-items")
@login_required
def list_process_items():
    items = db.session.scalars(
        db.select(ProcessItem).where(ProcessItem.is_active.is_(True)).order_by(ProcessItem.name)
    ).all()
    return ok([i.to_dict() for i in items])


@products_bp.post("/process-items")
@login_required
@admin_required
@validate_body(ProcessItemIn)
def create_process_item(payload: ProcessItemIn):
    item = ProcessItem(**payload.model_dump())
    db.session.add(item)
    db.session.flush()
    audit_service.record("create_process_item", "process_item", item.id)
    db.session.commit()
    return ok(item.to_dict(), 201)


# ---- 規格 ----
@products_bp.get("/specs")
@login_required
def list_specs():
    specs = db.session.scalars(
        db.select(Spec).where(Spec.is_active.is_(True)).order_by(Spec.name)
    ).all()
    return ok([s.to_dict() for s in specs])


@products_bp.post("/specs")
@login_required
@admin_required
@validate_body(SpecIn)
def create_spec(payload: SpecIn):
    spec = Spec(**payload.model_dump())
    db.session.add(spec)
    db.session.flush()
    audit_service.record("create_spec", "spec", spec.id)
    db.session.commit()
    return ok(spec.to_dict(), 201)

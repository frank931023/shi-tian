"""公司主檔 API:查詢(可依 role 篩選)與新增。

Phase 1 先不做權限;Phase 2 會把「新增/修改主檔」限制為 admin。
"""

import json

from flask import Blueprint, request
from flask_login import login_required

from app.core.db import db
from app.core.responses import err, ok
from app.core.security import admin_required
from app.core.validation import validate_body
from app.models import Company
from app.schemas.master import CompanyIn, CompanyUpdate
from app.services import audit_service

companies_bp = Blueprint("companies", __name__)


@companies_bp.get("/companies")
@login_required
def list_companies():
    # ?role=vendor|receiver → 只回傳該用途的公司(廠商與接收已完全分開)
    role = request.args.get("role")
    query = db.select(Company).where(Company.is_active.is_(True))
    if role in ("vendor", "receiver"):
        query = query.where(Company.role_type == role)
    query = query.order_by(Company.name)
    companies = db.session.scalars(query).all()
    return ok([c.to_dict() for c in companies])


@companies_bp.get("/companies/<int:company_id>")
@login_required
def get_company(company_id: int):
    company = db.session.get(Company, company_id)
    if not company:
        return err("not_found", "找不到該公司", 404)
    return ok(company.to_dict())


@companies_bp.post("/companies")
@login_required
@admin_required
@validate_body(CompanyIn)
def create_company(payload: CompanyIn):
    data = payload.model_dump()
    detail = data.pop("detail", None)
    company = Company(**data)
    if detail is not None:
        company.detail = json.dumps(detail, ensure_ascii=False)
    db.session.add(company)
    db.session.flush()  # 先拿到 id 供 audit 使用
    audit_service.record("create_company", "company", company.id)
    db.session.commit()
    return ok(company.to_dict(), 201)


@companies_bp.patch("/companies/<int:company_id>")
@login_required
@admin_required
@validate_body(CompanyUpdate)
def update_company(company_id: int, payload: CompanyUpdate):
    company = db.session.get(Company, company_id)
    if not company:
        return err("not_found", "找不到該公司", 404)
    # 只更新有帶的欄位;detail 需序列化成 JSON 字串
    data = payload.model_dump(exclude_unset=True)
    if "detail" in data:
        detail = data.pop("detail")
        company.detail = json.dumps(detail, ensure_ascii=False) if detail is not None else None
    for key, value in data.items():
        setattr(company, key, value)
    audit_service.record("update_company", "company", company.id)
    db.session.commit()
    return ok(company.to_dict())

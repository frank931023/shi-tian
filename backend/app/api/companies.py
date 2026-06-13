"""公司主檔 API:查詢(可依 role 篩選)與新增。

Phase 1 先不做權限;Phase 2 會把「新增/修改主檔」限制為 admin。
"""

import json

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy.exc import IntegrityError

from app.core.db import db
from app.core.responses import err, ok
from app.core.validation import validate_body
from app.models import Company
from app.schemas.master import CompanyIn, CompanyUpdate
from app.services import audit_service

companies_bp = Blueprint("companies", __name__)


@companies_bp.get("/companies")
@login_required
def list_companies():
    # ?role=vendor|receiver → 只回傳該用途的公司(廠商與接收已完全分開)
    # ?deleted=1 → 垃圾桶:只回傳已刪除(is_active=False)的公司(僅 admin)
    role = request.args.get("role")
    deleted = request.args.get("deleted") in ("1", "true")
    if deleted and getattr(current_user, "role", None) != "admin":
        return err("forbidden", "僅管理員可檢視垃圾桶", 403)
    query = db.select(Company).where(Company.is_active.is_(not deleted))
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


@companies_bp.delete("/companies/<int:company_id>")
@login_required
def delete_company(company_id: int):
    company = db.session.get(Company, company_id)
    if not company or not company.is_active:
        return err("not_found", "找不到該公司", 404)
    # 軟刪除:移到垃圾桶(從清單/下拉隱藏),保留資料列,歷史訂單的廠商/接收關聯不受影響
    company.is_active = False
    audit_service.record("delete_company", "company", company.id)
    db.session.commit()
    return ok({"deleted": company_id})


@companies_bp.post("/companies/<int:company_id>/restore")
@login_required
def restore_company(company_id: int):
    if getattr(current_user, "role", None) != "admin":
        return err("forbidden", "僅管理員可還原", 403)
    company = db.session.get(Company, company_id)
    if not company:
        return err("not_found", "找不到該公司", 404)
    company.is_active = True
    audit_service.record("restore_company", "company", company.id)
    db.session.commit()
    return ok(company.to_dict())


@companies_bp.delete("/companies/<int:company_id>/purge")
@login_required
def purge_company(company_id: int):
    """永久刪除(僅 admin、僅限已在垃圾桶者)。若被歷史訂單參照則擋下。"""
    if getattr(current_user, "role", None) != "admin":
        return err("forbidden", "僅管理員可永久刪除", 403)
    company = db.session.get(Company, company_id)
    if not company:
        return err("not_found", "找不到該公司", 404)
    if company.is_active:
        return err("bad_request", "請先刪除(移到垃圾桶)再永久刪除", 400)
    audit_service.record("purge_company", "company", company.id)
    db.session.delete(company)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return err("in_use", "此公司已被歷史單據參照,無法永久刪除(可保留在垃圾桶)", 409)
    return ok({"purged": company_id})

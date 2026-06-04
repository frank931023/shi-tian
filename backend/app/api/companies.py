"""公司主檔 API:查詢(可依 role 篩選)與新增。

Phase 1 先不做權限;Phase 2 會把「新增/修改主檔」限制為 admin。
"""

from flask import Blueprint, request

from app.core.db import db
from app.core.responses import err, ok
from app.core.validation import validate_body
from app.models import Company
from app.schemas.master import CompanyIn
from app.services import audit_service

companies_bp = Blueprint("companies", __name__)


@companies_bp.get("/companies")
def list_companies():
    # ?role=vendor|receiver → 回傳該用途(含 both)的公司
    role = request.args.get("role")
    query = db.select(Company).where(Company.is_active.is_(True))
    if role in ("vendor", "receiver"):
        query = query.where(Company.role_type.in_([role, "both"]))
    query = query.order_by(Company.name)
    companies = db.session.scalars(query).all()
    return ok([c.to_dict() for c in companies])


@companies_bp.get("/companies/<int:company_id>")
def get_company(company_id: int):
    company = db.session.get(Company, company_id)
    if not company:
        return err("not_found", "找不到該公司", 404)
    return ok(company.to_dict())


@companies_bp.post("/companies")
@validate_body(CompanyIn)
def create_company(payload: CompanyIn):
    company = Company(**payload.model_dump())
    db.session.add(company)
    db.session.flush()  # 先拿到 id 供 audit 使用
    audit_service.record("create_company", "company", company.id)
    db.session.commit()
    return ok(company.to_dict(), 201)

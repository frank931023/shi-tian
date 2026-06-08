"""使用紀錄(稽核)查詢 API:僅 admin。

回溯「誰、何時、做了什麼」——登入、建立/編輯/刪除訂單、主檔異動、產生 PDF 等。
資料來源是各操作呼叫 audit_service.record(...) 寫進 audit_log 的紀錄。
"""

from flask import Blueprint, request
from flask_login import login_required
from sqlalchemy import func

from app.core.db import db
from app.core.responses import err, ok
from app.core.security import admin_required
from app.models import AuditLog, User

audit_bp = Blueprint("audit", __name__)


@audit_bp.get("/audit")
@login_required
@admin_required
def list_audit():
    args = request.args
    try:
        page = max(1, int(args.get("page", 1)))
        page_size = min(100, max(1, int(args.get("page_size", 10))))
    except ValueError:
        return err("bad_param", "page / page_size 必須是數字", 400)

    base = db.select(AuditLog)
    if args.get("action"):
        base = base.where(AuditLog.action == args["action"])

    total = db.session.scalar(db.select(func.count()).select_from(base.subquery()))
    rows = db.session.scalars(
        base.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(page_size).offset((page - 1) * page_size)
    ).all()

    # 取使用者名稱(只查這頁用到的)
    uids = {r.user_id for r in rows if r.user_id}
    users = (
        {u.id: u for u in db.session.scalars(db.select(User).where(User.id.in_(uids))).all()}
        if uids else {}
    )

    items = []
    for r in rows:
        u = users.get(r.user_id)
        items.append({
            "id": r.id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "action": r.action,
            "entity": r.entity,
            "entity_id": r.entity_id,
            "detail": r.detail,
            "username": u.username if u else None,
            "display_name": u.display_name if u else None,
        })

    return ok({"items": items, "page": page, "page_size": page_size, "total": int(total or 0)})

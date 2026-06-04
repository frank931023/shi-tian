"""稽核紀錄寫入的小幫手。

預設自動帶入「目前登入者」;若呼叫端明確指定 user_id(例如登入當下),則用指定值。
不在這裡 commit —— 由呼叫端在同一個交易裡一起 commit,確保「業務寫入」與
「稽核紀錄」要嘛一起成功、要嘛一起失敗。
"""

from typing import Optional

from app.core.db import db
from app.models import AuditLog


def _current_user_id() -> Optional[int]:
    try:
        from flask_login import current_user

        if current_user and current_user.is_authenticated:
            return current_user.id
    except Exception:
        pass
    return None


def record(action: str, entity: str, entity_id: Optional[int] = None,
           detail: Optional[dict] = None, user_id: Optional[int] = None) -> None:
    if user_id is None:
        user_id = _current_user_id()
    db.session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            detail=detail,
        )
    )

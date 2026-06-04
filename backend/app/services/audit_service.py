"""稽核紀錄寫入的小幫手。

Phase 1 沒有登入,user_id 先傳 None;Phase 2 接上認證後改成目前登入者。
不在這裡 commit —— 由呼叫端在同一個交易裡一起 commit,確保「業務寫入」與
「稽核紀錄」要嘛一起成功、要嘛一起失敗。
"""

from typing import Optional

from app.core.db import db
from app.models import AuditLog


def record(action: str, entity: str, entity_id: Optional[int] = None,
           detail: Optional[dict] = None, user_id: Optional[int] = None) -> None:
    db.session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            detail=detail,
        )
    )

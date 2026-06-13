"""匯總所有 model,讓 Alembic(autogenerate)能偵測到全部資料表。

import 順序不影響,但全部都要 import 進來,migration 才完整。
"""

from app.models.audit import AuditLog
from app.models.company import Company
from app.models.order import Order, OrderItem
from app.models.product import ProcessItem, Product
from app.models.setting import Setting
from app.models.spec import Spec
from app.models.user import User

__all__ = [
    "User",
    "Company",
    "Product",
    "ProcessItem",
    "Spec",
    "Order",
    "OrderItem",
    "AuditLog",
    "Setting",
]

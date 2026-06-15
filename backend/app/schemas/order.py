"""訂單輸入驗證(pydantic v2)。

重點:這裡「不接受」前端傳來的 amount / total_amount —— 金額一律後端重算。
就算前端硬塞,pydantic model 也沒有這些欄位,會被忽略。
"""

import re
from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class OrderItemIn(BaseModel):
    product_name: str = Field(min_length=1, max_length=100)
    product_id: Optional[int] = None
    process_no: Optional[str] = Field(default=None, max_length=50)  # 加工單號(每筆品項,選填)
    spec: Optional[str] = Field(default=None, max_length=100)
    process_item: Optional[str] = Field(default=None, max_length=100)
    net_weight_kg: Optional[Decimal] = None
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    unit: Optional[str] = Field(default=None, max_length=20)
    unit_price: Optional[Decimal] = Field(default=None, ge=0)
    remark: Optional[str] = Field(default=None, max_length=255)


class OrderIn(BaseModel):
    vendor_id: Optional[int] = None
    receiver_id: Optional[int] = None
    order_date: date
    order_no: Optional[str] = Field(default=None, max_length=30)  # 不給則自動產生
    status: str = Field(default="draft")
    note: Optional[str] = None
    items: list[OrderItemIn] = Field(min_length=1, max_length=20)  # 1~20 行品項(移轉單一次最多 20 筆,PDF 會自動分頁)

    @field_validator("status")
    @classmethod
    def status_must_be_valid(cls, v: str) -> str:
        allowed = {"draft", "confirmed", "printed", "void"}
        if v not in allowed:
            raise ValueError(f"status 必須是 {allowed} 之一")
        return v

    @field_validator("order_no")
    @classmethod
    def order_no_safe(cls, v: Optional[str]) -> Optional[str]:
        # 單號會被當成 PDF 封存檔名,限定安全字元,杜絕路徑穿越(../ 等)
        if v is None:
            return v
        if not re.fullmatch(r"[A-Za-z0-9_-]+", v):
            raise ValueError("單號只能包含英數字、減號(-)與底線(_)")
        return v

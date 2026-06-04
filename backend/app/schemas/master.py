"""主檔(公司 / 品名 / 加工項目)的輸入驗證。"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role_type: str = Field(default="both")
    phone: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = None

    @field_validator("role_type")
    @classmethod
    def valid_role(cls, v: str) -> str:
        allowed = {"vendor", "receiver", "both"}
        if v not in allowed:
            raise ValueError(f"role_type 必須是 {allowed} 之一")
        return v


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    default_unit: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = None


class ProcessItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class SpecIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)

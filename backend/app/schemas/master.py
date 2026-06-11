"""主檔(公司 / 品名 / 加工項目)的輸入驗證。"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    abbr: Optional[str] = Field(default=None, max_length=100)
    role_type: str = Field(default="vendor")
    phone: Optional[str] = Field(default=None, max_length=50)
    fax: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = None
    detail: Optional[dict] = None  # 完整資料(廠商聯絡人陣列等),後端序列化成 JSON 存 detail 欄

    @field_validator("role_type")
    @classmethod
    def valid_role(cls, v: str) -> str:
        # 廠商與接收一律分開,不再有 both
        allowed = {"vendor", "receiver"}
        if v not in allowed:
            raise ValueError(f"role_type 必須是 {allowed} 之一")
        return v


class CompanyUpdate(BaseModel):
    """更新公司:所有欄位皆選填,只更新有帶的欄位。"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    abbr: Optional[str] = Field(default=None, max_length=100)
    role_type: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    fax: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = None
    detail: Optional[dict] = None  # 帶了就更新完整資料(聯絡人等)

    @field_validator("role_type")
    @classmethod
    def valid_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in {"vendor", "receiver"}:
            raise ValueError("role_type 必須是 vendor 或 receiver")
        return v


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    default_unit: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = None


class ProcessItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class SpecIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: Optional[str] = Field(default=None, max_length=10)
    group_index: Optional[int] = None

    @field_validator("kind")
    @classmethod
    def valid_kind(cls, v: Optional[str]) -> Optional[str]:
        if v not in (None, "", "規格1", "規格2"):
            raise ValueError("kind 必須是 規格1 或 規格2")
        return v or None

"""使用者管理的輸入驗證(僅 admin 可用)。"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator

_ROLES = {"admin", "operator"}


class UserCreateIn(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    display_name: Optional[str] = Field(default=None, max_length=50)
    role: str = "operator"
    password: str = Field(min_length=4, max_length=128)

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in _ROLES:
            raise ValueError(f"role 必須是 {_ROLES} 之一")
        return v


class UserUpdateIn(BaseModel):
    """部分更新:角色 / 啟用狀態 / 重設密碼(都可選)。"""
    display_name: Optional[str] = Field(default=None, max_length=50)
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=4, max_length=128)

    @field_validator("role")
    @classmethod
    def valid_role(cls, v):
        if v is not None and v not in _ROLES:
            raise ValueError(f"role 必須是 {_ROLES} 之一")
        return v

"""輸入驗證 decorator:把 request body 用 pydantic schema 驗證後,
以 keyword 參數 `payload` 傳給 view function;驗證失敗回統一錯誤格式。

用法:
    @bp.post("/companies")
    @validate_body(CompanyIn)
    def create(payload: CompanyIn):
        ...
"""

from functools import wraps
from typing import Type

from flask import request
from pydantic import BaseModel, ValidationError

from app.core.responses import err


def validate_body(schema: Type[BaseModel]):
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            raw = request.get_json(silent=True)
            if raw is None:
                return err("invalid_json", "請傳入 JSON 格式的請求內容", 400)
            try:
                payload = schema.model_validate(raw)
            except ValidationError as e:
                # 回傳第一個錯誤的可讀訊息,detail 帶完整錯誤供前端細部呈現
                first = e.errors()[0]
                loc = ".".join(str(p) for p in first.get("loc", []))
                msg = f"{loc}: {first.get('msg')}" if loc else first.get("msg")
                return err("validation_error", msg or "輸入驗證失敗", 422)
            return view(*args, payload=payload, **kwargs)

        return wrapper

    return decorator

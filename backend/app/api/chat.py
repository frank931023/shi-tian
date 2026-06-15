"""聊天機器人 API。

- GET  /chat/config         任何登入者:回傳權限等級與「我能不能用」
- PUT  /chat/access         僅 admin:設定權限等級(off / admin_only / everyone)
- POST /chat/message        允許者:送出問題,回傳 agent 結果

權限三級(存在 settings 表,key=chatbot_access):
  off        關閉(連管理員也不能用)
  admin_only 僅管理員
  everyone   所有登入者
預設(未設定)視為 off,最安全。
"""

from flask import Blueprint, request
from flask_login import current_user, login_required

from app.core.db import db
from app.core.responses import err, ok
from app.core.security import limiter
from app.models.setting import get_setting, set_setting
from app.services import audit_service
from app.services.chatbot import agent as chat_agent

chat_bp = Blueprint("chat", __name__)

ACCESS_KEY = "chatbot_access"
ACCESS_LEVELS = ("off", "admin_only", "everyone")


def _access_level() -> str:
    val = get_setting(ACCESS_KEY, "off")
    return val if val in ACCESS_LEVELS else "off"


def _allowed_for_current() -> bool:
    level = _access_level()
    if level == "everyone":
        return True
    if level == "admin_only":
        return getattr(current_user, "role", None) == "admin"
    return False  # off


@chat_bp.get("/chat/config")
@login_required
def chat_config():
    return ok({
        "access": _access_level(),
        "allowed": _allowed_for_current(),
        "configured": chat_agent.is_configured(),  # 後端是否已備妥(有 key + 套件)
    })


@chat_bp.put("/chat/access")
@login_required
def set_access():
    if getattr(current_user, "role", None) != "admin":
        return err("forbidden", "僅管理員可調整聊天機器人權限", 403)
    data = request.get_json(silent=True) or {}
    level = data.get("access")
    if level not in ACCESS_LEVELS:
        return err("bad_request", "權限等級必須是 off / admin_only / everyone", 400)
    set_setting(ACCESS_KEY, level)
    audit_service.record("chatbot_set_access", "setting", None, {"access": level})
    db.session.commit()
    return ok({"access": level})


@chat_bp.post("/chat/message")
@login_required
@limiter.limit("20 per minute")  # 防濫用 / 防刷 OpenAI 費用
def chat_message():
    if not _allowed_for_current():
        return err("forbidden", "你目前沒有使用聊天機器人的權限", 403)
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    conversation_id = (data.get("conversation_id") or "").strip()[:64]
    if not message:
        return err("bad_request", "請輸入問題", 400)
    if len(message) > 2000:
        return err("bad_request", "問題太長了,請精簡一下", 400)

    # 對話記憶以「使用者 id : 對話 id」為鍵,避免他人猜到 conversation_id 讀到你的對話
    scoped_conversation = f"{current_user.id}:{conversation_id}"
    result = chat_agent.run_chat(message, scoped_conversation)
    audit_service.record("chat_query", "chat", None, {"intent": result.get("intent")})
    db.session.commit()
    return ok(result)

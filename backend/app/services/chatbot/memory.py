"""對話記憶:每個對話(conversation_id)保留最近幾輪訊息,做為下一次回覆的上下文。

刻意做得「簡單、有界、不落地」:
- 純記憶體 dict,後端重啟即清空(不長期保存使用者的提問內容)。
- 每個對話只保留最後 N 輪(滑動視窗),N 由 CHATBOT_MEMORY_TURNS 控制;
  超過就丟掉最舊的,避免無限成長、也限制送進 LLM 的內容量。
- 全域對話數也設上限,避免記憶體被灌爆(惡意大量產生 conversation_id)。

詳見 docs/chatbot.md「對話記憶如何運作」。
"""

from collections import OrderedDict, deque
from threading import Lock

_MAX_CONVERSATIONS = 500          # 同時保留的對話數上限(LRU 淘汰)
_store: "OrderedDict[str, deque]" = OrderedDict()
_lock = Lock()


def _turns_limit() -> int:
    try:
        from flask import current_app
        return max(1, int(current_app.config.get("CHATBOT_MEMORY_TURNS", 6)))
    except Exception:
        return 6


def get_history(conversation_id: str) -> list[dict]:
    """回傳該對話最近的訊息列表(每筆 {role, content})。"""
    if not conversation_id:
        return []
    with _lock:
        dq = _store.get(conversation_id)
        if dq is None:
            return []
        _store.move_to_end(conversation_id)  # 標記為最近使用(LRU)
        return list(dq)


def append(conversation_id: str, role: str, content: str) -> None:
    """寫入一筆訊息(role: user / assistant);自動裁切到視窗大小。"""
    if not conversation_id:
        return
    # 視窗大小 = N 輪 ×(user+assistant),再加一點緩衝
    maxlen = _turns_limit() * 2
    with _lock:
        dq = _store.get(conversation_id)
        if dq is None:
            if len(_store) >= _MAX_CONVERSATIONS:
                _store.popitem(last=False)  # 淘汰最久沒用的對話
            dq = deque(maxlen=maxlen)
            _store[conversation_id] = dq
        dq.append({"role": role, "content": content[:4000]})  # 單筆也設長度上限
        _store.move_to_end(conversation_id)


def clear(conversation_id: str) -> None:
    with _lock:
        _store.pop(conversation_id, None)

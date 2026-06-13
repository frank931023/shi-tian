"""系統設定(key/value):存放少量全域開關,如聊天機器人權限等級。

刻意做成簡單的 key/value 表,日後要加其他全域設定不必再開新表/migration。
"""

from app.core.db import db


class Setting(db.Model):
    __tablename__ = "settings"

    key = db.Column(db.String(64), primary_key=True)
    value = db.Column(db.Text)

    def to_dict(self) -> dict:
        return {"key": self.key, "value": self.value}


def get_setting(key: str, default: str | None = None) -> str | None:
    row = db.session.get(Setting, key)
    return row.value if row and row.value is not None else default


def set_setting(key: str, value: str) -> None:
    row = db.session.get(Setting, key)
    if row:
        row.value = value
    else:
        db.session.add(Setting(key=key, value=value))
    db.session.commit()

"""密碼雜湊與比對(bcrypt)。

為什麼用 bcrypt:它是慢雜湊(可調工作因子)+ 內建 salt,專門對抗暴力破解。
絕不可存明碼或可逆加密(CLAUDE.md §5)。
"""

import bcrypt


def hash_password(plain: str) -> str:
    """把明碼雜湊成可儲存的字串(含 salt)。"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    """安全比對:bcrypt.checkpw 內部做常數時間比較,避免 timing attack。"""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False

"""SQL 安全驗證(Text-to-SQL 的最後一道防線,純 Python、可單元測試)。

威脅模型:LLM 產生的 SQL 不可信(可能被提示注入操弄、可能誤產生危險語句)。
這裡用「白名單 + 黑名單 + 結構檢查」多層把關,任何一條不過就拒絕執行。
真正執行時還會再用「唯讀資料庫角色 + READ ONLY 交易 + 逾時 + 列數上限」兜底(見 db.py)。

允許:單一條 SELECT(或以 WITH 開頭的唯讀 CTE)。
拒絕:多語句、寫入/DDL、危險函式、系統表、敏感表(users/audit_log/settings…)、註解。
"""

import re

# 只開放給聊天機器人查詢的業務資料表(get_schema 也只揭露這些)
ALLOWED_TABLES = (
    "companies",
    "products",
    "process_items",
    "specs",
    "orders",
    "order_items",
)

# 一律禁止觸及的敏感 / 系統物件(連 SQL 都不准提到)
#  users:密碼雜湊  audit_log:稽核紀錄  settings:系統設定  alembic_version:migration
SENSITIVE_TOKENS = (
    "users",
    "audit_log",
    "settings",
    "alembic_version",
    "information_schema",
    "pg_catalog",
    "pg_authid",
    "pg_shadow",
    "pg_user",
    "pg_roles",
)

# 危險關鍵字 / 函式(出現在任何位置都拒絕,涵蓋 CTE 內的可寫子句與檔案/設定讀取)
FORBIDDEN_KEYWORDS = (
    "insert", "update", "delete", "drop", "alter", "truncate", "create",
    "grant", "revoke", "merge", "call", "do", "vacuum", "analyze", "reindex",
    "cluster", "refresh", "lock", "copy", "into", "nextval", "setval",
    "set", "reset", "begin", "commit", "rollback", "savepoint",
    "listen", "notify", "execute", "prepare", "deallocate",
    "current_setting", "set_config", "pg_sleep", "pg_read_file",
    "pg_read_binary_file", "pg_ls_dir", "pg_stat_file", "lo_import",
    "lo_export", "dblink", "dblink_connect", "to_regclass", "pg_terminate_backend",
    # 基礎設施 / 連線資訊揭露(版本、連線帳號、伺服器位址…)一律不給查
    "version", "current_user", "session_user", "current_database",
    "current_catalog", "current_schema", "inet_server_addr", "inet_client_addr",
    "txid_current",
)

MAX_SQL_LEN = 4000


class SqlRejected(ValueError):
    """SQL 未通過安全驗證時拋出,訊息為「給使用者看的中文原因」。"""


def _strip(sql: str) -> str:
    return (sql or "").strip()


def validate_select(sql: str) -> str:
    """驗證並回傳「清理後可安全執行的單一 SELECT」。不通過則 raise SqlRejected。"""
    s = _strip(sql)
    if not s:
        raise SqlRejected("沒有可執行的查詢")
    if len(s) > MAX_SQL_LEN:
        raise SqlRejected("查詢過長,已拒絕")

    # 1) 禁止註解(可能被用來藏注入)
    if "--" in s or "/*" in s or "*/" in s:
        raise SqlRejected("查詢不可包含註解")

    # 2) 去掉結尾分號後,不可再有分號(防堆疊多語句,如「SELECT …; DROP …」)
    core = s.rstrip().rstrip(";").rstrip()
    if ";" in core:
        raise SqlRejected("一次只能執行一條查詢")

    lowered = core.lower()

    # 3) 必須是唯讀查詢:以 select 或 with 開頭(允許前置括號)
    head = lowered.lstrip("( \t\r\n")
    if not (head.startswith("select") or head.startswith("with")):
        raise SqlRejected("只允許 SELECT 查詢")

    # 4) 黑名單關鍵字(以「單字邊界」比對,避免誤砍欄位名;涵蓋 CTE 內可寫子句)
    for kw in FORBIDDEN_KEYWORDS:
        if re.search(rf"(?<![a-z0-9_]){re.escape(kw)}(?![a-z0-9_])", lowered):
            raise SqlRejected(f"查詢包含不允許的關鍵字:{kw}")

    # 5) 敏感 / 系統物件:連提到都拒絕
    for tok in SENSITIVE_TOKENS:
        if re.search(rf"(?<![a-z0-9_]){re.escape(tok)}(?![a-z0-9_])", lowered):
            raise SqlRejected("查詢試圖存取受保護的資料,已拒絕")

    # 6) 其餘 pg_ 開頭的系統函式 / 物件一律擋
    if re.search(r"(?<![a-z0-9_])pg_[a-z0-9_]+", lowered):
        raise SqlRejected("查詢試圖存取系統物件,已拒絕")

    return core


def enforce_limit(sql: str, max_rows: int) -> str:
    """若查詢沒有自帶 LIMIT,補上一個上限,避免一次撈爆。"""
    if re.search(r"(?<![a-z0-9_])limit(?![a-z0-9_])", sql.lower()):
        return sql
    return f"{sql.rstrip()} LIMIT {int(max_rows)}"


def is_safe_select(sql: str) -> tuple[bool, str]:
    """方便測試 / 呼叫端用:回傳 (是否安全, 原因)。"""
    try:
        validate_select(sql)
        return True, "ok"
    except SqlRejected as e:
        return False, str(e)

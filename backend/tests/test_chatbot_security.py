"""聊天機器人 SQL 安全驗證測試(純 Python,不需 DB / 不需 OpenAI)。

執行:在 backend/ 下  python -m tests.test_chatbot_security
這是 Text-to-SQL 最關鍵的防線,任何修改都應先跑過這支。
"""

from app.services.chatbot.security import enforce_limit, is_safe_select

SAFE = [
    "SELECT * FROM orders LIMIT 10",
    "select o.order_no, c.name from orders o join companies c on c.id=o.vendor_id",
    "WITH t AS (SELECT vendor_id, count(*) n FROM orders GROUP BY vendor_id) SELECT * FROM t",
    "SELECT name FROM products WHERE name LIKE '%HBS%'",
]

# (語句, 期望被擋的原因關鍵)
BLOCK = [
    "SELECT * FROM users",                       # 密碼雜湊表
    "SELECT password_hash FROM users",
    "SELECT * FROM audit_log",                   # 稽核
    "SELECT * FROM settings",                    # 系統設定
    "SELECT 1; DROP TABLE orders",               # 堆疊多語句
    "DROP TABLE orders",                         # DDL
    "DELETE FROM orders",                        # 寫入
    "UPDATE orders SET note='x'",
    "INSERT INTO orders(order_no) VALUES('x')",
    "WITH x AS (INSERT INTO orders DEFAULT VALUES RETURNING id) SELECT * FROM x",
    "SELECT * FROM orders -- comment",           # 註解
    "SELECT pg_read_file('/etc/passwd')",        # 讀檔
    "SELECT current_setting('x')",               # 讀設定
    "SELECT * FROM pg_catalog.pg_tables",        # 系統表
    "SELECT * FROM information_schema.columns",
    "SELECT * FROM orders INTO outfile",
    "TRUNCATE orders",
    "",
]


def run() -> bool:
    ok = True
    for q in SAFE:
        passed, why = is_safe_select(q)
        if not passed:
            ok = False
            print("FAIL(should pass):", q, "=>", why)
    for q in BLOCK:
        passed, _ = is_safe_select(q)
        if passed:
            ok = False
            print("FAIL(should block):", repr(q))
    assert enforce_limit("SELECT * FROM orders", 200).endswith("LIMIT 200")
    assert enforce_limit("SELECT * FROM orders LIMIT 5", 200).endswith("LIMIT 5")
    print("ALL TESTS", "PASSED" if ok else "FAILED")
    return ok


if __name__ == "__main__":
    raise SystemExit(0 if run() else 1)

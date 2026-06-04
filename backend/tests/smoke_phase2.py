"""Phase 2 煙霧測試:認證、授權(admin/operator)、CSRF、rate limit、audit。

跑法(backend/ 下,venv 已啟動):
    DATABASE_URL="sqlite:///smoke2.db" SECRET_KEY=test PYTHONPATH=. python tests/smoke_phase2.py
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///smoke2.db")
os.environ.setdefault("SECRET_KEY", "test")
# 測試環境關閉 secure cookie(否則 test client 不帶 cookie)
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")

from app import create_app  # noqa: E402
from app.core.db import db  # noqa: E402
from app.models import User  # noqa: E402
from app.services import auth_service  # noqa: E402

PASS = "✅"


def check(name: str, cond: bool, extra: str = "") -> None:
    assert cond, f"FAILED: {name} {extra}"
    print(f"{PASS} {name} {extra}")


def seed_user(app, username, role, password="pw123456"):
    with app.app_context():
        u = User(username=username, display_name=username, role=role,
                 password_hash=auth_service.hash_password(password))
        db.session.add(u)
        db.session.commit()


def login(client, username, password="pw123456"):
    """登入並回傳 csrf token(供寫入請求帶 header)。"""
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.get_data(as_text=True)
    return r.get_json()["data"]["csrf"]


def main() -> None:
    app = create_app()
    # 關掉 limiter 對其他測試的干擾(只在最後單獨測 rate limit)
    with app.app_context():
        db.drop_all()
        db.create_all()
    seed_user(app, "admin", "admin")
    seed_user(app, "oper", "operator")

    # --- 未登入被擋 ---
    anon = app.test_client()
    r = anon.get("/api/orders")
    check("未登入打受保護端點 → 401", r.status_code == 401, str(r.status_code))

    # --- 密碼是 bcrypt 雜湊(非明碼) ---
    with app.app_context():
        h = db.session.scalar(db.select(User.password_hash).where(User.username == "admin"))
    check("密碼以 bcrypt 雜湊儲存", h.startswith("$2") and "pw123456" not in h)

    # --- 錯誤密碼登入失敗 ---
    r = anon.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    check("錯誤密碼 → 401", r.status_code == 401)

    # --- admin 登入,可建主檔 ---
    admin = app.test_client()
    admin_csrf = login(admin, "admin")
    r = admin.post("/api/companies", json={"name": "甲廠商", "role_type": "vendor"},
                   headers={"X-CSRF-Token": admin_csrf})
    check("admin 可建主檔 (201)", r.status_code == 201, str(r.status_code))
    vendor_id = r.get_json()["data"]["id"]

    # --- CSRF:不帶 header 的寫入被擋 ---
    r = admin.post("/api/companies", json={"name": "X"})
    check("缺少 CSRF header → 403", r.status_code == 403, str(r.status_code))

    # --- operator 登入 ---
    oper = app.test_client()
    oper_csrf = login(oper, "oper")

    # operator 不可建主檔
    r = oper.post("/api/companies", json={"name": "Y", "role_type": "vendor"},
                  headers={"X-CSRF-Token": oper_csrf})
    check("operator 建主檔 → 403", r.status_code == 403, str(r.status_code))

    # operator 可建單
    r = oper.post("/api/orders", json={
        "vendor_id": vendor_id, "order_date": "2026-06-04",
        "items": [{"product_name": "HBS", "quantity": "2", "unit_price": "10"}],
    }, headers={"X-CSRF-Token": oper_csrf})
    check("operator 可建單 (201)", r.status_code == 201, str(r.status_code))
    order_id = r.get_json()["data"]["id"]

    # operator 不可刪單(admin only)
    r = oper.delete(f"/api/orders/{order_id}", headers={"X-CSRF-Token": oper_csrf})
    check("operator 刪單 → 403", r.status_code == 403, str(r.status_code))

    # admin 可刪單
    r = admin.delete(f"/api/orders/{order_id}", headers={"X-CSRF-Token": admin_csrf})
    check("admin 可刪單 (200)", r.status_code == 200, str(r.status_code))

    # --- /auth/me 還原登入狀態 ---
    r = admin.get("/api/auth/me")
    check("/auth/me 回登入者", r.get_json()["data"]["username"] == "admin")

    # --- audit_log 記到 user_id ---
    with app.app_context():
        from app.models import AuditLog
        rows = db.session.scalars(db.select(AuditLog).where(AuditLog.action == "create_order")).all()
    check("audit_log 記錄了建單者 user_id", len(rows) == 1 and rows[0].user_id is not None)

    # --- rate limit:連續登入失敗超過 10 次/分 → 429 ---
    rl = app.test_client()
    codes = [rl.post("/api/auth/login", json={"username": "admin", "password": "x"}).status_code
             for _ in range(12)]
    check("login rate limit 觸發 (429)", 429 in codes, f"codes={codes[-3:]}")

    print("\n\U0001F389 Phase 2 煙霧測試全部通過")


if __name__ == "__main__":
    main()

"""Phase 1 煙霧測試:用 SQLite 快速驗證 CRUD / 金額重算 / 快照 / 篩選邏輯。

這支不是正式測試框架,只是「可重現的驗證範例」(CLAUDE.md §6)。
注意:主檔/訂單端點需登入 + CSRF(Phase 2 起),故這裡先建 admin 並登入。
跑法(在 backend/ 下、venv 已啟動):
    DATABASE_URL="sqlite:///smoke.db" SECRET_KEY=test python tests/smoke_phase1.py
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///smoke.db")
os.environ.setdefault("SECRET_KEY", "test")
# 關閉 secure cookie,否則 test client 走 http 不會帶 session cookie
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")

from app import create_app  # noqa: E402
from app.core.db import db  # noqa: E402

PASS = "✅"


def check(name: str, cond: bool, extra: str = "") -> None:
    assert cond, f"FAILED: {name} {extra}"
    print(f"{PASS} {name} {extra}")


def main() -> None:
    app = create_app()
    with app.app_context():
        db.drop_all()
        db.create_all()
        # 建一個 admin 供登入(主檔/訂單寫入需要)
        from app.models import User
        from app.services import auth_service
        db.session.add(User(
            username="admin", display_name="admin", role="admin",
            password_hash=auth_service.hash_password("pw123456"),
        ))
        db.session.commit()

    c = app.test_client()
    # 登入並取得 csrf token;之後寫入請求都帶 X-CSRF-Token
    r = c.post("/api/auth/login", json={"username": "admin", "password": "pw123456"})
    check("admin 登入", r.status_code == 200, str(r.status_code))
    H = {"X-CSRF-Token": r.get_json()["data"]["csrf"]}

    # --- 建立主檔 ---
    r = c.post("/api/companies", json={"name": "甲廠商", "role_type": "vendor"}, headers=H)
    check("建立廠商公司", r.status_code == 201, str(r.status_code))
    vendor_id = r.get_json()["data"]["id"]

    r = c.post("/api/companies", json={"name": "乙接收", "role_type": "receiver"}, headers=H)
    receiver_id = r.get_json()["data"]["id"]

    r = c.post("/api/products", json={"name": "HBS", "default_unit": "K"}, headers=H)
    check("建立品名", r.status_code == 201)

    # role 篩選:vendor 不該回傳 receiver-only 的公司
    r = c.get("/api/companies?role=vendor")
    names = [x["name"] for x in r.get_json()["data"]]
    check("companies?role=vendor 篩選", "甲廠商" in names and "乙接收" not in names)

    # --- 建立訂單(含 2 行品項,驗證金額後端重算)---
    order_payload = {
        "vendor_id": vendor_id,
        "receiver_id": receiver_id,
        "order_date": "2026-06-04",
        "note": "測試單",
        "items": [
            # 故意塞一個假 amount,後端應忽略並自己算 12.5 * 4 = 50.00
            {"product_name": "HBS", "spec": "1/2-H17", "quantity": "4", "unit_price": "12.5", "amount": "99999"},
            {"product_name": "螺帽", "quantity": "3", "unit_price": "10", "process_item": "車刃"},
        ],
    }
    r = c.post("/api/orders", json=order_payload, headers=H)
    check("建立訂單", r.status_code == 201, str(r.status_code))
    order = r.get_json()["data"]
    order_id = order["id"]

    check("單號自動產生 (YYYYMMDD-NNN)", order["order_no"] == "20260604-001", order["order_no"])
    check("第1行金額後端重算 = 50.0", order["items"][0]["amount"] == 50.0, str(order["items"][0]["amount"]))
    check("前端塞的假 amount 被忽略", order["items"][0]["amount"] != 99999)
    check("第2行金額 = 30.0", order["items"][1]["amount"] == 30.0)
    check("總額 = 80.0", order["total_amount"] == 80.0, str(order["total_amount"]))

    # --- 反正規化快照:改品名主檔不影響已建訂單 ---
    r = c.get(f"/api/orders/{order_id}")
    check("快照:訂單存的是品名文字", r.get_json()["data"]["items"][0]["product_name"] == "HBS")

    # --- 驗證失敗:沒有 items 應回 422 ---
    r = c.post("/api/orders", json={"order_date": "2026-06-04", "items": []}, headers=H)
    check("空 items 驗證失敗 (422)", r.status_code == 422, str(r.status_code))

    # --- 篩選 + 分頁 ---
    r = c.get("/api/orders?vendor_id=%d" % vendor_id)
    body = r.get_json()["data"]
    check("list 依 vendor_id 篩選", body["total"] == 1 and len(body["items"]) == 1)

    r = c.get("/api/orders?product=HBS")
    check("list 依品名篩選 (子查詢)", r.get_json()["data"]["total"] == 1)

    r = c.get("/api/orders?from=2026-06-05&to=2026-06-30")
    check("list 日期區間排除掉舊單", r.get_json()["data"]["total"] == 0)

    # --- 更新:改數量,總額應跟著重算 ---
    order_payload["items"][0]["quantity"] = "10"  # 10 * 12.5 = 125
    r = c.put(f"/api/orders/{order_id}", json=order_payload, headers=H)
    check("更新後總額重算 = 155.0", r.get_json()["data"]["total_amount"] == 155.0,
          str(r.get_json()["data"]["total_amount"]))

    # --- 刪除 ---
    r = c.delete(f"/api/orders/{order_id}", headers=H)
    check("刪除訂單", r.status_code == 200)
    r = c.get(f"/api/orders/{order_id}")
    check("刪除後查不到 (404)", r.status_code == 404)

    # --- audit_log 有記錄 ---
    with app.app_context():
        from app.models import AuditLog
        actions = [a.action for a in db.session.scalars(db.select(AuditLog)).all()]
    check("audit_log 記錄了 create/update/delete_order",
          {"create_order", "update_order", "delete_order"}.issubset(set(actions)),
          str(actions))

    print("\n\U0001F389 Phase 1 煙霧測試全部通過")


if __name__ == "__main__":
    main()

"""自訂 Flask CLI 指令。

建立第一個 admin:
    flask create-admin --username admin --display-name 管理員
(會互動式詢問密碼;或用 --password,但較不安全會留在 shell 歷史)
"""

import getpass
import json
import re
from pathlib import Path

import click
from flask import Flask

from app.core.db import db
from app.models import Company, Order, ProcessItem, Product, Spec, User
from app.services import auth_service


def _load_jsonc(path: Path):
    """讀取 .jsonc:容許行註解與尾逗號(realdata 用)。

    注意:用 (^|\\s)// 才不會把字串裡的 1/4" 之類的單斜線或網址誤刪;
    realdata 目前無 // 註解,但保留容錯。
    """
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"(^|\s)//[^\n]*", r"\1", text)  # 去掉 // 行註解(避免誤傷字串內單斜線)
    text = re.sub(r",(\s*[}\]])", r"\1", text)      # 去掉尾逗號
    return json.loads(text)


def register_cli(app: Flask) -> None:
    @app.cli.command("create-admin")
    @click.option("--username", required=True, help="登入帳號")
    @click.option("--display-name", default=None, help="顯示名稱")
    @click.option("--password", default=None, help="密碼(省略則互動輸入,較安全)")
    def create_admin(username: str, display_name: str, password: str):
        existing = db.session.scalar(db.select(User).where(User.username == username))
        if existing:
            click.echo(f"帳號 {username} 已存在,取消。")
            return

        if not password:
            password = getpass.getpass("請輸入密碼:")
            confirm = getpass.getpass("再次輸入密碼:")
            if password != confirm:
                click.echo("兩次密碼不一致,取消。")
                return

        user = User(
            username=username,
            display_name=display_name or username,
            role="admin",
            password_hash=auth_service.hash_password(password),
        )
        db.session.add(user)
        db.session.commit()
        click.echo(f"已建立 admin:{username}")

    @app.cli.command("create-user")
    @click.option("--username", required=True)
    @click.option("--role", default="operator", type=click.Choice(["admin", "operator"]))
    @click.option("--display-name", default=None)
    @click.option("--password", default=None, help="省略則互動輸入")
    def create_user(username: str, role: str, display_name: str, password: str):
        """建立任意角色的使用者(admin 或 operator)。"""
        if db.session.scalar(db.select(User).where(User.username == username)):
            click.echo(f"帳號 {username} 已存在,取消。")
            return
        if not password:
            password = getpass.getpass("請輸入密碼:")
        user = User(
            username=username,
            display_name=display_name or username,
            role=role,
            password_hash=auth_service.hash_password(password),
        )
        db.session.add(user)
        db.session.commit()
        click.echo(f"已建立 {role}:{username}")

    @app.cli.command("seed-real")
    @click.option("--path", "path_str", default=None, help="realdata 資料夾路徑(預設為專案根目錄的 realdata)")
    @click.option("--reset", is_flag=True,
                  help="先清空主檔(公司/品名/加工/規格)再灌;會一併解除既有訂單的廠商/接收連結")
    def seed_real(path_str: str, reset: bool):
        """把 realdata/ 的 .jsonc 灌進主檔(冪等:已存在的名稱會略過)。

        對應檔案(中文檔名):
          廠商單位.jsonc → 公司(role=vendor)   接收單位.jsonc → 公司(role=receiver)
          品名.jsonc → 品名   加工項目.jsonc → 加工項目   規格.jsonc → 規格(分 規格1/規格2)
        廠商與接收「分開」匯入,不合併成 both。
        """
        # 預設路徑:backend/app/core/cli.py → 往上 3 層是 repo 根目錄
        root = Path(__file__).resolve().parents[3]
        base = Path(path_str) if path_str else root / "realdata"
        if not base.exists():
            click.echo(f"找不到 realdata 資料夾:{base}")
            return

        if reset:
            # 先解除訂單對公司的外鍵連結(保留訂單,只是廠商/接收變空),再清空主檔
            db.session.execute(db.update(Order).values(vendor_id=None, receiver_id=None))
            for model in (Spec, ProcessItem, Product, Company):
                db.session.query(model).delete()
            db.session.commit()
            click.echo("已清空主檔(公司/品名/加工/規格)並解除既有訂單的廠商/接收連結")

        added = {"vendor": 0, "receiver": 0, "product": 0, "process": 0, "spec": 0}
        existing_companies = {c.name for c in db.session.scalars(db.select(Company)).all()}

        # ---- 廠商單位:name=company;多個聯絡人 → 取第一個的電話/傳真,其餘摘要進 note ----
        for v in _load_jsonc(base / "廠商單位.jsonc"):
            name = (v.get("company") or "").strip()
            if not name or name in existing_companies:
                continue
            contacts = v.get("contact") or []
            first = contacts[0] if contacts else {}
            phone = (first.get("company_phone") or first.get("mobile") or "").strip() or None
            fax = (first.get("company_fax") or "").strip() or None
            lines = []
            for c in contacts:
                parts = [c.get("name"), c.get("company_phone"), c.get("company_fax"), c.get("mobile")]
                line = " / ".join(p for p in parts if p)
                if line:
                    lines.append(line)
            note = "聯絡人:\n" + "\n".join(lines) if lines else None
            db.session.add(Company(
                name=name, role_type="vendor",
                phone=phone, fax=fax, address=(v.get("address") or "").strip() or None, note=note,
                detail=json.dumps(v, ensure_ascii=False),  # 保留完整原始資料(多位聯絡人)供查看
            ))
            existing_companies.add(name)
            added["vendor"] += 1

        # ---- 接收單位:name=factory;proccessMethod/聯絡人/手機 摘要進 note ----
        for r in _load_jsonc(base / "接收單位.jsonc"):
            name = (r.get("factory") or "").strip()
            if not name or name in existing_companies:
                continue
            note_parts = []
            if r.get("proccessMethod"):
                note_parts.append("加工方式:" + r["proccessMethod"])
            if r.get("name"):
                note_parts.append("聯絡人:" + r["name"])
            if r.get("mobile"):
                note_parts.append("手機:" + r["mobile"])
            db.session.add(Company(
                name=name, role_type="receiver",
                phone=(r.get("phone") or "").strip() or None,
                fax=(r.get("fax") or "").strip() or None,
                address=(r.get("address") or "").strip() or None,
                note="\n".join(note_parts) or None,
                detail=json.dumps(r, ensure_ascii=False),  # 保留完整原始資料供查看
            ))
            existing_companies.add(name)
            added["receiver"] += 1

        # ---- 品名 ----
        existing_products = {p.name for p in db.session.scalars(db.select(Product)).all()}
        for p in _load_jsonc(base / "品名.jsonc"):
            nm = (p.get("name") or "").strip()
            if not nm or nm in existing_products:
                continue
            db.session.add(Product(name=nm))
            existing_products.add(nm)
            added["product"] += 1

        # ---- 加工項目 ----
        existing_proc = {p.name for p in db.session.scalars(db.select(ProcessItem)).all()}
        for p in _load_jsonc(base / "加工項目.jsonc"):
            nm = (p.get("name") or "").strip()
            if not nm or nm in existing_proc:
                continue
            db.session.add(ProcessItem(name=nm))
            existing_proc.add(nm)
            added["process"] += 1

        # ---- 規格:分組的 規格1[] / 規格2[];保留 group_index 以做「規格1→規格2」連動 ----
        existing_specs = {(s.name, s.kind, s.group_index)
                          for s in db.session.scalars(db.select(Spec)).all()}
        for gi, group in enumerate(_load_jsonc(base / "規格.jsonc")):
            for kind in ("規格1", "規格2"):
                for nm in group.get(kind, []):
                    nm = (nm or "").strip()
                    if not nm or (nm, kind, gi) in existing_specs:
                        continue
                    db.session.add(Spec(name=nm, kind=kind, group_index=gi))
                    existing_specs.add((nm, kind, gi))
                    added["spec"] += 1

        db.session.commit()
        click.echo(
            f"已匯入:廠商 {added['vendor']} / 接收 {added['receiver']} / 品名 {added['product']} / "
            f"加工 {added['process']} / 規格 {added['spec']}"
        )

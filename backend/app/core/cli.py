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
from app.models import Company, ProcessItem, Product, Spec, User
from app.services import auth_service


def _load_jsonc(path: Path):
    """讀取 .jsonc:容許 // 註解與尾逗號(mockdata 用)。"""
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"//[^\n]*", "", text)          # 去掉 // 行註解
    text = re.sub(r",(\s*[}\]])", r"\1", text)     # 去掉尾逗號
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

    @app.cli.command("seed-mock")
    @click.option("--path", "path_str", default=None, help="mockdata 資料夾路徑(預設為專案根目錄的 mockdata)")
    def seed_mock(path_str: str):
        """把 mockdata/ 的 .jsonc 灌進主檔(冪等:已存在的名稱會略過)。"""
        # 預設路徑:backend/app/core/cli.py → 往上 3 層是 repo 根目錄
        root = Path(__file__).resolve().parents[3]
        base = Path(path_str) if path_str else root / "mockdata"
        if not base.exists():
            click.echo(f"找不到 mockdata 資料夾:{base}")
            return

        # 公司:廠商(plant)與接收(receive)依名稱合併;兩邊都有 → both
        plants = {c["name"] for c in _load_jsonc(base / "plant.jsonc")}
        receives = {c["name"] for c in _load_jsonc(base / "receive.jsonc")}
        # 保留各自的詳細資料(電話/地址)取任一份
        details = {}
        for c in _load_jsonc(base / "plant.jsonc") + _load_jsonc(base / "receive.jsonc"):
            details.setdefault(c["name"], c)

        added = {"company": 0, "product": 0, "process": 0, "spec": 0}
        existing_companies = {c.name for c in db.session.scalars(db.select(Company)).all()}
        for name in sorted(plants | receives):
            if name in existing_companies:
                continue
            role = "both" if (name in plants and name in receives) else ("vendor" if name in plants else "receiver")
            d = details.get(name, {})
            db.session.add(Company(
                name=name, role_type=role,
                phone=d.get("contact"), address=d.get("address"),
            ))
            added["company"] += 1

        existing_products = {p.name for p in db.session.scalars(db.select(Product)).all()}
        for p in _load_jsonc(base / "product.jsonc"):
            if p["name"] in existing_products:
                continue
            db.session.add(Product(name=p["name"], note=p.get("description")))
            added["product"] += 1

        existing_proc = {p.name for p in db.session.scalars(db.select(ProcessItem)).all()}
        for p in _load_jsonc(base / "process.jsonc"):
            if p["name"] in existing_proc:
                continue
            db.session.add(ProcessItem(name=p["name"]))
            added["process"] += 1

        existing_specs = {s.name for s in db.session.scalars(db.select(Spec)).all()}
        for s in _load_jsonc(base / "size.jsonc"):
            if s["name"] in existing_specs:
                continue
            db.session.add(Spec(name=s["name"]))
            added["spec"] += 1

        db.session.commit()
        click.echo(
            f"已匯入:公司 {added['company']} / 品名 {added['product']} / "
            f"加工 {added['process']} / 規格 {added['spec']}"
        )

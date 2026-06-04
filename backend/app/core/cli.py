"""自訂 Flask CLI 指令。

建立第一個 admin:
    flask create-admin --username admin --display-name 管理員
(會互動式詢問密碼;或用 --password,但較不安全會留在 shell 歷史)
"""

import getpass

import click
from flask import Flask

from app.core.db import db
from app.models import User
from app.services import auth_service


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

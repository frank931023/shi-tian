"""add settings table (key/value 全域設定;聊天機器人權限等級)

Revision ID: a7c9e1f3b5d8
Revises: f6a8b0c2d4e6
Create Date: 2026-06-13 00:00:00.000000

簡單的 key/value 設定表。第一個用途:聊天機器人權限等級
(off / admin_only / everyone),預設不寫入(視為 off,最安全)。
"""
from alembic import op
import sqlalchemy as sa


revision = 'a7c9e1f3b5d8'
down_revision = 'f6a8b0c2d4e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'settings',
        sa.Column('key', sa.String(length=64), primary_key=True),
        sa.Column('value', sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_table('settings')

"""add companies.abbr (縮寫;預設等於名稱)

Revision ID: e5f7a9c1b3d2
Revises: d4e6f8a0b2c4
Create Date: 2026-06-09 00:00:00.000000

接收/廠商單位的「縮寫」。預設等於名稱,使用者可在主檔自行修改。
銷貨統計表的「收料單位」會顯示此縮寫(即時讀取)。
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f7a9c1b3d2'
down_revision = 'd4e6f8a0b2c4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('companies', sa.Column('abbr', sa.String(length=100), nullable=True))
    # 既有資料:縮寫先預設等於名稱
    op.execute("UPDATE companies SET abbr = name WHERE abbr IS NULL")


def downgrade():
    op.drop_column('companies', 'abbr')

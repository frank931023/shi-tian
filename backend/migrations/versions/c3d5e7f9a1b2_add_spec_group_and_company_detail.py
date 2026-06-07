"""add specs.group_index and companies.detail

Revision ID: c3d5e7f9a1b2
Revises: b7c9d1e3f5a2
Create Date: 2026-06-07 01:00:00.000000

新增:
- specs.group_index:規格分組(規格1 與規格2 的可搭配組合);選了規格1 後規格2 只顯示同組值。
- companies.detail:公司完整原始資料(JSON 字串,例如廠商的多位聯絡人、接收的加工方式),供點入查看詳細。
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d5e7f9a1b2'
down_revision = 'b7c9d1e3f5a2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('specs', sa.Column('group_index', sa.Integer(), nullable=True))
    op.add_column('companies', sa.Column('detail', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('companies', 'detail')
    op.drop_column('specs', 'group_index')

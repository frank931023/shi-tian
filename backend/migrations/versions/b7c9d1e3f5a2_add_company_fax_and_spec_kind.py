"""add company.fax and spec.kind

Revision ID: b7c9d1e3f5a2
Revises: c785123a08bb
Create Date: 2026-06-07 00:00:00.000000

新增:
- companies.fax:接收/廠商單位的傳真(realdata 有傳真欄)
- specs.kind:規格分「規格1 / 規格2」兩類(None=舊資料,兩類皆可用)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7c9d1e3f5a2'
down_revision = 'c785123a08bb'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('companies', sa.Column('fax', sa.String(length=50), nullable=True))
    op.add_column('specs', sa.Column('kind', sa.String(length=10), nullable=True))


def downgrade():
    op.drop_column('specs', 'kind')
    op.drop_column('companies', 'fax')

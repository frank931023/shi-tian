"""add process_items.note (加工項目備註)

Revision ID: f6a8b0c2d4e6
Revises: e5f7a9c1b3d2
Create Date: 2026-06-12 00:00:00.000000

加工項目主檔新增「備註」欄位(品名 products.note 已存在)。
"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a8b0c2d4e6'
down_revision = 'e5f7a9c1b3d2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('process_items', sa.Column('note', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('process_items', 'note')

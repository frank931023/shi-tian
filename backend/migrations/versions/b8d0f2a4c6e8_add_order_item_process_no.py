"""add order_items.process_no (加工單號,每筆品項選填)

Revision ID: b8d0f2a4c6e8
Revises: a7c9e1f3b5d8
Create Date: 2026-06-13 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b8d0f2a4c6e8'
down_revision = 'a7c9e1f3b5d8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('order_items', sa.Column('process_no', sa.String(length=50), nullable=True))


def downgrade():
    op.drop_column('order_items', 'process_no')

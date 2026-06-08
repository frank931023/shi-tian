"""add orders.is_deleted (soft delete / trash)

Revision ID: d4e6f8a0b2c4
Revises: c3d5e7f9a1b2
Create Date: 2026-06-08 00:00:00.000000

軟刪除:刪除訂單改成把 is_deleted 設為 true(移到垃圾桶,可復原);
垃圾桶內才做永久刪除。既有資料預設 false。
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e6f8a0b2c4'
down_revision = 'c3d5e7f9a1b2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'orders',
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column('orders', 'is_deleted')

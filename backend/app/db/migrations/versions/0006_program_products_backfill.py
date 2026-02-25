"""backfill program plan products metadata

Revision ID: 0006_program_products_backfill
Revises: 0005_route_days
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_program_products_backfill"
down_revision = "0005_route_days"
branch_labels = None
depends_on = None


def _update(code: str, plan: str, valid_days: int, ai_credits: int) -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE products
            SET
              type = 'program',
              metadata = COALESCE(metadata::jsonb, '{}'::jsonb)
                || jsonb_build_object(
                     'plan', :plan,
                     'valid_days', :valid_days,
                     'ai_credits', :ai_credits
                   )
            WHERE code = :code
            """
        ),
        {
            "code": code,
            "plan": plan,
            "valid_days": valid_days,
            "ai_credits": ai_credits,
        },
    )


def upgrade() -> None:
    _update("PLAN_START", "start", 14, 1200)
    _update("PLAN_PRO", "pro", 30, 8000)
    _update("PLAN_INTENSIVE", "intensive", 45, 15000)


def downgrade() -> None:
    # Data backfill is intentionally non-destructive on downgrade.
    return

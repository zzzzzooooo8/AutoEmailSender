"""merge material and signature heads

Revision ID: e3f9a7c1b2d4
Revises: 1b8c2f4d9e6a, c8d7e1a42b90
Create Date: 2026-04-19 14:10:00.000000

"""

from typing import Sequence, Union


revision: str = "e3f9a7c1b2d4"
down_revision: Union[str, Sequence[str], None] = ("1b8c2f4d9e6a", "c8d7e1a42b90")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

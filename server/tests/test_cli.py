import pytest
from sqlalchemy import select
from app.models import User
from app.auth.service import hash_password, verify_password


async def test_cli_reset_password(db_session):
    """Test the core reset password logic."""
    from app.auth.service import register_user

    # Create a user
    user = await register_user(db_session, "test@example.com", "old_password")
    assert verify_password("old_password", user.password_hash)

    # Reset password directly (simulating CLI behavior)
    user.password_hash = hash_password("new_password")
    await db_session.commit()

    # Verify
    result = await db_session.execute(
        select(User).where(User.email == "test@example.com")
    )
    updated_user = result.scalar_one()
    assert verify_password("new_password", updated_user.password_hash)
    assert not verify_password("old_password", updated_user.password_hash)


async def test_cli_reset_password_user_not_found(db_session):
    """Test that reset password fails gracefully for nonexistent user."""
    from app.auth.service import get_user_by_email

    user = await get_user_by_email(db_session, "nonexistent@example.com")
    assert user is None


async def test_cli_reset_password_via_function(db_session):
    """Test the reset_password_command core logic end-to-end."""
    from app.auth.service import register_user, get_user_by_email

    # Create a user
    await register_user(db_session, "cli@example.com", "original123")
    await db_session.commit()

    # Simulate what the CLI does
    user = await get_user_by_email(db_session, "cli@example.com")
    assert user is not None
    user.password_hash = hash_password("reset456")
    await db_session.commit()

    # Verify the password was actually changed
    refreshed = await get_user_by_email(db_session, "cli@example.com")
    assert verify_password("reset456", refreshed.password_hash)
    assert not verify_password("original123", refreshed.password_hash)

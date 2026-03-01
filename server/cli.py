import asyncio
import sys
from getpass import getpass


async def reset_password_command(email: str, new_password: str):
    # Import here to avoid circular imports at module level
    from app.database import async_session, init_db
    from app.auth.service import get_user_by_email, hash_password, revoke_user_tokens

    await init_db()
    async with async_session() as db:
        user = await get_user_by_email(db, email)
        if not user:
            print(f"Error: User '{email}' not found")
            sys.exit(1)
        user.password_hash = hash_password(new_password)
        await revoke_user_tokens(db, user.id)
        await db.commit()
        print(f"Password reset successfully for {email} (all sessions revoked)")


def main():
    if len(sys.argv) < 3 or sys.argv[1] != "reset-password":
        print("Usage: python -m cli reset-password <email>")
        sys.exit(1)
    email = sys.argv[2]
    if len(sys.argv) > 3:
        new_password = sys.argv[3]
    else:
        new_password = getpass("New password: ")
    if len(new_password) < 6:
        print("Error: Password must be at least 6 characters")
        sys.exit(1)
    asyncio.run(reset_password_command(email, new_password))


if __name__ == "__main__":
    main()

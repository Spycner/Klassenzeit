"""Password hashing and validation.

Hashing uses argon2id via argon2-cffi (PHC winner, modern default).
Validation follows NIST 800-63B: minimum length + common-password
blocklist, no composition rules.
"""

from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()

_MAX_PASSWORD_LENGTH = 128
_COMMON_PASSWORDS: frozenset[str] | None = None


def _load_common_passwords() -> frozenset[str]:
    global _COMMON_PASSWORDS  # noqa: PLW0603
    if _COMMON_PASSWORDS is None:
        path = Path(__file__).parent / "common_passwords.txt"
        _COMMON_PASSWORDS = frozenset(
            line.strip().lower() for line in path.read_text().splitlines() if line.strip()
        )
    return _COMMON_PASSWORDS


class PasswordValidationError(ValueError):
    """Raised when a password fails validation rules."""


def validate_password(password: str, *, min_length: int = 12) -> None:
    """Validate password against length and blocklist rules.

    Raises ``PasswordValidationError`` on failure.
    """
    if len(password) < min_length:
        msg = f"Password must be at least {min_length} characters"
        raise PasswordValidationError(msg)
    if len(password) > _MAX_PASSWORD_LENGTH:
        msg = f"Password must be at most {_MAX_PASSWORD_LENGTH} characters"
        raise PasswordValidationError(msg)
    if password.lower() in _load_common_passwords():
        msg = "Password is too common"
        raise PasswordValidationError(msg)


def hash_password(password: str) -> str:
    """Hash a password with argon2id."""
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a hash. Returns False on mismatch."""
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False

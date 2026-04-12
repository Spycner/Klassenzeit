"""Tests for password hashing and validation."""

import pytest

from klassenzeit_backend.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password,
    verify_password,
)


class TestHashAndVerify:
    def test_hash_roundtrip(self) -> None:
        password = "a-secure-passphrase"  # noqa: S105
        hashed = hash_password(password)
        assert hashed != password
        assert verify_password(password, hashed) is True

    def test_wrong_password_fails(self) -> None:
        hashed = hash_password("correct-password!")
        assert verify_password("wrong-password!!", hashed) is False

    def test_different_hashes_for_same_password(self) -> None:
        h1 = hash_password("same-password-here")
        h2 = hash_password("same-password-here")
        assert h1 != h2  # salt differs


class TestValidatePassword:
    def test_valid_long_lowercase_passphrase(self) -> None:
        validate_password("this is a long passphrase", min_length=12)

    def test_rejects_too_short(self) -> None:
        with pytest.raises(PasswordValidationError, match="at least 12"):
            validate_password("short", min_length=12)

    def test_rejects_too_long(self) -> None:
        with pytest.raises(PasswordValidationError, match="at most 128"):
            validate_password("x" * 129, min_length=12)

    def test_rejects_common_password(self) -> None:
        with pytest.raises(PasswordValidationError, match="too common"):
            validate_password("password123456", min_length=12)

    def test_no_composition_rules(self) -> None:
        # A 20-char lowercase passphrase passes — no uppercase/number/special required
        validate_password("twentycharslowercase!", min_length=12)

    def test_custom_min_length(self) -> None:
        validate_password("sixteencharsok!!", min_length=16)
        with pytest.raises(PasswordValidationError, match="at least 16"):
            validate_password("fifteencharsno", min_length=16)

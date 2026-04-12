"""Tests for the in-memory login rate limiter."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from klassenzeit_backend.auth.rate_limit import LoginRateLimiter


class TestLoginRateLimiter:
    def test_not_locked_initially(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        assert limiter.is_locked("user@test.com") is False

    def test_locks_after_max_attempts(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("user@test.com")
        assert limiter.is_locked("user@test.com") is True

    def test_not_locked_below_max(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(2):
            limiter.record_failure("user@test.com")
        assert limiter.is_locked("user@test.com") is False

    def test_reset_clears_counter(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("user@test.com")
        limiter.reset("user@test.com")
        assert limiter.is_locked("user@test.com") is False

    def test_lockout_expires(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        past = datetime.now(UTC) - timedelta(minutes=16)
        with patch(
            "klassenzeit_backend.auth.rate_limit._now",
            return_value=past,
        ):
            for _ in range(3):
                limiter.record_failure("user@test.com")
        # Now (real time) is 16 minutes after the failures — lockout expired
        assert limiter.is_locked("user@test.com") is False

    def test_seconds_until_unlock(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("user@test.com")
        seconds = limiter.seconds_until_unlock("user@test.com")
        assert 0 < seconds <= 900

    def test_seconds_until_unlock_when_not_locked(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        assert limiter.seconds_until_unlock("user@test.com") == 0

    def test_different_emails_are_independent(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("a@test.com")
        assert limiter.is_locked("a@test.com") is True
        assert limiter.is_locked("b@test.com") is False

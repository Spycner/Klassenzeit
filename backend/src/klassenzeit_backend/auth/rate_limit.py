"""In-memory per-email login rate limiter.

Tracks failed login timestamps per email. Locks an email after
``max_attempts`` failures within ``lockout_minutes``. Counters reset
on successful login. Process restart clears all state — acceptable
for a single-process backend with a small user base.
"""

from collections import defaultdict
from datetime import UTC, datetime, timedelta


def _now() -> datetime:
    """Seam for testing — patch this to control time."""
    return datetime.now(UTC)


class LoginRateLimiter:
    """In-memory rate limiter that locks an email after repeated failed logins."""

    def __init__(self, max_attempts: int = 5, lockout_minutes: int = 15) -> None:
        """Configure the limiter with attempt threshold and lockout duration."""
        self._max_attempts = max_attempts
        self._lockout_duration = timedelta(minutes=lockout_minutes)
        self._attempts: dict[str, list[datetime]] = defaultdict(list)

    def _prune(self, email: str) -> None:
        """Remove expired failure timestamps for the given email."""
        cutoff = _now() - self._lockout_duration
        self._attempts[email] = [t for t in self._attempts[email] if t > cutoff]
        if not self._attempts[email]:
            del self._attempts[email]

    def is_locked(self, email: str) -> bool:
        """Return True if the email has exceeded the failure threshold."""
        self._prune(email)
        return len(self._attempts.get(email, [])) >= self._max_attempts

    def record_failure(self, email: str) -> None:
        """Record a failed login attempt for the given email."""
        self._attempts[email].append(_now())

    def reset(self, email: str) -> None:
        """Clear all failure records for the given email after a successful login."""
        self._attempts.pop(email, None)

    def seconds_until_unlock(self, email: str) -> int:
        """Return seconds remaining until the lockout expires, or 0 if not locked."""
        self._prune(email)
        attempts = self._attempts.get(email, [])
        if len(attempts) < self._max_attempts:
            return 0
        unlock_at = attempts[0] + self._lockout_duration
        remaining = (unlock_at - _now()).total_seconds()
        return max(0, int(remaining))

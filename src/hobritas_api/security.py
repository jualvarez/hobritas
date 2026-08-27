import hashlib
import secrets
from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from typing import Callable

from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()
dummy_password_hash = password_hash.hash("not-a-real-user-password")


class LoginAttemptLimiter:
    def __init__(self, clock: Callable[[], float] = monotonic):
        self._clock = clock
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _active_failures(self, key: str, window_seconds: int) -> deque[float]:
        failures = self._failures[key]
        threshold = self._clock() - window_seconds
        while failures and failures[0] <= threshold:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)
            return deque()
        return failures

    def is_blocked(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        with self._lock:
            return len(self._active_failures(key, window_seconds)) >= max_attempts

    def record_failure(self, key: str, window_seconds: int) -> None:
        with self._lock:
            self._active_failures(key, window_seconds)
            self._failures[key].append(self._clock())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def verify_password_or_dummy(password: str, encoded: str | None) -> bool:
    return verify_password(password, encoded or dummy_password_hash)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

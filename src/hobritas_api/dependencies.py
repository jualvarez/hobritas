from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import APIKeyCookie, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from hobritas_api.models import ApiToken, User, UserRole, WebSession, WorkRecord
from hobritas_api.security import hash_token

agent_token_scheme = HTTPBearer(auto_error=False, scheme_name="AgentToken")
web_session_scheme = APIKeyCookie(name="session", auto_error=False, scheme_name="WebSession")


def get_db(request: Request) -> Generator[Session, None, None]:
    with request.app.state.session_factory() as db:
        yield db


def get_current_user(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Security(agent_token_scheme),
    session: str | None = Security(web_session_scheme),
) -> User:
    user = None
    if credentials:
        raw_token = credentials.credentials
        api_token = db.scalar(
            select(ApiToken).where(
                ApiToken.token_hash == hash_token(raw_token),
                ApiToken.revoked_at.is_(None),
            )
        )
        if api_token:
            user = api_token.user
    elif session:
        web_session = db.scalar(
            select(WebSession).where(
                WebSession.token_hash == hash_token(session),
                WebSession.expires_at > datetime.now(UTC),
            )
        )
        if web_session:
            user = web_session.user

    if not user or not user.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Se requiere autenticación")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permisos insuficientes")
    return user


def user_site_ids(user: User) -> set[int] | None:
    if user.role == UserRole.ADMIN:
        return None
    return set(user.site_ids)


def normalize_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def foreman_can_correct(record: WorkRecord, timezone_name: str) -> bool:
    local_now = datetime.now(ZoneInfo(timezone_name))
    current_week = (local_now - timedelta(days=(local_now.weekday() + 1) % 7)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    earliest = current_week - timedelta(days=7)
    record_local = normalize_utc(record.entry_at).astimezone(ZoneInfo(timezone_name))
    return record_local >= earliest

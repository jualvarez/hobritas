import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from hobritas_api.dependencies import (
    foreman_can_correct,
    get_current_user,
    get_db,
    normalize_utc,
    require_admin,
    user_site_ids,
)
from hobritas_api.models import (
    AuditLog,
    Site,
    User,
    UserRole,
    WebSession,
    Worker,
    WorkRecord,
    worker_sites,
)
from hobritas_api.schemas import (
    AdminSiteRead,
    AppSettingsRead,
    AuditEntryRead,
    LoginRequest,
    PersonCreate,
    PersonRead,
    PersonUpdate,
    RecordCreate,
    RecordRead,
    RecordUpdate,
    SiteRead,
    SiteWrite,
    UserRead,
    WorkerRead,
)
from hobritas_api.security import (
    hash_password,
    hash_token,
    new_token,
    verify_password_or_dummy,
)

router = APIRouter(prefix="/api/v1")


def record_snapshot(record: WorkRecord) -> dict:
    return {
        "worker_id": record.worker_id,
        "site_id": record.site_id,
        "entry_at": record.entry_at.isoformat(),
        "exit_at": record.exit_at.isoformat() if record.exit_at else None,
        "early_exit_reason": record.early_exit_reason,
        "deleted_at": record.deleted_at.isoformat() if record.deleted_at else None,
    }


def audit(db: Session, user: User, action: str, record: WorkRecord, before: dict | None) -> None:
    db.add(
        AuditLog(
            user_id=user.id,
            action=action,
            entity_type="work_record",
            entity_id=record.id,
            before_json=json.dumps(before, ensure_ascii=False) if before else None,
            after_json=json.dumps(record_snapshot(record), ensure_ascii=False),
        )
    )


def get_visible_record(db: Session, record_id: int, user: User) -> WorkRecord:
    query = select(WorkRecord).where(
        WorkRecord.id == record_id,
        WorkRecord.deleted_at.is_(None),
    )
    allowed_sites = user_site_ids(user)
    if allowed_sites is not None:
        query = query.where(WorkRecord.site_id.in_(allowed_sites))
    record = db.scalar(query)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record does not exist")
    return record


def worker_belongs_to_site(db: Session, worker_id: int, site_id: int) -> bool:
    return db.scalar(
        select(worker_sites.c.worker_id).where(
            worker_sites.c.worker_id == worker_id,
            worker_sites.c.site_id == site_id,
        )
    ) is not None


def validate_assignment(db: Session, worker_id: int, site_id: int) -> None:
    if not worker_belongs_to_site(db, worker_id, site_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Worker is not assigned to the site",
        )


def validate_times(entry_at: datetime, exit_at: datetime | None) -> None:
    if exit_at is not None and normalize_utc(exit_at) <= normalize_utc(entry_at):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Exit time must be after entry time",
        )


def resolve_sites(db: Session, site_ids: list[int]) -> list[Site]:
    unique_ids = list(dict.fromkeys(site_ids))
    sites = list(db.scalars(select(Site).where(Site.id.in_(unique_ids)).order_by(Site.id)))
    if len(sites) != len(unique_ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A site does not exist")
    return sites


def serialize_person(worker: Worker) -> PersonRead:
    return PersonRead(
        id=worker.id,
        name=worker.name,
        active=worker.active,
        site_ids=sorted(site.id for site in worker.sites),
        access_enabled=worker.access_enabled,
        username=worker.user.username if worker.user else None,
        role=worker.user.role if worker.user else None,
    )


def ensure_username_available(db: Session, username: str, current_user_id: int | None = None) -> None:
    existing = db.scalar(select(User).where(User.username == username))
    if existing and existing.id != current_user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")


def clean_site_name(name: str) -> str:
    value = name.strip()
    if not value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name is required")
    return value


def ensure_site_name_available(db: Session, name: str, current_site_id: int | None = None) -> None:
    existing = db.scalar(select(Site).where(Site.name == name))
    if existing and existing.id != current_site_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Site already exists")


def get_admin_site(db: Session, site_id: int) -> Site:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site does not exist")
    return site


def serialize_admin_site(site: Site) -> AdminSiteRead:
    people = [worker for worker in sorted(site.workers, key=lambda item: (item.name, item.id)) if worker.active]
    return AdminSiteRead(id=site.id, name=site.name, people=people)


@router.post("/auth/login", response_model=UserRead, tags=["auth"])
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    client_host = request.client.host if request.client else "unknown"
    limiter_key = f"{client_host}:{payload.username.casefold()}"
    settings = request.app.state.settings
    limiter = request.app.state.login_attempt_limiter
    if limiter.is_blocked(limiter_key, settings.login_max_attempts, settings.login_window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again later",
            headers={"Retry-After": str(settings.login_window_seconds)},
        )

    user = db.scalar(select(User).where(User.username == payload.username, User.active.is_(True)))
    if not verify_password_or_dummy(payload.password, user.password_hash if user else None) or not user:
        limiter.record_failure(limiter_key, settings.login_window_seconds)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    limiter.reset(limiter_key)

    raw_token = new_token()
    db.add(
        WebSession(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(hours=settings.session_hours),
        )
    )
    db.commit()
    response.set_cookie(
        "session",
        raw_token,
        httponly=True,
        secure=settings.cookie_secure and not settings.testing,
        samesite="lax",
        max_age=settings.session_hours * 3600,
    )
    return user


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["auth"])
def logout(
    response: Response,
    session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if session:
        stored = db.scalar(select(WebSession).where(WebSession.token_hash == hash_token(session)))
        if stored:
            db.delete(stored)
            db.commit()
    response.delete_cookie("session")


@router.get("/auth/me", response_model=UserRead, tags=["auth"])
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/settings", response_model=AppSettingsRead, tags=["system"])
def app_settings(request: Request, _user: User = Depends(get_current_user)):
    return AppSettingsRead(
        timezone=request.app.state.settings.timezone,
        workday_hours=request.app.state.settings.workday_hours,
    )


@router.get("/admin/people", response_model=list[PersonRead], tags=["admin"])
def list_people(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    workers = list(db.scalars(select(Worker).order_by(Worker.name, Worker.id)))
    return [serialize_person(worker) for worker in workers]


@router.post("/admin/people", response_model=PersonRead, status_code=status.HTTP_201_CREATED, tags=["admin"])
def create_person(
    payload: PersonCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    worker = Worker(
        name=payload.name.strip(),
        active=payload.active,
        access_enabled=payload.access_enabled,
    )
    if not worker.name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name is required")
    db.add(worker)
    worker.sites = resolve_sites(db, payload.site_ids)
    if payload.access_enabled:
        ensure_username_available(db, payload.username)
        worker.user = User(
            username=payload.username.strip(),
            password_hash=hash_password(payload.password),
            role=payload.role,
            active=payload.active,
        )
    db.commit()
    return serialize_person(worker)


@router.patch("/admin/people/{person_id}", response_model=PersonRead, tags=["admin"])
def update_person(
    person_id: int,
    payload: PersonUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    worker = db.get(Worker, person_id)
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker does not exist")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        worker.name = (changes["name"] or "").strip()
        if not worker.name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name is required")
    if "site_ids" in changes:
        worker.sites = resolve_sites(db, changes["site_ids"] or [])
    if "active" in changes:
        worker.active = changes["active"]

    enable_access = changes.get("access_enabled", worker.access_enabled)
    if enable_access and not worker.user:
        if not (changes.get("username") and changes.get("role") and changes.get("password")):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Username, role, and password are required to enable access",
            )
        ensure_username_available(db, changes["username"])
        worker.user = User(
            username=changes["username"].strip(),
            password_hash=hash_password(changes["password"]),
            role=changes["role"],
        )
    elif worker.user:
        if changes.get("username"):
            ensure_username_available(db, changes["username"], worker.user.id)
            worker.user.username = changes["username"].strip()
        if changes.get("role"):
            worker.user.role = changes["role"]
        if changes.get("password"):
            worker.user.password_hash = hash_password(changes["password"])

    worker.access_enabled = enable_access
    if worker.user:
        worker.user.active = worker.active and worker.access_enabled
    db.commit()
    return serialize_person(worker)


@router.get("/admin/sites", response_model=list[AdminSiteRead], tags=["admin"])
def list_admin_sites(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    sites = list(db.scalars(select(Site).order_by(Site.name, Site.id)))
    return [serialize_admin_site(site) for site in sites]


@router.post("/admin/sites", response_model=AdminSiteRead, status_code=status.HTTP_201_CREATED, tags=["admin"])
def create_site(payload: SiteWrite, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    name = clean_site_name(payload.name)
    ensure_site_name_available(db, name)
    site = Site(name=name)
    db.add(site)
    db.commit()
    return serialize_admin_site(site)


@router.patch("/admin/sites/{site_id}", response_model=AdminSiteRead, tags=["admin"])
def update_site(
    site_id: int,
    payload: SiteWrite,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    site = get_admin_site(db, site_id)
    name = clean_site_name(payload.name)
    ensure_site_name_available(db, name, site.id)
    site.name = name
    db.commit()
    return serialize_admin_site(site)


@router.post("/admin/sites/{site_id}/people/{person_id}", response_model=AdminSiteRead, tags=["admin"])
def add_person_to_site(
    site_id: int,
    person_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    site = get_admin_site(db, site_id)
    person = db.get(Worker, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker does not exist")
    if not person.active:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Worker is inactive")
    if person not in site.workers:
        site.workers.append(person)
        db.commit()
    return serialize_admin_site(site)


@router.delete("/admin/sites/{site_id}/people/{person_id}", response_model=AdminSiteRead, tags=["admin"])
def remove_person_from_site(
    site_id: int,
    person_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    site = get_admin_site(db, site_id)
    person = db.get(Worker, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker does not exist")
    if person in site.workers:
        site.workers.remove(person)
        db.commit()
    return serialize_admin_site(site)


@router.get("/admin/records/{record_id}/history", response_model=list[AuditEntryRead], tags=["admin"])
def record_history(
    record_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    record = db.get(WorkRecord, record_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record does not exist")
    logs = list(
        db.scalars(
            select(AuditLog)
            .where(AuditLog.entity_type == "work_record", AuditLog.entity_id == record_id)
            .order_by(AuditLog.created_at, AuditLog.id)
        )
    )
    entries = [
        AuditEntryRead(
            action=log.action,
            actor_username=log.user.username,
            created_at=log.created_at,
            before=json.loads(log.before_json) if log.before_json else None,
            after=json.loads(log.after_json) if log.after_json else None,
        )
        for log in logs
    ]
    if not any(entry.action == "create" for entry in entries):
        entries.insert(
            0,
            AuditEntryRead(
                action="create",
                actor_username=record.created_by.username,
                created_at=record.created_at,
                after=record_snapshot(record),
            ),
        )
    return entries


@router.get("/sites", response_model=list[SiteRead], tags=["sites"])
def list_sites(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Site).where(Site.active.is_(True)).order_by(Site.name)
    allowed_sites = user_site_ids(user)
    if allowed_sites is not None:
        query = query.where(Site.id.in_(allowed_sites))
    return list(db.scalars(query))


@router.post("/sites/{site_id}/close-open-records", response_model=list[RecordRead], tags=["records"])
def close_open_records(
    site_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    allowed_sites = user_site_ids(user)
    if allowed_sites is not None and site_id not in allowed_sites:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Site is not allowed")
    if not db.get(Site, site_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site does not exist")

    closed_at = datetime.now(UTC)
    records = list(
        db.scalars(
            select(WorkRecord)
            .where(
                WorkRecord.site_id == site_id,
                WorkRecord.exit_at.is_(None),
                WorkRecord.deleted_at.is_(None),
            )
            .order_by(WorkRecord.id)
        )
    )
    for record in records:
        validate_times(record.entry_at, closed_at)
    for record in records:
        before = record_snapshot(record)
        record.exit_at = closed_at
        record.updated_at = closed_at
        audit(db, user, "close_shift", record, before)
    db.commit()
    return records


@router.get("/workers", response_model=list[WorkerRead], tags=["workers"])
def list_workers(
    site_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Worker).where(Worker.active.is_(True)).order_by(Worker.name)
    allowed_sites = user_site_ids(user)
    if allowed_sites is not None:
        if site_id is not None and site_id not in allowed_sites:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Site is not allowed")
        target_sites = {site_id} if site_id is not None else allowed_sites
        query = query.join(worker_sites).where(worker_sites.c.site_id.in_(target_sites))
    elif site_id is not None:
        query = query.join(worker_sites).where(worker_sites.c.site_id == site_id)
    return list(db.scalars(query).unique())


@router.get("/records", response_model=list[RecordRead], tags=["records"])
def list_records(
    site_id: int | None = None,
    worker_id: int | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(WorkRecord).where(WorkRecord.deleted_at.is_(None)).order_by(WorkRecord.entry_at)
    allowed_sites = user_site_ids(user)
    if allowed_sites is not None:
        if site_id is not None and site_id not in allowed_sites:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Site is not allowed")
        query = query.where(WorkRecord.site_id.in_(allowed_sites))
    if site_id is not None:
        query = query.where(WorkRecord.site_id == site_id)
    if worker_id is not None:
        query = query.where(WorkRecord.worker_id == worker_id)
    if from_at is not None:
        query = query.where(WorkRecord.entry_at >= normalize_utc(from_at))
    if to_at is not None:
        query = query.where(WorkRecord.entry_at < normalize_utc(to_at))
    return list(db.scalars(query))


@router.post("/records", response_model=RecordRead, status_code=status.HTTP_201_CREATED, tags=["records"])
def create_record(payload: RecordCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    allowed_sites = user_site_ids(user)
    if allowed_sites is not None and payload.site_id not in allowed_sites:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Site is not allowed")
    validate_assignment(db, payload.worker_id, payload.site_id)
    validate_times(payload.entry_at, payload.exit_at)
    values = payload.model_dump()
    values["entry_at"] = normalize_utc(values["entry_at"])
    if values["exit_at"] is not None:
        values["exit_at"] = normalize_utc(values["exit_at"])
    record = WorkRecord(**values, created_by_id=user.id)
    db.add(record)
    db.flush()
    audit(db, user, "create", record, None)
    db.commit()
    return record


@router.patch("/records/{record_id}", response_model=RecordRead, tags=["records"])
def update_record(
    record_id: int,
    payload: RecordUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = get_visible_record(db, record_id, user)
    if user.role == UserRole.FOREMAN and not foreman_can_correct(record, request.app.state.settings.timezone):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Correction period has expired")

    before = record_snapshot(record)
    changes = payload.model_dump(exclude_unset=True)
    for field in ("entry_at", "exit_at"):
        if changes.get(field) is not None:
            changes[field] = normalize_utc(changes[field])
    next_site = changes.get("site_id", record.site_id)
    next_worker = changes.get("worker_id", record.worker_id)
    allowed_sites = user_site_ids(user)
    if allowed_sites is not None and next_site not in allowed_sites:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Site is not allowed")
    validate_assignment(db, next_worker, next_site)

    for field, value in changes.items():
        setattr(record, field, value)
    validate_times(record.entry_at, record.exit_at)
    record.updated_at = datetime.now(UTC)
    audit(db, user, "update", record, before)
    db.commit()
    return record


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["records"])
def delete_record(
    record_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = get_visible_record(db, record_id, user)
    if user.role == UserRole.FOREMAN and not foreman_can_correct(record, request.app.state.settings.timezone):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Correction period has expired")
    before = record_snapshot(record)
    record.deleted_at = datetime.now(UTC)
    audit(db, user, "delete", record, before)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

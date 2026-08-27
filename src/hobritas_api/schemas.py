from datetime import UTC, datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from hobritas_api.models import UserRole

Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=1024)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
SiteName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class LoginRequest(BaseModel):
    username: Username
    password: Password


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: UserRole
    site_id: int | None
    site_ids: list[int]


class SiteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class SiteWrite(BaseModel):
    name: SiteName


class AuditEntryRead(BaseModel):
    action: str
    actor_username: str
    created_at: datetime
    before: dict | None = None
    after: dict | None = None

    @field_validator("created_at", mode="before")
    @classmethod
    def restore_created_at_timezone(cls, value: datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class WorkerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class AdminSiteRead(SiteRead):
    people: list[WorkerRead] = Field(default_factory=list)


class AppSettingsRead(BaseModel):
    timezone: str
    workday_hours: int


class PersonCreate(BaseModel):
    name: PersonName
    active: bool = True
    site_ids: list[int] = Field(default_factory=list)
    access_enabled: bool = False
    username: Username | None = None
    role: UserRole | None = None
    password: Password | None = None

    @model_validator(mode="after")
    def credentials_for_access(self):
        if self.access_enabled and not (self.username and self.role and self.password):
            raise ValueError("Username, role, and password are required to enable access")
        return self


class PersonUpdate(BaseModel):
    name: PersonName | None = None
    active: bool | None = None
    site_ids: list[int] | None = None
    access_enabled: bool | None = None
    username: Username | None = None
    role: UserRole | None = None
    password: Password | None = None


class PersonRead(BaseModel):
    id: int
    name: str
    active: bool
    site_ids: list[int]
    access_enabled: bool
    username: str | None
    role: UserRole | None


class RecordCreate(BaseModel):
    worker_id: int
    site_id: int
    entry_at: datetime
    exit_at: datetime | None = None
    early_exit_reason: str | None = None

    @field_validator("entry_at", "exit_at")
    @classmethod
    def aware_datetime(cls, value: datetime | None):
        if value is not None and value.tzinfo is None:
            raise ValueError("The date and time must include a timezone")
        return value


class RecordUpdate(BaseModel):
    worker_id: int | None = None
    site_id: int | None = None
    entry_at: datetime | None = None
    exit_at: datetime | None = None
    early_exit_reason: str | None = None

    @field_validator("entry_at", "exit_at")
    @classmethod
    def aware_datetime(cls, value: datetime | None):
        if value is not None and value.tzinfo is None:
            raise ValueError("The date and time must include a timezone")
        return value

    @model_validator(mode="after")
    def entry_cannot_be_cleared(self):
        if "entry_at" in self.model_fields_set and self.entry_at is None:
            raise ValueError("The entry date and time cannot be empty")
        return self


class RecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    worker_id: int
    site_id: int
    entry_at: datetime
    exit_at: datetime | None
    early_exit_reason: str | None

    @field_validator("entry_at", "exit_at", mode="before")
    @classmethod
    def restore_utc_timezone(cls, value: datetime | None):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value

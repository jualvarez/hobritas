from palita_api.config import Settings


def test_argentina_is_the_default_timezone(monkeypatch):
    monkeypatch.delenv("APP_TIMEZONE", raising=False)
    settings = Settings(session_secret="test")
    assert settings.timezone == "America/Argentina/Buenos_Aires"


def test_timezone_can_be_overridden(monkeypatch):
    monkeypatch.setenv("APP_TIMEZONE", "America/Montevideo")
    settings = Settings(session_secret="test")
    assert settings.timezone == "America/Montevideo"


def test_workday_is_eight_hours_by_default(monkeypatch):
    monkeypatch.delenv("APP_WORKDAY_HOURS", raising=False)
    settings = Settings(session_secret="test")
    assert settings.workday_hours == 8

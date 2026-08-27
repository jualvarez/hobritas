import argparse
import getpass
from datetime import UTC, datetime

from sqlalchemy import select

from hobritas_api.config import Settings
from hobritas_api.database import create_database_engine, create_session_factory
from hobritas_api.models import ApiToken, Site, User, UserRole, Worker
from hobritas_api.security import hash_password, hash_token, new_token


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hobritas-admin")
    commands = parser.add_subparsers(dest="command", required=True)

    create_site = commands.add_parser("create-site")
    create_site.add_argument("--name", required=True)

    create_worker = commands.add_parser("create-worker")
    create_worker.add_argument("--name", required=True)
    create_worker.add_argument("--site-id", type=int, required=True)

    create_user = commands.add_parser("create-user")
    create_user.add_argument("--username", required=True)
    create_user.add_argument("--role", choices=[role.value for role in UserRole], required=True)
    create_user.add_argument("--site-id", type=int)

    set_password = commands.add_parser("set-password")
    set_password.add_argument("--username", required=True)

    create_token = commands.add_parser("create-token")
    create_token.add_argument("--username", required=True)
    create_token.add_argument("--name", required=True)

    revoke_token = commands.add_parser("revoke-token")
    revoke_token.add_argument("--username", required=True)
    revoke_token.add_argument("--name", required=True)
    return parser


def read_password() -> str:
    first = getpass.getpass("Password: ")
    second = getpass.getpass("Repeat password: ")
    if first != second:
        raise SystemExit("Passwords do not match")
    if not first:
        raise SystemExit("Password cannot be empty")
    if len(first) < 8:
        raise SystemExit("Password must contain at least 8 characters")
    if len(first) > 1024:
        raise SystemExit("Password is too long")
    return first


def main() -> None:
    args = build_parser().parse_args()
    settings = Settings()
    session_factory = create_session_factory(create_database_engine(settings))

    with session_factory() as db:
        if args.command == "create-site":
            site = Site(name=args.name)
            db.add(site)
            db.commit()
            print(f"Site created with ID {site.id}")
            return

        if args.command == "create-worker":
            site = db.get(Site, args.site_id)
            if not site:
                raise SystemExit("Site does not exist")
            worker = Worker(name=args.name)
            worker.sites.append(site)
            db.add(worker)
            db.commit()
            print(f"Worker created with ID {worker.id}")
            return

        user = db.scalar(select(User).where(User.username == args.username))
        if args.command == "create-user":
            if user:
                raise SystemExit("User already exists")
            role = UserRole(args.role)
            if role == UserRole.FOREMAN and not args.site_id:
                raise SystemExit("A foreman requires --site-id")
            if args.site_id and not db.get(Site, args.site_id):
                raise SystemExit("Site does not exist")
            user = User(
                username=args.username,
                password_hash=hash_password(read_password()),
                role=role,
                site_id=args.site_id,
            )
            db.add(user)
            db.commit()
            print(f"User created with ID {user.id}")
            return

        if not user:
            raise SystemExit("User does not exist")
        if args.command == "set-password":
            user.password_hash = hash_password(read_password())
            db.commit()
            print("Password updated")
            return

        if args.command == "create-token":
            raw_token = new_token()
            db.add(ApiToken(user_id=user.id, name=args.name, token_hash=hash_token(raw_token)))
            db.commit()
            print(raw_token)
            return

        if args.command == "revoke-token":
            token = db.scalar(
                select(ApiToken)
                .where(
                    ApiToken.user_id == user.id,
                    ApiToken.name == args.name,
                    ApiToken.revoked_at.is_(None),
                )
                .order_by(ApiToken.id.desc())
                .limit(1)
            )
            if not token:
                raise SystemExit("Token does not exist or has already been revoked")
            token.revoked_at = datetime.now(UTC)
            db.commit()
            print("Token revoked")

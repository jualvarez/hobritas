FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml alembic.ini ./
COPY migrations ./migrations
COPY src ./src
COPY web ./web

RUN pip install --no-cache-dir . \
    && addgroup --system --gid 65532 hobritas \
    && adduser --system --uid 65532 --gid 65532 --no-create-home hobritas \
    && mkdir /data \
    && chown 65532:65532 /data

USER 65532:65532

EXPOSE 8080

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn hobritas_api.app:create_app --factory --host 0.0.0.0 --port 8080"]

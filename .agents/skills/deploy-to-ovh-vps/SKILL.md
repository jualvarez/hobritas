---
name: deploy-to-ovh-vps
description: Prepares and deploys this single-service Docker Compose web application, optionally with local SQLite persistence and runtime file secrets, to the sibling ovh_vps project's VPS behind Traefik at an HTTPS path prefix. Use when adapting, dry-running, deploying, backing up, or verifying Hobritas on that VPS.
---

# Deploy to OVH VPS

Treat the current Git root as the application repository. Resolve its sibling `../ovh_vps` as the VPS control repository and stop if that repository or `docs/deployment-contract.md` is absent. Keep the application Compose here and the Traefik route in the VPS repository.

## Supported application

Handle one service, either stateless or with one local SQLite database and declared runtime secrets. If the application needs multiple services, more than one data volume, an external database, a different internal port, or prefix removal, stop and propose only the smallest contract extension needed.

Choose a unique slug containing lowercase letters, digits, and hyphens. The application must:

- receive `BASE_PATH=/<slug>` from Compose and read it instead of hardcoding the prefix;
- listen on `0.0.0.0:8080`;
- serve `GET /<slug>/` and a non-mutating `GET /<slug>/healthz`;
- build from a reviewed `Dockerfile` through `build: .`;
- use one Compose service named `<slug>`;
- run as numeric user and group `65532:65532`;
- connect to the existing external network `edge`;
- define a container healthcheck;
- declare no `ports`, data bind mounts, or auxiliary services.

Do not add Traefik labels or Docker socket access.

## Optional SQLite

For a stateful application, use exactly one named volume:

```yaml
services:
  <slug>:
    environment:
      DATABASE_PATH: /data/app.sqlite3
    volumes:
      - data:/data

volumes:
  data:
    name: <slug>-data
```

Create and chown `/data` to `65532:65532` in the image before switching to that user. Make schema initialization and migrations idempotent. Make the health endpoint perform a read-only query against the expected schema. Provide a command that creates a consistent snapshot with the SQLite Online Backup API or `VACUUM INTO`. Never copy a live database file directly.

Prove writing as the non-root user, persistence after `docker compose up -d --force-recreate`, and restoration of a snapshot. Export the snapshot from the container to `/home/fedora/ovh-vps/backups/<slug>/`; use `root:root 0700` for the directory and `root:root 0600` for the file. Verify `PRAGMA integrity_check` and expected data from that exported file, then remove the in-container temporary snapshot. Call this a local backup, not an off-host backup. Never run `docker compose down -v`, `docker volume rm`, or `docker volume prune`. Preserve the volume during rollback.

## Optional secrets

Declare names and file locations, never values. Keep non-sensitive configuration in `.env` as required by this project, but consume secret values only from Compose secret files. For each required secret such as `api_token`, use:

```yaml
services:
  <slug>:
    environment:
      API_TOKEN_FILE: /run/secrets/api_token
    secrets:
      - api_token

secrets:
  api_token:
    file: ${OVH_SECRET_API_TOKEN_FILE:?set OVH_SECRET_API_TOKEN_FILE}
```

Expect the operator-provisioned source at `/home/fedora/ovh-vps/secrets/<slug>/<secret-name>`. On the current Fedora host, the validated convention is:

- secret directory: `root:root`, mode `0700`;
- secret file: `65532:65532`, mode `0400`;
- SELinux: the observed `user_home_t` context works without relabeling;
- container mount: `/run/secrets/<secret-name>`, read-only.

Before Compose, use `sudo test -f` and `sudo stat` to validate only type, numeric owner, mode, and SELinux context. Never read, hash, copy, print, create, modify, rotate, or delete a secret value. If a required file is missing or its metadata is wrong, stop and report the exact expected path and metadata for the operator to provision.

Require the operator to confirm that each secret has a canonical copy outside the VPS or is safely reissuable. Treat the host file only as a runtime copy; never request its value.

After the operator rotates a source file atomically, recreate the application container before verifying it. The existing bind mount continues to reference the old file until recreation.

## Route

Add `infra/edge/dynamic/<slug>.yaml` to the sibling VPS repository:

```yaml
http:
  routers:
    <slug>:
      entryPoints:
        - websecure
      rule: PathPrefix(`/<slug>/`)
      service: <slug>
      tls:
        certResolver: letsencrypt
        domains:
          - main: "<vps-ip>"
  services:
    <slug>:
      loadBalancer:
        servers:
          - url: http://<slug>:8080
```

Keep the trailing slash in `PathPrefix` so `/<slug>/` does not match a longer sibling prefix.

## Prepare

Before changing the VPS:

1. Read the sibling VPS repository's `docs/deployment-contract.md` and current ingress decision.
2. Validate the application with `docker compose config --quiet` and the full local test suite. Supply only source-file paths for required secret interpolation.
3. Review the Compose source and confirm that it has one service, no host port, and only the allowed volume and secrets.
4. Show the Compose source without values, the complete route file, remote target paths, expected public URLs, and rollback.
5. For every secret, validate the remote source metadata without reading the value.

Never print or persist values read from `.env`. Never copy `.env`, `.git`, `.venv`, caches, local databases, test artifacts, or the working tree wholesale. Build a staging directory from reviewed, version-controlled runtime files plus explicitly approved deployment manifests.

Treat an explicit request to deploy, publish, or complete the whole process as authorization for the application, its route, verification, and rollback of that same application if validation fails. Continue without intermediate approval pauses. A request limited to preparation or dry-run does not authorize remote changes.

## Deploy

Before applying, recheck SSH, Docker, Traefik, the `edge` network, slug availability, and the current VPS IP. Use the IP already configured for ingress only if OVH still reports it as primary; stop if they differ because the TLS baseline must be updated first.

Copy only the reviewed staging directory to `/home/fedora/ovh-vps/apps/<slug>/`; never copy a secret source or secret value with it. Pass only each operator-provisioned host path to Compose. Build and start its Compose project, then wait for the container to become healthy. Copy the approved route from the VPS repository to `/home/fedora/ovh-vps/edge/dynamic/<slug>.yaml` only after the application is healthy; Traefik watches this directory automatically.

Do not change the ingress Compose, TLS settings, SSH configuration, firewall, or unrelated applications.

## Verify

Confirm all of the following from outside the VPS:

- `https://<vps-ip>/<slug>/` and `/healthz` return successful responses with a trusted certificate;
- HTTP redirects to the same HTTPS path;
- a sibling path such as `/<slug>-other/` does not match;
- port 8080 and any application-specific port remain unavailable publicly;
- the application is healthy and Traefik has no routing errors.

For SQLite, also create a marker through an internal application command, recreate the container, and read the marker back. Export an application-created snapshot outside the data volume, then open that exported backup read-only to verify integrity and the marker. For secrets, verify only that the application starts and behaves correctly; scan responses and logs for accidental exposure without printing the value.

Report the observed evidence. If validation fails during a full-process request, remove only that application's route and stop or bring down only that Compose project while preserving its named volume, then report the failure and rollback evidence. Do not remove volumes, secrets, images, shared networks, ingress state, or unrelated files.

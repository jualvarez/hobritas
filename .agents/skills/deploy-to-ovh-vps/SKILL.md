---
name: deploy-to-ovh-vps
description: Prepares and deploys a single-service Docker Compose web application, optionally with SQLite persistence and runtime file secrets, to an operator-configured OVH VPS behind Traefik. Use when adapting, dry-running, deploying, backing up, or verifying an application on that VPS.
---

# Deploy to OVH VPS

## Deployment context

Before acting, obtain the deployment context from operator-provided private configuration or an infrastructure control repository:

- application and infrastructure repositories;
- SSH target and public host;
- remote application, secret, backup, and ingress roots;
- internal Docker network and port;
- container runtime UID/GID;
- Traefik entrypoint and TLS configuration.

Do not encode these values in this skill or infer them from another machine. Stop if a required value cannot be discovered safely.

## Application contract

Handle one service, either stateless or with one SQLite database and declared runtime secrets. If it needs multiple services, more than one data volume, an external database, prefix removal, or another unsupported feature, propose only the smallest contract extension.

Choose a unique lowercase slug. Make the application:

- accept `BASE_PATH=/<slug>`;
- listen on the internal port from the deployment context;
- serve `GET /<slug>/` and a non-mutating `GET /<slug>/healthz`;
- build from a reviewed `Dockerfile`;
- run as the non-root UID/GID from the deployment context;
- connect only to the configured ingress network;
- define a container healthcheck;
- declare no host `ports`, data bind mounts, or auxiliary services.

Do not add Traefik labels or Docker socket access.

## SQLite

For a stateful application, declare one named volume `<slug>-data`, mount it at `/data`, and default `DATABASE_PATH` to `/data/app.sqlite3`. Prepare `/data` for the configured non-root user. Make schema initialization and migrations idempotent. Make the health endpoint query the expected schema read-only.

Provide an internal command that creates a consistent snapshot with the SQLite Online Backup API or `VACUUM INTO`; never copy a live database file directly. Prove non-root writes, persistence after container recreation, and snapshot restoration.

Export each snapshot outside the data volume to the configured backup root. Protect the directory as operator-only and the file as read-only to non-owners. Verify `PRAGMA integrity_check` and expected data from the exported file, then remove the in-container temporary snapshot. Call it a local backup unless another failure domain stores a verified copy.

Never run `docker compose down -v`, `docker volume rm`, or `docker volume prune`. Preserve data during deployment and rollback.

## Secrets

Declare secret names and file locations, never values. Pass only a source path to Compose and consume the mounted file through `/run/secrets/<name>` or a `<NAME>_FILE` variable.

Expect operator-provisioned sources under the configured secret root. Validate only that each source is a regular file, readable by the configured container UID/GID, inaccessible to unrelated host users, compatible with the host mandatory-access-control policy, and mounted read-only. Do not hardcode ownership or security labels.

Never read, hash, copy, print, create, modify, rotate, or delete a secret value. If a source is missing or unsafe, report the expected metadata without requesting its value. Require the operator to confirm that every secret has a canonical copy outside the VPS or is safely reissuable.

After an operator rotation, recreate the application container before verification because a file bind mount may continue referencing the previous inode.

## Route

Create the route in the infrastructure control repository, not the application repository. Configure Traefik from the deployment context with:

- ``PathPrefix(`/<slug>/`)`` including the trailing slash;
- the configured secure entrypoint and TLS settings;
- backend `http://<slug>:<internal-port>`.

Do not alter shared ingress configuration.

## Prepare

Before remote changes:

1. Read the infrastructure deployment contract.
2. Run the complete application test suite and `docker compose config --quiet`.
3. Review the Compose source for one service, no host ports, and only allowed mounts and secrets.
4. Present sanitized manifests, target paths, public URLs, and rollback.
5. Recheck SSH, Docker, Traefik, network, slug availability, public host, and secret metadata.

Never print or persist values from `.env`. Never deploy `.env`, `.git`, virtual environments, caches, local databases, tests, or the working tree wholesale. Build a staging directory from reviewed runtime files and deployment manifests.

Treat an explicit request for the complete deployment as authorization for that application, its route, verification, and scoped rollback. A preparation or dry-run request does not authorize remote changes.

## Deploy

Copy only the reviewed staging directory to the configured remote application root. Pass secret source paths, never values, to Compose. Build and start the project, wait until healthy, and install the approved route only afterward.

Do not change shared ingress, TLS, SSH, firewall, unrelated applications, or operator-managed secrets.

## Verify

Confirm externally:

- application and health URLs succeed with trusted TLS;
- HTTP redirects to the same HTTPS path;
- a longer sibling prefix does not match;
- no application port is public;
- the container is healthy and Traefik has no routing errors.

For SQLite, create a marker through an internal command, recreate the container, read the marker back, and verify an exported backup. For secrets, verify behavior and inspect sanitized logs and responses for accidental exposure without reading the secret.

If verification fails, remove only this route and stop or bring down only this Compose project while preserving its volume and secrets. Report apply, verification, and rollback evidence.

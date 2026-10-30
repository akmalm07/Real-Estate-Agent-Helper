# Local PostgreSQL schema bootstrap

This first section covers SQL/bootstrap verification, **not** application/Neon HTTP
integration. The production Neon default in `backend/db/index.js` is preserved;
pointing it at plain PostgreSQL does not provide Neon's HTTP endpoint. The explicit
real-driver local composition is documented separately below. No provider
credentials are needed for these isolated checks.

## Prerequisites and safe command

- Node **22.22.0**, existing installed backend dependencies (including Drizzle Kit).
- Docker and the already-cached `postgres:17.7-alpine` image; no host `psql` needed.
- A supervisor-provided task-owned container running with label `task=t_9d4a7723`,
  network `none`, no published ports, and PGDATA on tmpfs at
  `/var/lib/postgresql/data`. The historical `r37` suffix is evidence only; any
  task-specific suffix matching the guard is allowed.

### Prepare a unique isolated container (operator only)

First confirm the image is already cached; do not pull it:

```sh
docker image inspect postgres:17.7-alpine
```

If present, an authorized supervisor may start a uniquely named container.
The implementation worker did not create resources; the supervisor independently
executed this isolated setup and verified a unique-name container (see VERIFICATION.md):

```sh
export REAH_BOOTSTRAP_CONTAINER="reah-bootstrap-t9d4a7723-$(date -u +%Y%m%d%H%M%S)-$$"
docker run -d --name "$REAH_BOOTSTRAP_CONTAINER" --label task=t_9d4a7723 --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=reah_bootstrap postgres:17.7-alpine
```

No `--rm`, ports or volumes are used. Wait no more than 30 attempts, then assert
readiness:

```sh
for attempt in $(seq 1 30); do docker exec "$REAH_BOOTSTRAP_CONTAINER" pg_isready -U postgres -h /var/run/postgresql && break; sleep 1; done
docker exec "$REAH_BOOTSTRAP_CONTAINER" pg_isready -U postgres -h /var/run/postgresql
```

From repository root, with Node22 on PATH:

```sh
env -u DATABASE_URL REAH_BOOTSTRAP_CONTAINER="$REAH_BOOTSTRAP_CONTAINER" npm exec --offline --package=node@22.22.0 -- node --test backend/test/schema-bootstrap.test.js
```

Or from `backend/`:

```sh
env -u DATABASE_URL REAH_BOOTSTRAP_CONTAINER="$REAH_BOOTSTRAP_CONTAINER" npm run db:bootstrap:test
```

This explicit command runs only the schema-bootstrap test, never the provider or
configured-URL tests. It fails closed unless the container name matches
`reah-bootstrap-t9d4a7723-[a-z0-9-]+`, then validates task ownership/image/network/ports/tmpfs before any database command. It
does not import the app or load dotenv. The config-path check mocks dotenv before
importing the Drizzle config, so no actual `.env` is read. Drizzle schema export
uses explicit schema/dialect arguments with no URL/config or network operation.

Every run creates independent databases named `reah_bootstrap_test_<random hex>`
using `template0`, retains them, and prints their synthetic names. SQL is run as
`docker exec ... psql -X -v ON_ERROR_STOP=1 -U postgres -h /var/run/postgresql`.
No connection URL, host PostgreSQL client, database/schema/table deletion,
truncation, volume reset, dependency installation or provider call is used.

### Direct SQL bootstrap (operator only)

The following creates a new uniquely named synthetic database from the container's
Unix socket, copies the recipe and included SQL files to a unique directory, and
runs the recipe. Do not substitute a real application database. This is a recipe;
the supervisor executes it, not this repair:

```sh
export REAH_BOOTSTRAP_DATABASE="reah_bootstrap_$(date -u +%Y%m%d%H%M%S)_$$"
export REAH_BOOTSTRAP_SQL_DIR="/reah-bootstrap-$(date -u +%Y%m%d%H%M%S)-$$"
docker exec "$REAH_BOOTSTRAP_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -h /var/run/postgresql -d postgres -c "CREATE DATABASE $REAH_BOOTSTRAP_DATABASE TEMPLATE template0;"
docker exec "$REAH_BOOTSTRAP_CONTAINER" mkdir "$REAH_BOOTSTRAP_SQL_DIR"
docker cp backend/db/migrations/. "$REAH_BOOTSTRAP_CONTAINER:$REAH_BOOTSTRAP_SQL_DIR"
docker exec "$REAH_BOOTSTRAP_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -h /var/run/postgresql -d "$REAH_BOOTSTRAP_DATABASE" -f "$REAH_BOOTSTRAP_SQL_DIR/bootstrap.sql"
```

No DELETE, DROP or RESET command is part of this procedure.

## Source-controlled recipe

`backend/db/migrations/bootstrap.sql` is the explicit **psql** entrypoint:

1. Begin one transaction, set `search_path=public`, and serialize this recipe with
   a database-local transaction advisory lock.
2. If public contains no relations, types or routines, include
   `0000_initial_schema.sql` (full current `schema.js` snapshot: 13 tables,
   14 enums, columns/defaults, constraints, foreign keys and indexes).
3. Otherwise skip initial creation only after a limited table-name/column-count
   and enum-count shape guard. Obvious partial schemas raise an error.
4. Include `0001_add_property_details.sql` and `0002_add_ai_enabled_to_leads.sql`,
   then commit. The property default is **`listing`**, not invalid `unknown`.

Includes use `\ir`, relative to the recipe file, independent of the caller's CWD.
The harness copies only migration `.sql` files to a unique container directory
and runs the recipe with `psql -f`; piping bootstrap.sql alone would not provide
its included files. A failed recipe disconnects without committing its transaction.
There is no migration journal or reset/push operation.

Only **empty** and **already-current** schemas are supported. The shape guard is
not a full drift validator or arbitrary historical-upgrade guarantee. Stop and
inspect unknown/partial schemas; do not reset them. Full catalog-equivalent schema
equality is independently verified in the regression harness by comparing complete
schema-only pg_dump output against a separate database built from an offline
Drizzle export. Only randomized pg_dump restriction tokens are normalized.

`drizzle.config.js` now resolves paths relative to its own file, preserving the
intended `backend/.env`, `backend/db/schema.js`, and `backend/drizzle` locations.
Ordinary use of that config can load `backend/.env`; the safe test does not.

## Evidence and cleanup limitation

The harness inserts synthetic records in all 13 tables, verifies joined reads,
all property sources/default, constraint SQLSTATEs, rollback-to-zero rows, and
unchanged full data/sequence dumps on fresh and already-current reruns. Two
partial-schema cases must fail without changing their schema dumps.

Databases and scoped SQL copies remain in the task container. Unattended policy
denied container lifecycle cleanup; this task does not attempt or bypass it.
An authorized operator must recheck container ownership before eventual cleanup.
The tmpfs databases disappear when that container is stopped; reruns require a
supervisor-provided, verified task container. Do not reuse the earlier baseline
container. These SQL tests do not establish backend startup, browser acceptance,
authentication, ingestion or live-provider functionality.

## Explicit real-driver local runtime — t_68243be5

The separate runtime harness now exercises the mounted Express application using
real PostgreSQL protocol queries through `pg` / `drizzle-orm/node-postgres`.
Ordinary production startup remains `node src/server.js`, with dotenv and
`neon()` / `drizzle-orm/neon-http`; it never imports `pg` unless the trusted local
composition has been explicitly installed. No environment flag or HTTP parameter
installs that composition. `pg@8.16.3` is a pinned development dependency.

Prerequisites: Linux host-root access to the **already retained** container
`reah-bootstrap-t9d4a7723-review40`, Docker inspect/exec/cp access, cached Node
22.22.0, and installed backend development dependencies. The harness requires
that exact name, task label `t_9d4a7723`, running cached `postgres:17.7-alpine`
image (matching image ID), network none, no port bindings, no mounts/binds and
tmpfs PGDATA. It verifies the actual socket type at
`/proc/<docker inspect State.Pid>/root/var/run/postgresql/.s.PGSQL.5432`.
This Linux `/proc` capability is required; a rootless/remote Docker daemon or
restricted procfs may not support it. Fail closed there: do not substitute a URL,
TCP forwarding, another container or a real database. No container lifecycle
operation is part of this task's runtime command.

From `backend/`, run only the explicit script:

```sh
env -i PATH="$PATH" HOME=/root REAH_LOCAL_CONTAINER=reah-bootstrap-t9d4a7723-review40 npm exec --offline --package=node@22.22.0 -- npm run test:local-runtime
```

Each invocation creates **one** uniquely named
`reah_local_t68243be5_<24 random hex>` database from template0, copies the current
migration directory (including actual `\ir` files), and bootstraps it once using
`docker exec psql -X -v ON_ERROR_STOP=1`. Only bootstrap uses psql; application
queries use the real driver. The DB and scoped SQL directory are retained, not
dropped. Avoid unnecessary full reruns. Startup-only regression (no new DB):

```sh
env -i PATH="$PATH" HOME=/root npm exec --offline --package=node@22.22.0 -- node --test --test-name-pattern='startup boundaries|default server' test/local-runtime.test.js
```

The trusted API is `src/testing/local-start.js:startLocalApp({host, port,
database})`, used by the IPC test fixture, not a request-facing route or an
environment-selected server. App children receive only PATH, HOME, NODE_ENV and
the named-container opt-in. The API rejects other inherited settings (including
DATABASE_URL and provider credentials), requires test/development mode and
127.0.0.1 binding, then installs guards **before** dynamic application imports.
It supplies only synthetic JWT settings, never provider API credentials. No
dotenv file is read in that process. Production dotenv behavior is preserved.
The app listens on an OS-assigned port; bind errors reject with the actual
requested address/port. HTTP clients remain outside the guarded child.

The process guard denies unknown fetch, HTTP/HTTPS, net/Socket, TLS and DNS
destinations. Only the verified PG Unix socket can connect. Node's numeric
127.0.0.1 listener lookup is allowed; this does not authorize loopback TCP clients.
The one fetch capture accepts only the existing Twilio email POST envelope to
one `example.invalid` recipient, stores no Authorization header, and performs no
network request. All other provider calls fail locally. IPC exposes fixed test
actions only, not HTTP bypass routes. Listener and pool handles close and owned
children exit after tests; the retained DB/container remain for operator review.

This verifies manual-auth/property HTTP persistence and runtime safety, not live
Neon/provider integration, ingestion, browser acceptance or repaired auth/core
contracts. Those remain later tasks. Never run blanket backend test discovery.

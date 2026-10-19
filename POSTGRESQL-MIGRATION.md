# PostgreSQL migration implementation and runbook

This checkout contains the PostgreSQL release and local migration tools. The
original production connection will be supplied later through the deployment
dashboard. Production inventory, backup restoration, full-volume rehearsal,
and cutover remain required. The agreed strategy pauses writes in both apps.

## Local verification

Verified locally on 2026-10-10 with Bun 1.3.9, MySQL 8.4.11, and PostgreSQL
16.14: all 19 migration tests passed (127 assertions), the existing test suite
passed, both application production builds passed, and workspace/migration
type checks passed. This validates synthetic fixtures; original-data
compatibility and full-volume timing remain pending the production audit.

```sh
bun install --frozen-lockfile
DATABASE_URL="postgresql://migration@127.0.0.1:1/unused" bun run --cwd packages/db generate
bun run db:migration:rehearse
bun run typecheck
bun run typecheck:db-migration
bun run test
```

The rehearsal requires `initdb`, `pg_ctl`, and `mysqld` on PATH. It starts its
own PostgreSQL and MySQL servers on loopback with temporary data directories
and available ports. The tests create synthetic records in all 29 physical
tables, exercise copying and failure paths, and shut down the servers. Failed
server-startup artifacts are retained for diagnosis. This command never uses
the apps' `DATABASE_URL` or connects to existing databases.

For already running **disposable local servers**, the integration tests can
instead use `MIGRATION_TEST_MYSQL_ADMIN_URL` and
`MIGRATION_TEST_POSTGRES_ADMIN_URL`. Tests refuse remote hosts and create/drop
only their own databases under the `migration_test_*` prefix. Run them with
`bun --no-env-file test scripts/db-migration`.

The draft quantity migration adds `Book.quantity` with a default of 1.
The reviewed source mapping initializes this field to 1 when copying legacy
MySQL planners, which had no saved draft quantity. Unexpected source columns
still block the migration; existing values are never silently discarded.

The active Prisma migrations are PostgreSQL-only. The archived MySQL schema,
generated fixture DDL, incremental migration, and old backfill SQL live in
`packages/db/prisma/mysql/`. That archive is not a production backup.

## Connections and protected evidence

Supply an explicit environment file on the operator host, for example:

```dotenv
MYSQL_SOURCE_URL="mysql://migration_reader:PASSWORD@SOURCE_HOST:3306/SOURCE_DATABASE"
POSTGRES_TARGET_URL="postgresql://migration_writer:PASSWORD@TARGET_HOST:5432/TARGET_DATABASE"
# Only needed by the read-only payment inventory command:
STRIPE_SECRET_KEY=""
```

Keep this file private and outside version control. Use the providers' verified
TLS configuration for nonlocal connections; do not disable certificate checks.
The tools use Bun's native SQL driver. They deliberately ignore application
`DATABASE_URL`, require the expected database names, and do not print connection
strings or raw rejected data. Reports are created with mode 0600 and refuse to
overwrite previous evidence. Use a new report path for every run.

Run tools from the full monorepo release checkout. Root scripts are removed
from generated deployment branches. `--source-frozen`, `--target-isolated`,
and `--source-metadata-reviewed` are operator assertions; they do not stop
services, revoke credentials, or perform backups.

## Audit and reconcile schema drift

```sh
bun --env-file=/secure/migration.env scripts/db-migration/audit.ts \
  --expect-source SOURCE_DATABASE \
  --report /secure/source-audit-001.json
```

The audit checks table/column coverage, storage engines, nullability, type and
enum mappings, foreign keys, unique constraints, invalid values, row hashes,
and source next-ID values. It records collations and visible indexes/custom
objects. Unexpected tables, columns, enum labels, or relationships block the
copy. Custom triggers, routines, and scheduled events need explicit mapping.

A read-only MySQL account can lack visibility into triggers and routines.
Have a DBA export the complete schema, including indexes, views, triggers,
routines, events, and migration history; compare it with the audit and target
before using `--source-metadata-reviewed`. Retain that export with the backup.
Extra live columns must be preserved by a reviewed schema/manifest change;
the copier cannot silently discard them.

`User.email` and `VerificationToken.identifier` use PostgreSQL `citext` to
retain mixed-case lookup and uniqueness without rewriting stored values.
Panel search filters explicitly request case-insensitive matching. `citext`
and `ILIKE` do not reproduce every MySQL accent, trailing-space, or Unicode
collation rule. Validate the actual source's identity and search semantics in
the production-snapshot rehearsal and adjust the policy before cutover if
needed. This has not yet been proven against the original database.

If the schema is deliberately changed, generate/review a matching initial
migration, regenerate the Prisma client, run `bun run db:migration:manifest`,
and repeat the rehearsal. The tools verify both schema and baseline SQL hashes
against the manifest before connecting. Do not regenerate the manifest merely
to bypass an unexplained drift error.

## Install the target schema

Provision a new empty PostgreSQL database. The database owner must be able to
install the trusted `citext` extension; app roles need their runtime table and
sequence privileges. Point the Prisma CLI explicitly at this target and run:

```sh
# POSTGRES_TARGET_URL must already be loaded into this shell.
DATABASE_URL="$POSTGRES_TARGET_URL" bun run db:migrate
```

Run this once as the controlled migration step. Both app builds generate their
PostgreSQL client from the same `packages/db` schema. Do not copy MySQL's
`_prisma_migrations` into the target. Never run `db:push`, `db:generate`
(`migrate dev`), resets, or seeds against production.

## Final copy and verification

Before the final copy, put **both** services into maintenance with
`DATABASE_MAINTENANCE_MODE=true`, restart them, pause every job/backfill and
automatic deployment, drain requests, and fence every MySQL writer at the
database/network level. Old application instances must not retain access.
Take the final consistent backup and establish its restore evidence.

Set Coolify liveness checks to `/api/health`. This endpoint returns HTTP 200
without database/auth calls; all other requests return HTTP 503 during
maintenance. It is a liveness check, not database readiness. Verify the 503
responses on the public, staff, and direct service URLs. Application
maintenance does not replace the database write fence.

With a frozen source and isolated empty target, preview the transfer:

```sh
bun --env-file=/secure/migration.env scripts/db-migration/copy.ts \
  --expect-source SOURCE_DATABASE --expect-target TARGET_DATABASE \
  --source-frozen --target-isolated \
  --report /secure/copy-preview-001.json
```

Then execute the reviewed copy:

```sh
bun --env-file=/secure/migration.env scripts/db-migration/copy.ts \
  --expect-source SOURCE_DATABASE --expect-target TARGET_DATABASE \
  --source-frozen --target-isolated --source-metadata-reviewed --apply \
  --report /secure/copy-001.json

bun --env-file=/secure/migration.env scripts/db-migration/verify.ts \
  --expect-source SOURCE_DATABASE --expect-target TARGET_DATABASE \
  --source-frozen --target-isolated \
  --report /secure/verify-001.json
```

The copy locks target application tables and inserts explicit values in a
single PostgreSQL transaction. It enforces constraints, imports parents
before children, restores book self-references in a second pass, initializes
sequences to preserve source next IDs, and verifies every row before commit.
JSON binds as text before casting to `jsonb`, so the driver cannot convert a
JSON document into a JSON string or round its numbers in JavaScript.

The verifier independently scans both databases in byte-key order with
bounded batches. It compares complete row counts and SHA-256 row contents,
including all join tables, NULLs, soft-deleted rows, millisecond timestamps,
and semantically canonical JSON. It checks target column types/defaults,
enums, indexes, unique constraints, foreign keys, enabled triggers, and
sequences. Differences name affected tables/columns and hash the row keys.
All PostgreSQL application operations explicitly select the baseline's
`public` schema, so a role's default search path cannot redirect the copy into
another set of tables.

A failed insert or comparison rolls back the copied rows. PostgreSQL sequence
changes are not transactional; discard/reprovision a failed isolated target
rather than assuming sequence changes rolled back too. The tool never resets
a database. If a fresh source scan detects writes after the copy snapshot, the
copy report is marked failed even if target commit already occurred; keep
maintenance active and rebuild a fresh target. Keep both databases fenced
until the final independent verification and cutover decision.

## Outstanding payments

Before maintenance, inventory outstanding checkout activity:

```sh
bun --env-file=/secure/migration.env scripts/db-migration/reconcile-payments.ts \
  --expect-source SOURCE_DATABASE \
  --report /secure/payments-before-cutover-001.json
```

The command reads MySQL and Stripe, performs no external writes, and creates
a private action report. It checks recorded checkout IDs and enumerates
sessions without a creation-time filter, so sessions created before maintenance
and sessions whose IDs were not saved can be found through book-order metadata.
Only records belonging to this database are included. A Stripe read failure
or ambiguous/mismatched/terminal payment requires resolution rather than a
partial success report.

After database verification, enabling reconciliation crosses the PostgreSQL
first-write boundary. Review the report and replay `replay_order_validation`
sessions through the existing shop `order.validate` procedure using the
normal payment-success flow. It verifies session/book-order identity, repairs
a missing checkout reference, serializes finalization, advances a pending
payment when delayed payment succeeds, and returns the existing order on
retry. Only the finalizing request sends the initial confirmation or partner
transition; refunds/cancellations are not overwritten by replay.

Stored book ownership determines the new order's customer when available.
For guest checkouts, replay without an unrelated staff login; for customer
checkouts, use the customer's normal flow. Existing order ownership is preserved.

This tool intentionally does not bulk-call the production API or send customer
messages. Application post-processing and delivery need an operator-reviewed
replay during the actual cutover. Repeat the source inventory while MySQL
remains frozen and Stripe activity is outstanding. Pending/expired checkouts
must be accounted for; blocked actions require manual resolution. The current
Stripe webhook endpoints remain disabled, so no replay queue is assumed.

## Cutover and recovery

Record the successful final verification and the first-write decision. Switch
both app services and every writer to the same PostgreSQL target/release,
restart connections, reconcile outstanding work, then disable maintenance
and resume jobs in a controlled order. Preserve auth/cancellation/partner
secrets and the existing storage bucket/prefix; verify previews and print PDFs.

Before any PostgreSQL application/reconciliation write, rollback can restore
the exact MySQL app artifacts and configuration, verify MySQL, lift its fence,
and reopen. After PostgreSQL accepts writes, use a PostgreSQL-compatible
repair/release or a separately verified reverse transfer. Returning to the
frozen MySQL copy would lose new inserts, updates, and deletes.

Retain MySQL, backups, old artifacts, and evidence for the agreed recovery
period. Complete a PostgreSQL backup restore after cutover before retirement.
See [POSTGRESQL-MIGRATION-PLAN.md](POSTGRESQL-MIGRATION-PLAN.md) for owners,
outage budgeting, full-volume acceptance gates, and retention decisions.

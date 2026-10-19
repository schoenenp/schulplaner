# MySQL to PostgreSQL migration plan

Status: implementation prepared locally. The PostgreSQL baseline, strict audit/copy/verification tooling, local rehearsal, payment inventory, app compatibility fixes, and maintenance switches are implemented. The user will supply the original database connection later through the deployment dashboard. Production inventory, backup/restore, full-volume rehearsal, and cutover remain outstanding. See [POSTGRESQL-MIGRATION.md](POSTGRESQL-MIGRATION.md) for executable steps.

Use a rehearsed maintenance window: stop writes, copy the final MySQL state into a separate PostgreSQL database, prove the copy is complete, and switch both apps together. The recovery point objective is **zero lost committed application writes**. This depends on enforcing the write pause and passing the checks below; a successful import alone is insufficient.

The user has confirmed that both apps can pause writes during the final database copy and validation. The selected approach is a maintenance-window migration. Set the window's duration and abort deadline from a full-size rehearsal, including backup, copy, validation, deployment, and contingency. The replication option at the end of this plan is a fallback only if the measured outage later proves unacceptable.

## 1. Establish the production inventory and acceptance criteria

Repository findings that shape this migration:

| Finding | Consequence |
| --- | --- |
| `apps/genbooks` and `apps/panel_books` share `packages/db`. | Switch both services, their generated Prisma clients, and all background writers as one release. |
| `bun.lock` resolves Prisma and Prisma Client to 6.19.3. | Keep that version for the migration; avoid combining this with an ORM upgrade. |
| The schema declares 26 models, 17 enums, and three implicit many-to-many relations. | Copy physical join tables as well as model tables. Expected names are `_BookModuleToLocation`, `_FileToModule`, and `_ModuleToTag`; verify live names and `A`/`B` column meanings. |
| Only one incremental MySQL migration is checked in; deployment instructions also use `db push` and an ad hoc SQL script. | Audit live schema drift. The checked-in migration directory cannot reconstruct the entire source database. |
| `Order.id`, `Tooltip.id`, and `Tag.id` auto-increment. | Preserve IDs and source next-ID values, then initialize PostgreSQL sequences. |
| `Campaign.partnerUserId` maps to the physical column `sponsorUserId`. | Preserve the mapping; distinguish physical names from Prisma field names. |
| Apps deploy through generated `gen-main` and `panel-main` branches on Coolify. | Stage matching releases and suspend automatic production deployment during cutover. |
| Stripe webhook routes currently return HTTP 410. | Reconcile in-flight payments explicitly; there is no working webhook queue to assume will catch them later. |
| File bytes live in object storage, referenced by database paths. | Preserve `File.src`, `File.srcGrayscale`, the bucket, and the client prefix; verify referenced assets remain accessible. |

Before implementation, record the following in a migration manifest:

- Exact MySQL/MariaDB version, host, database, storage engines, database size, row counts, largest tables, peak write rate, time zones, SQL modes, charset, and column collations.
- Every physical table and column, primary/unique/foreign keys, indexes, views, triggers, routines, scheduled database events, and `_prisma_migrations` contents. Reconcile these against the schema without overwriting it through introspection.
- Every writer: both apps, old Coolify services, administration tools, cron jobs, scripts, storage backfills, and any external integrations. Include all instances and deployments still holding MySQL credentials.
- Target PostgreSQL version and hosting, network/TLS access, capacity, connection limits, backups, and recovery facilities. Use a version supported by the pinned Prisma release and verify that combination in staging.
- Maximum write outage, maximum recovery time, maintenance owner, database operator, application release owner, and the deadline for aborting before reopening traffic. Assign named owners; do not invent a duration before measuring.

**Gate:** every source object has a documented destination or explicit archival disposition. Unexpected tables or columns block migration; they are not silently omitted. Preserve MySQL migration history as an archive, outside the PostgreSQL application's active migration history.

## 2. Prove recoverability before changing the application

1. Capture a consistent backup and schema export, including the inventory above. Record source version, timestamp, checksums, and binary-log coordinates if available; protect backups containing authentication tokens and customer data.
2. Restore into an isolated MySQL instance with scheduled events and external side effects disabled. Verify tables, rows, and representative application reads. Record restore time.
3. Keep the exact currently deployed MySQL application artifacts and configuration available. The generic domain rollback in `DEPLOY.md` concerns a different deployment change and does not establish a safe database rollback.
4. Provision a separate, empty PostgreSQL database. Configure application and migration roles, backup retention, monitoring, and durable commits. If recovery requirements include host failure without losing acknowledged writes, provision and test synchronous redundancy appropriate to that requirement; periodic backups alone cannot provide it.
5. Test PostgreSQL backup restoration and point-in-time recovery where available, including measured restore time.

For an InnoDB source, a logical backup can use `mysqldump --single-transaction --quick` with version-appropriate options. That snapshot does not include later commits, does not make nontransactional tables consistent, and requires avoiding concurrent DDL. Select the actual backup procedure after checking engines and privileges. [MySQL backup documentation](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html)

**Gate:** both restore procedures work within the agreed recovery time. Backup-file existence alone does not pass.

## 3. Prepare the PostgreSQL schema and application release

Implement on an isolated migration branch using disposable databases.

1. Reconcile the live schema, the committed schema, and pending working-tree changes into an explicit release scope. Preserve extra live data even when the current application does not expose it.
2. Archive the MySQL schema, SQL migrations, and migration metadata. Change the new schema's datasource provider to `postgresql`, retaining Prisma 6's datasource URL configuration.
3. Generate and review a complete PostgreSQL initial migration under `packages/db/prisma/migrations/0_postgresql_init/`, with a PostgreSQL `migration_lock.toml`. Include verified indexes and any required custom SQL. Apply it to the empty target through `prisma migrate deploy`.
4. Do not copy MySQL's `_prisma_migrations` rows into PostgreSQL. Applying the new initial migration creates the correct target history. Only use `migrate resolve --applied` if the exact schema was installed separately and independently verified; it does not execute schema creation or copy data. [Prisma provider changes](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues), [baselining](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/baselining)
5. Generate the PostgreSQL Prisma client and build both apps from the same release. Update root, database-package, and app environment examples, `scripts/run-tests.ts`'s dummy database URL, relevant backfill SQL, and deployment documentation. Preserve authentication, cancellation, partner-link, and storage configuration needed by existing records.
6. Run migrations as one controlled release step. Never run `db push`, `migrate reset`, `migrate dev`, seed scripts, or `seed-delete.ts` against either production database during this migration. In this repository, `db:generate` means `migrate dev`; client generation is `bun run --cwd packages/db generate`.

### Compatibility work required

| Area | Required handling |
| --- | --- |
| Identifiers | Preserve table and column case and quote SQL identifiers, including `"User"` and `"Order"`. Preserve mapped names and join-table columns. |
| Strings and collations | Inventory actual source behavior. Preserve stored text exactly, including whitespace, Unicode, and casing. Test German accents, umlauts, case variants, and ordering. PostgreSQL filtering may become case-sensitive; review `contains`/`equals` searches in the panel's customer, planner, module, and shop-order routers. |
| Email identity and uniqueness | Audit `User.email`, authentication adapter lookups, invitation/claim emails, and `VerificationToken.identifier`. A search-only `mode: "insensitive"` change does not fix `findUnique` or enforce email uniqueness. Select and test a database-backed comparison policy, such as `citext` for appropriate email columns when supported, preserving original values. Check collisions before adding constraints; do not lowercase or merge existing accounts silently. |
| Tokens and other unique strings | Review every unique string independently. Preserve stored tokens, hashes, OAuth account IDs, order keys, and their intended comparison rules; do not make all text case-insensitive. |
| Dates | Default Prisma MySQL `DateTime` uses `DATETIME(3)` and PostgreSQL uses `timestamp(3)`. Preserve millisecond values and establish the source's actual timezone convention before conversion. Do not shift dates through the migration machine's local timezone or combine this migration with a `timestamptz` conversion. |
| Booleans, enums, and JSON | Map only verified boolean values; preserve enum labels. Compare JSON semantically while distinguishing SQL NULL from JSON null and retaining number precision. Preserve partner snapshots, notification payloads, transition payloads, and settlement summaries. |
| Money and numbers | Preserve integer monetary values and currency exactly; verify numeric ranges and avoid floating-point conversion. |
| Invalid values | Detect zero/invalid dates, invalid enum values, NUL characters, encoding problems, and out-of-range values before transfer. Resolve incompatible values through a documented, lossless mapping with the original retained, or block cutover. Never skip rows or replace values silently. |
| Foreign keys and indexes | Preserve referential actions and all unique constraints. Compare live MySQL indexes to the generated target: PostgreSQL does not automatically index referencing foreign-key columns. Add missing indexes needed by actual queries. |
| Transactions | PostgreSQL defaults to Read Committed, while MySQL normally defaults to Repeatable Read; verify the source settings and concurrency assumptions. Audit claims, campaign redemption limits, order creation, and settlement updates for locking, atomic predicates, and safe retries. |

These checks follow the connector mappings and database behavior documented by [Prisma for MySQL](https://www.prisma.io/docs/orm/v6/overview/databases/mysql), [Prisma for PostgreSQL](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql), [Prisma case sensitivity](https://docs.prisma.io/docs/orm/v6/prisma-client/queries/case-sensitivity), [Prisma transaction isolation](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions), and [PostgreSQL foreign-key constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

One concrete code fix is required in `apps/genbooks/src/server/api/routers/order.ts`: `order.validate` catches `P2002` and then queries through the same interactive transaction. On PostgreSQL, a database error aborts the transaction until rollback. Move recovery outside the failed transaction and retry/re-read safely, or serialize the operation with an appropriate lock. Test concurrent validation and ensure retries cannot duplicate emails, refunds, or other external side effects. [PostgreSQL transaction behavior](https://www.postgresql.org/docs/current/tutorial-transactions.html)

**Gate:** both apps build, schema creation succeeds from empty, drift is explained, and PostgreSQL integration tests cover the compatibility changes.

## 4. Build and rehearse a strict data-only transfer

Implemented tooling, to be reviewed against the production inventory before cutover:

| Artifact | Responsibility |
| --- | --- |
| `scripts/db-migration/audit.ts` | Produce the physical schema/table manifest, invalid-value report, sequence metadata, and source fingerprints. Read-only. |
| `scripts/db-migration/copy.ts` | Read the frozen MySQL source or isolated restored snapshot and write explicit SQL column values into the empty PostgreSQL application tables. |
| `scripts/db-migration/verify.ts` | Independently re-read both databases and compare complete contents, constraints, sequences, and business invariants. Read-only. |
| `scripts/db-migration/reconcile-payments.ts` | Inventory outstanding Stripe sessions and generate a private replay plan. Operator-reviewed replay uses the application's idempotent order.validate flow after verification. |
| `packages/db` integration tests | Exercise actual PostgreSQL transactions, queries, auth, relations, and sequence behavior. |

Use a Bun runner with pinned SQL-driver versions and bounded batches. Run these tools from the full monorepo release checkout: `scripts/sync-app-branches.ts` removes root scripts from generated deploy branches. Keep source and target connections explicit and separate. The shared application Prisma client represents one provider at a time; do not use one generated client to read MySQL and write PostgreSQL. Raw column transfer also avoids regenerating CUIDs or changing `@updatedAt` values through application write paths.

The transfer must:

- Check source and target identities, use read-only source credentials, and refuse a target containing application rows. Require an explicit apply mode and record a migration run ID.
- Copy every row in every manifested application table, including soft-deleted records, expired sessions/tokens, disconnected files, and all join tables. Preserve IDs, timestamps, NULLs, and relation values explicitly.
- Respect foreign keys by loading parents before children and joins last. For `Book.copyFromId` self-references, use a reviewed two-pass import: load with that nullable reference temporarily unset, then restore every original value before verification. Do not use app traffic until all passes finish.
- Keep constraints enforced. If an unexpected dependency cycle requires another strategy, prove it in rehearsal. Re-enabling disabled foreign-key triggers does not validate rows loaded while enforcement was disabled.
- Stop on the first rejected row or conversion error and return failure. Preserve diagnostic counts and keys without leaking tokens or customer data into routine logs. Never ignore conflicts or skip duplicates.
- Recover from an interrupted rehearsal by rebuilding a fresh, isolated target and replaying the same snapshot. The copier must never reset a source or a target that has accepted application traffic.

After copying, initialize each sequence so the next value is at least both the source's next `AUTO_INCREMENT` value and `MAX(id) + 1`, accounting for an empty table and any nonstandard source increment settings. Preserving the source next value prevents reuse of previously issued but deleted IDs. Use `pg_get_serial_sequence`/`setval` appropriately and run `ANALYZE`. [PostgreSQL sequence functions](https://www.postgresql.org/docs/current/functions-sequence.html)

If pgloader is evaluated instead of the dedicated copier, hold it to the same manifest and verification contract. Pin and review its configuration: documented defaults include target table drops, identifier downcasing, and automatic casts; it must not own the final Prisma schema or silently transform invalid dates. Its existing-table mode can also manipulate constraints and indexes. [pgloader MySQL options](https://pgloader.readthedocs.io/en/latest/ref/mysql.html)

Run at least one full-volume dress rehearsal from a restored production snapshot, plus failure/restart and rollback exercises. Sandbox email, Stripe writes, fulfillment, and object-storage mutations during rehearsal. Measure backup, copy, validation, deployment, and recovery separately. Budget the write pause for their measured total plus contingency.

## 5. Require evidence of complete preservation

Generate a machine-readable comparison report from the same frozen source state used for copying. Do not compare a changing source with an older snapshot.

- **Coverage:** exact physical-table inventory, exact row counts, and identical complete primary/unique-key sets. Include `VerificationToken`, which has no `id` field, and composite `A`/`B` keys in implicit join tables.
- **Contents:** compare every row using stable, typed serialization and SHA-256 digests in deterministic key ranges. Use the same byte ordering on both sides rather than database collation ordering. Preserve distinctions between NULL, empty strings, boolean values, and timestamps; canonicalize JSON object-key order without losing numeric precision. Any chunk mismatch must identify the differing rows and columns. Do not rely on engine-specific checksum functions or samples alone.
- **Integrity:** all primary, unique, NOT NULL, and foreign-key constraints are present and valid; no orphaned join rows. Check logical links that are not declared as foreign keys, including campaign/snapshot/claim references. Document pre-existing inconsistencies and stop if the target adds any.
- **Business invariants:** compare payment totals by currency and status, order quantities and relations, campaign redemption counts, partner orders and transitions, settlement summaries, and template-share claims. Compare to the source rather than assuming every business aggregate was already internally consistent.
- **Authentication and assets:** preserve accounts, sessions, verification tokens, token hashes, and expirations. Compare all file paths and check object availability using the existing storage audit; verify preview and print generation on the rehearsal copy.
- **Sequences and schema:** verify every next-ID value, index, default, enum, mapping, and referential action. Exercise inserts and rollback behavior in rehearsal; avoid contaminating the final comparison with smoke-test records.

Required application tests on a real PostgreSQL rehearsal database:

1. Existing sessions, email login, OAuth account linking, and mixed-case email identity.
2. Planner creation/editing/cloning, templates and sharing, module/file/tag/location relations, and PDF generation.
3. Checkout finalization, concurrent duplicate finalization, payment status updates, cancellation/refund behavior, and fulfillment.
4. Partner claim races, promotion limits, partner review transitions, and settlement batching.
5. Panel searches, sort order, permissions, uploads, and grayscale assets.

Run the existing `bun run test`, `bun run typecheck`, `bun run build:genbooks`, and `bun run build:panel` checks with the prepared target release. The current test runner deliberately uses an unreachable dummy MySQL URL and many tests mock database calls; passing those tests does not prove PostgreSQL compatibility. Keep real-database integration tests isolated from production credentials.

**Gate:** zero unexplained row/key/content differences, zero rejected rows, all required constraints valid, application tests passing, and a rehearsal duration that fits the agreed outage.

## 6. Production cutover runbook

1. **Freeze releases and DDL.** Pin the schema and both application artifacts. Suspend automatic Coolify deployments, including deploys triggered by generated branches. Have the verified MySQL artifacts ready for recovery.
2. **Stop accepting new work.** Put both public and staff services into maintenance, including direct service URLs and API/auth routes. Pause cron jobs, backfills, cleanup tasks, and all other writers. A GET request or an authentication read can still cause a session write; blocking only POST requests is insufficient.
3. **Account for external work.** Record all outstanding checkout sessions and pending orders. Stop new checkout creation and drain in-flight requests and transactions. Existing Stripe-hosted checkouts can finish while the apps are paused; establish a durable reconciliation list and scan the full outstanding set, not only sessions created after maintenance began. Do not assume disabled webhooks will replay these events.
4. **Fence MySQL writes.** Stop old application instances, enforce a database/network write fence for every source writer, and confirm that no write transactions remain. Keep the migration reader read-only. Record the final source position and timestamp. Monitor for unexpected writers throughout the copy.
5. **Take the final backup.** Capture and verify the final frozen state using the rehearsed method. Retain a recoverable copy off the source host. If any source write occurs afterward, stop and re-establish the final snapshot.
6. **Load a clean PostgreSQL target.** Apply the reviewed initial migration, copy all manifested data, restore self-references, set sequences, and update statistics. Confirm source and target identities before each operation.
7. **Run full verification.** Produce the comparison report from step 5. Any unexplained discrepancy, rejected row, invalid constraint, or missed time budget means abort before opening writes.
8. **Stage both services on PostgreSQL.** Install the matching builds and target connection settings for `genbooks`, `panel_books`, and every writer. Restart processes so no stale pools remain. Use read-only credentials/checks until the go/no-go decision; keep public maintenance active. Test production-equivalent write flows on a disposable clone beforehand, since authenticated smoke tests can themselves write.
9. **Record the decision and first-write boundary.** Database and application owners record passed gates. Enabling PostgreSQL writes, including payment reconciliation, crosses the simple rollback boundary. Keep MySQL fenced and confirm no old release can resume writing.
10. **Reconcile and reopen.** Enable the selected PostgreSQL writers, reconcile outstanding Stripe activity idempotently, and verify payment/order linkage without duplicate email or fulfillment side effects. Open both apps, resume jobs in a controlled order, and continue scanning outstanding payments until all are accounted for. Retain access to previous storage objects for existing and newly committed records.

At every step, record operator, timestamp, artifact identifier, and outcome. If the maximum outage is approached before step 9, use the rehearsed abort path rather than shortening data verification.

## 7. Recovery rules and retirement

| Failure point | Action that preserves data |
| --- | --- |
| Before any PostgreSQL application/reconciliation write | Keep maintenance active. Stop the PostgreSQL services, restore the exact MySQL application configuration, verify the frozen MySQL source, lift its write fence, and reopen. Reconcile external payments that completed during maintenance. Preserve the failed target for diagnosis. |
| After PostgreSQL has accepted any new write | Pause traffic and preserve PostgreSQL state. Prefer repairing the PostgreSQL release, or use a prebuilt compatible application release that still targets PostgreSQL. Never point users back to the frozen MySQL copy: it lacks new inserts, updates, and deletes. |
| A return to MySQL is required after PostgreSQL writes | Keep both systems fenced. Capture the complete PostgreSQL state and perform a separately rehearsed reverse migration/reconciliation into a new MySQL target, including deletes, joins, IDs, sequence metadata, and external side effects. Verify it fully before switching. This capability is additional work, not assumed by this plan. |

Keep the frozen MySQL database, final backup, old release artifacts, and comparison reports for an agreed recovery period; a proposed minimum is 14 days. Confirm storage capacity and applicable retention requirements before choosing the final period. Keep MySQL isolated from application writes throughout.

After reopening, monitor application errors, transaction conflicts, connection saturation, slow queries, payment reconciliation, and missing assets. Verify scheduled PostgreSQL backups and a restore of a backup taken after cutover. Retire MySQL only after the observation period, reconciliation of outstanding work, and a documented retirement decision.

## 8. Contingency if the measured maintenance window is too long

Replace the full frozen copy with an initial consistent snapshot plus a supported MySQL binary-log change-data-capture pipeline into PostgreSQL. Choose tooling after confirming the source/target hosts, versions, permissions, and coverage of every table, including tables without a primary key and implicit joins.

This option requires its own rehearsal: retain logs from the snapshot's exact boundary; replicate inserts, updates, and deletes with correct ordering and idempotency; prohibit unhandled DDL; test restart recovery and schema/type mappings; and keep PostgreSQL application writes disabled while replication runs.

For final cutover, still fence and drain MySQL writers, record the last committed source position, wait until the target has durably applied that exact position, stop forward replication, and validate against that common boundary before switching both apps. A lag metric of zero alone is not proof of completion. Full validation must fit the brief pause or be supported by a proven incremental validation design.

If even a brief write pause is forbidden, design durable request queuing or a write-routing handoff that preserves acknowledged operations. That is a separate availability requirement and cannot be satisfied by copying data while both databases accept independent writes. Reverse replication must be designed and tested separately if immediate rollback after new PostgreSQL writes is required.

**Completion criteria:** all data and application gates pass, both apps and every writer use PostgreSQL, outstanding payments are reconciled, post-cutover backup recovery is tested, and MySQL retirement follows the agreed retention period.

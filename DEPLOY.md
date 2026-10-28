# Deploying the monorepo on Coolify (Nixpacks)

Both apps deploy from **this single repository** as two separate Coolify
services. The old per-app repos (`schoenenp/genbooks`, `schoenenp/panel_books`)
and their Coolify services should be retained through the database recovery
period. Database rollback must follow POSTGRESQL-MIGRATION.md.

## 0. Database first

This release uses PostgreSQL. Existing MySQL deployments must complete
[POSTGRESQL-MIGRATION.md](POSTGRESQL-MIGRATION.md) before deploying it.
Stage both apps from the same release, use `/api/health` for Coolify liveness
checks, and enable `DATABASE_MAINTENANCE_MODE=true` on both services while
performing the final copy and validation. Keep automatic deployments paused
throughout cutover.

Apply the reviewed PostgreSQL migrations once with `bun run db:migrate`
against the isolated empty target before copying data. Never run `db:push`,
`db:generate` (which means `migrate dev`), or seeds against production.

## 1. Push the monorepo to GitHub

```sh
cd /Users/heroine/work/schoolbooks
git remote add origin git@github.com:schoenenp/schoolbooks.git   # create repo first
git push -u origin main
bun run sync:branches:push   # generates + pushes gen-main and panel-main
```

After that, every push to `main` regenerates both deploy branches automatically
via GitHub Actions (`.github/workflows/sync-generated-branches.yml`).

## 2. Create two Coolify services from the one repo

Each app deploys from its **generated deploy branch** (a pruned snapshot of
`main` that contains only that app plus the shared `packages/` and a
regenerated `bun.lock`). Create a Coolify application per app pointing at
`schoenenp/schoolbooks`, build pack **Nixpacks**, Base Directory `/` (the repo
root — so the workspace install sees `bun.lock` and `packages/`):

|                 | genbooks                    | panel_books              |
| --------------- | --------------------------- | ------------------------ |
| Branch          | `gen-main`                  | `panel-main`             |
| Install Command | `bun install --frozen-lockfile` | `bun install --frozen-lockfile` |
| Build Command   | `bun run build`             | `bun run build`          |
| Start Command   | `bun run start`             | `bun run start`          |
| Port            | 3000                        | 3000                     |

(The old `build:genbooks`/`build:panel` script names also still work on their
respective branches.)

Notes:
- `next start` honors Coolify's `PORT` env automatically.
- `bun run build` runs `prisma generate` (packages/db) before `next build`.
  The package's `postinstall` also generates, but bun skips lifecycle scripts
  when it considers an install a no-op (e.g. cached `node_modules`), so the
  build must not rely on it — without the generated client the type check
  fails with tRPC outputs collapsing to `unknown`. The prisma engine download
  is allowed via `trustedDependencies` in the root package.json.
- If the Nixpacks version on the server is too old to detect the textual
  `bun.lock`, set the env `NIXPACKS_INSTALL_CMD`/`NIXPACKS_BUILD_CMD`/
  `NIXPACKS_START_CMD` to the same commands, or switch that service to a
  Dockerfile build pack later.

## 3. Environment variables

Copy the full env set from each **old** Coolify service to its new one.
`NEXT_PUBLIC_*` variables must be present at **build** time, not just runtime.
The important ones per app: `DATABASE_URL`, `AUTH_*`, `STRIPE_*`,
`GHOST_GRAYSCALE_API_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `AWS_REGION`,
`S3_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`NEXT_PUBLIC_CDN_SERVER_URL`, `CUSTOM_COVER_TEMPLATE_URL` (see each app's
`.env.example`).

## 4. Verify, then cut over

1. Build both services from the same release and test their temporary URLs
   against a disposable PostgreSQL rehearsal copy. Test planner previews,
   print PDFs, and checkout there before the final data comparison.
2. Complete the final backup, frozen copy, and independent verification in
   [POSTGRESQL-MIGRATION.md](POSTGRESQL-MIGRATION.md). Keep both production
   services in maintenance until the recorded first-write decision.
3. Point both services and all writers at the exact verified PostgreSQL URL
   using the `public` schema, restart them, reconcile outstanding payments,
   and move the domains. Disable maintenance and resume jobs in a controlled
   order.
4. Retain the stopped MySQL services, source database, verified backups, and
   exact old release artifacts for the agreed recovery period. Archive old
   repositories only after recovery and retention requirements are satisfied.

## Rollback

- Before any PostgreSQL application or reconciliation write: keep maintenance
  active, restore the exact MySQL release/configuration, verify the frozen
  source, lift its write fence, and reopen.
- After PostgreSQL accepts new writes: repair the PostgreSQL release or use a
  separately verified reverse migration. Pointing domains back to services
  using the frozen MySQL copy would lose those writes.
- Local git-history backups of the old repos sit in `_archive/git-backups/`
  (untracked); they preserve source history, not database contents.

## Admin-managed prices

Admins manage print, binding, markup, minimum and shipping prices under
**Dashboard → Preise** (`ADMIN` only). Each save records a restorable version,
author and note. The partner markup, where applicable, stays under Fulfillment.
The panel stores prices in a dedicated PostgreSQL database using its own
connection and credentials. It never falls back to the shop's `DATABASE_URL`.
The shop reads prices through the token-protected `GET /api/pricing`.

Create a separate PostgreSQL resource in Coolify for each platform's pricing.
Use its internal connection URL when it shares the panel's network. Keep the
database resource's default persistent storage and configure its backups.
The panel application itself no longer needs a pricing volume.

Set these variables at **build time and runtime** before deploying:

| Service | Variable | Value |
| --- | --- | --- |
| panel_books | `PRICING_DATABASE_URL` | Internal URL of the separate pricing PostgreSQL database |
| panel_books | `PRICING_API_TOKEN` | Token generated locally with `openssl rand -hex 32` |
| genbooks | `PRICING_SOURCE_URL` | `https://<panel domain>/api/pricing` |
| genbooks | `PRICING_API_TOKEN` | The same token as the panel |

The panel rejects a pricing URL targeting the shop database, even with other
credentials, and refuses databases containing known shop tables. Use a
separate resource and credentials: URL checks cannot identify every DNS alias.
Keep the shop's existing `DATABASE_URL` unchanged.

On its first pricing request the panel creates the `pricing` schema, schema
metadata and history table, then seeds the previous prices as version 1. The
pricing role needs permission to create a schema in its own database. No
pricing migration is added to the shop's Prisma schema. Initialization and
saves are transactional and coordinated across panel instances. The database
does not need to be reachable during the Next.js build.

Deploy the panel first, check its endpoint, then deploy the shop:

```sh
curl -H "Authorization: Bearer $PRICING_API_TOKEN" https://<panel domain>/api/pricing
```

The shop caches prices for 30 seconds and keeps the last successfully loaded
prices during a panel/database outage. A new shop process that has never loaded
prices refuses to quote until the API is available. Submitted amounts stay
unchanged, and new submissions record their price book version.

### Moving existing SQLite prices

If prices were already edited in SQLite, preserve the old file and import it
**before the new panel first connects**. Stop the old panel to freeze writes,
make the file available to a checkout/container with the new pricing package,
and set `PRICING_DATABASE_URL` to the empty pricing database. Run:

```sh
bun run --cwd packages/pricing import:sqlite /path/to/pricing.sqlite
```

The import reads SQLite without changing it and preserves every version ID,
price, author, note, restore reference and creation timestamp. It refuses to
overwrite a PostgreSQL store that already contains price versions. Keep the
old file until the new panel's history has been verified. If no prices were
edited, the seeded defaults match the previous values.

Remove the obsolete `PRICING_DB_PATH` variable. Remove an old SQLite mount only
after verifying the import or confirming it contains no edits. Back up prices
through the separate PostgreSQL resource's database backups.

### Testing the PostgreSQL store

With `initdb`, `pg_ctl` and `createdb` on PATH, run:

```sh
bun run --cwd packages/pricing test:postgres
```

This starts a throwaway local PostgreSQL cluster, runs the full repository test
suite including database integration tests, and removes the cluster. It never
loads developer environment files or connects to an existing server. Plain
`bun run test` skips PostgreSQL integration cases unless
`PRICING_TEST_DATABASE_URL` is explicitly set to a local test server.

## Database package

Both apps share one PostgreSQL database through `packages/db`, which owns the
single `prisma/schema.prisma`, the migrations, the seed scripts, and the
exported `db` client (each app's `src/server/db.ts` re-exports it).
`prisma generate` runs once via the package's `postinstall` and serves both
apps. Run migrations with `bun run db:migrate` — available on `main` and on
both deploy branches (locally it reads `DATABASE_URL` from `packages/db/.env`;
on the server from the service env).

Before deploying the storage change, complete the per-client migration and verification in [STORAGE.md](STORAGE.md). Both app services need the same client prefix.

## Node.js security runtime

Node.js is pinned to `22.23.4` in `package.json` and `.node-version`.
Nixpacks only selects a major version from its Nix archive, so `nixpacks.toml`
also runs `deploy/install-node.sh` during setup. It installs the official Linux
Node.js archive under `/opt/node` after checking its pinned SHA-256. The
configured path takes precedence during build and runtime, and a build guard
rejects a different Node version. Both x64 and arm64 Linux builds are supported.

The existing branch-sync workflow retains these files in `gen-main` and
`panel-main`. Push the source changes to `main`, wait for branch sync, then
rebuild both Coolify services using their existing Nixpacks configuration.
A `NIXPACKS_NODE_VERSION=22` build variable may remain; it is not the patch pin.
Keep the existing build/start commands. After deployment, confirm
`node --version` is `v22.23.4` inside both replacement containers and verify
sign-in and PDF generation. Restarting an old container does not patch it.

For a future security release, update the version declarations, installer
version and both official archive checksums, and the Nixpacks build guard.

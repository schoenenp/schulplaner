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

Admins edit print, binding, markup, minimum and shipping prices in the panel
under **Dashboard → Preise** (role `ADMIN` only; staff and moderators cannot
open the page or call its API). The prices are kept apart from PostgreSQL in
their own SQLite file, owned by the panel. Every save is a new version with
author, note and a restorable history. The shop loads the current version from
the panel's `GET /api/pricing`, authenticated with a shared token.

Configure both services **before** deploying this release. Both variables are
required in production builds, so a missing value fails the build and the
running containers stay untouched.

| Service     | Setting                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| panel_books | Persistent storage (volume) mounted at e.g. `/data/pricing`              |
| panel_books | `PRICING_DB_PATH=/data/pricing/pricing.sqlite`                           |
| panel_books | `PRICING_API_TOKEN=<openssl rand -hex 32>`                               |
| genbooks    | `PRICING_SOURCE_URL=https://<panel domain>/api/pricing`                  |
| genbooks    | `PRICING_API_TOKEN=<the same token>`                                     |

Without the volume every redeploy starts an empty database and the shop falls
back to the seeded default prices. `PRICING_SOURCE_URL` may also use the
panel's internal Coolify network address if both services share a server.
Run the panel as a single container: the price file belongs to that one
instance and its volume.

Deploy the panel first. On its first start it creates the file and stores the
prices that were previously hard-coded as version 1, so nothing changes for
customers until an admin saves new prices. It logs
`pricing_db_initialized_with_defaults` exactly once; that line after a later
redeploy means the volume is not mounted. The page also shows when the price
database was created. Check the endpoint, then deploy the shop:

```sh
curl -H "Authorization: Bearer $PRICING_API_TOKEN" https://<panel domain>/api/pricing
```

The shop caches prices for 30 seconds, so saved prices reach customers within
a minute. If the panel is unreachable the shop keeps selling with the last
prices it loaded. A shop that has never loaded prices refuses to quote rather
than guess. Checkout recomputes prices on the server and records the price
version in the Stripe session metadata (`priceBookVersion`). Existing orders
keep their stored amounts. `/api/pricing` stays available during
`DATABASE_MAINTENANCE_MODE` because it never touches PostgreSQL.

Back up the price database from the volume with `sqlite3 pricing.sqlite
".backup pricing-backup.sqlite"` (the file runs in WAL mode; copy all
`pricing.sqlite*` files together only while the panel is stopped). Node 22
prints a one-time `ExperimentalWarning` for its built-in SQLite module; it is
harmless.

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

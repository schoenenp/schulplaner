# Deploying the monorepo on Coolify (Nixpacks)

Both apps deploy from **this single repository** as two separate Coolify
services. The old per-app repos (`schoenenp/genbooks`, `schoenenp/panel_books`)
and their Coolify services stay untouched until the new services are verified —
they are the rollback.

## 0. Database first (one-time, required before deploying this code)

The refactored code expects two new nullable columns on `File`
(`pageCount`, `srcGrayscale`). Apply them **before** the first deploy, either:

```sh
bun run db:push          # prisma db push from packages/db (uses its DATABASE_URL)
# or run apps/genbooks/scripts/sql/add-file-pagecount.sql against MySQL
```

Then, whenever convenient (optional, improves speed for existing modules):

```sh
bun apps/genbooks/scripts/backfill-file-page-counts.ts --apply
bun apps/genbooks/scripts/backfill-grayscale-variants.ts --apply
```

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
- `bun install` runs the `postinstall` of `packages/db` (`prisma generate`);
  the prisma engine download is allowed via `trustedDependencies` in the root
  package.json.
- If the Nixpacks version on the server is too old to detect the textual
  `bun.lock`, set the env `NIXPACKS_INSTALL_CMD`/`NIXPACKS_BUILD_CMD`/
  `NIXPACKS_START_CMD` to the same commands, or switch that service to a
  Dockerfile build pack later.

## 3. Environment variables

Copy the full env set from each **old** Coolify service to its new one.
`NEXT_PUBLIC_*` variables must be present at **build** time, not just runtime.
The important ones per app: `DATABASE_URL`, `AUTH_*`, `STRIPE_*`,
`GHOST_GRAYSCALE_API_KEY`, `UPLOAD_URL_LINK`, `UPLOAD_API_KEY`,
`NEXT_PUBLIC_CDN_SERVER_URL`, `CUSTOM_COVER_TEMPLATE_URL` (see each app's
`.env.example`).

## 4. Verify, then cut over

1. Deploy both new services and test them on their temporary Coolify URLs
   (generate a planner preview + a print PDF in the panel; place a test
   config in the shop).
2. Move the domains from the old services to the new ones.
3. Keep the old services stopped-but-configured for a week, then delete them
   and archive the two old GitHub repos (their history, including the final
   `pdf-pipeline-refactor` snapshot branches, stays available).

## Rollback

- **Before cutover:** nothing to do — old services were never touched.
- **After cutover:** point the domains back at the old services (their repos
  still contain the pre-refactor `main` and the refactor snapshot branch).
- Local git-history backups of the old repos also sit in
  `_archive/git-backups/` (untracked).

## Database package

Both apps share one MySQL database through `packages/db`, which owns the
single `prisma/schema.prisma`, the migrations, the seed scripts, and the
exported `db` client (each app's `src/server/db.ts` re-exports it).
`prisma generate` runs once via the package's `postinstall` and serves both
apps. Run migrations with `bun run db:migrate` — available on `main` and on
both deploy branches (locally it reads `DATABASE_URL` from `packages/db/.env`;
on the server from the service env).

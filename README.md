# schoolbooks

Bun-workspaces monorepo for the school planner shop and its staff panel.

```
apps/genbooks       customer shop (Next 15)          — was schoenenp/genbooks
apps/panel_books    staff dashboard (Next 16)        — was schoenenp/panel_books
packages/pdf-pipeline  shared PDF book generation (TS source, transpiled by the apps)
packages/db         shared Prisma schema, migrations, and db client (TS source)
_archive/           retired code + local git-history backups (not committed)
```

Both apps share one MySQL database through `packages/db`: the single
`schema.prisma`, its migrations, and the exported `db` client live there, and
each app's `src/server/db.ts` just re-exports it.

## Setup

```sh
bun install          # installs all workspaces, runs prisma generate (packages/db)
```

The Prisma CLI reads `DATABASE_URL` from `packages/db/.env` (see its
`.env.example`); the apps read theirs from the per-app `.env` files.

## Everyday commands (from the repo root)

```sh
bun run dev:genbooks     bun run dev:panel
bun run build:genbooks   bun run build:panel
bun run start:genbooks   bun run start:panel
bun run test             # pdf-pipeline tests + genbooks tests
bun run typecheck        # all four workspaces
bun run db:generate      # prisma migrate dev        (packages/db)
bun run db:migrate       # prisma migrate deploy     (packages/db)
bun run db:push          # prisma db push            (packages/db)
bun run db:studio        # prisma studio             (packages/db)
```

Per-app `.env` files live in each app directory (see the `.env.example`s).

## Branch workflow

`main` is the source-of-truth monorepo branch and keeps both apps plus the
shared `packages/` together.

The app-specific branches are generated deploy branches derived from `main`:

- `gen-main` — `apps/genbooks` + `packages/`
- `panel-main` — `apps/panel_books` + `packages/`

Never commit to or merge from those branches. Update `main` first, then
regenerate them:

```sh
bun run sync:branches         # regenerate both branches locally
bun run sync:branches:push    # regenerate and force-push to origin
```

On GitHub, a workflow regenerates both deploy branches automatically on every
push to `main`, and two guard workflows block/auto-close any accidental PR
from a deploy branch back into `main`.

## Deployment

Coolify + Nixpacks, one service per deploy branch (`gen-main`, `panel-main`) —
see [DEPLOY.md](DEPLOY.md).

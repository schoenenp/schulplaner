# schoolbooks

Bun-workspaces monorepo for the school planner shop and its staff panel.

```
apps/genbooks       customer shop (Next 15)          — was schoenenp/genbooks
apps/panel_books    staff dashboard (Next 16)        — was schoenenp/panel_books
packages/pdf-pipeline  shared PDF book generation (TS source, transpiled by the apps)
_archive/           retired code + local git-history backups (not committed)
```

Both apps share one MySQL database and each still owns its own
`prisma/schema.prisma` — keep the two schemas identical when changing models
(consolidating them into a shared package is the planned next step).

## Setup

```sh
bun install          # installs all workspaces, runs prisma generate per app
```

## Everyday commands (from the repo root)

```sh
bun run dev:genbooks     bun run dev:panel
bun run build:genbooks   bun run build:panel
bun run start:genbooks   bun run start:panel
bun run test             # pdf-pipeline tests + genbooks tests
bun run typecheck        # all three workspaces
```

Per-app `.env` files live in each app directory (see the `.env.example`s).

## Branch workflow

`main` is the source-of-truth monorepo branch and keeps both apps plus
`packages/pdf-pipeline` together.

The app-specific branches are generated deploy branches derived from `main`:

- `gen-main` — `apps/genbooks` + `packages/pdf-pipeline`
- `panel-main` — `apps/panel_books` + `packages/pdf-pipeline`

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

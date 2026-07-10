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

## Deployment

Coolify + Nixpacks, two services from this one repo — see [DEPLOY.md](DEPLOY.md).

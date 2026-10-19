# Archived MySQL schema

These files preserve the pre-PostgreSQL schema and the checked-in MySQL
migration history. They are outside Prisma's active `migrations` directory.

`schema.sql` was generated from `schema.prisma` with Prisma 6.19.3 for disposable
rehearsal fixtures. It is not an export of production and does not establish
production's schema, migration history, or data contents.

Use the exact deployed MySQL artifacts and a verified backup for rollback
before PostgreSQL accepts writes. See the root migration plan and runbook.

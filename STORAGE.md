# Hetzner object storage

Both apps in this repository use the private `pirrot-books` bucket at
`https://nbg1.your-objectstorage.com`. Uploads go directly from the app server
to S3; browser reads go through `/api/cdn`, which checks access before streaming
an object. Server PDF generation reads S3 directly. The old receiving service
`api.cdn.pirrot.de` is no longer part of the runtime upload path.

## Configuration

Use these settings on both app services; secret values belong in the deployment
platform or ignored local environment files:

```dotenv
S3_BUCKET="pirrot-books"
S3_ENDPOINT="https://nbg1.your-objectstorage.com"
AWS_REGION="nbg1"
S3_PREFIX="clients/pirrot"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
```

Each client has its own database and object namespace:

| Repository | S3_PREFIX (same for shop and panel) |
| --- | --- |
| foto-raabe-books | clients/foto-raabe |
| fotos-mit-herz-books | clients/fotos-mit-herz |
| pirrot-books | clients/pirrot |

For example, the database reference `/storage/example.pdf` resolves to
`clients/pirrot/storage/example.pdf` in the bucket. Keep the prefix stable
after migration. Prefixes prevent key collisions; bucket policies and application
authorization provide access control. Keep the bucket private. No browser CORS
configuration or public S3 domain is needed with these routes.

`NEXT_PUBLIC_CDN_SERVER_URL` can be empty. `UPLOAD_URL_LINK` and `UPLOAD_API_KEY`
are retired runtime settings. Keep `AUTH_SECRET` stable: it signs pending uploads.
Public assets bundled under the app's `public/` directory stay with the app.

Root scripts use the process environment, not the app environment automatically.
From this repository's root, use the explicit env file when working locally:

```sh
bun --env-file=apps/genbooks/.env.local packages/storage/scripts/check.ts
```

If the credentials are in `apps/genbooks/.env`, use that filename instead.
The check uploads one unique temporary object in this client's namespace,
reads its contents back, then removes that object. It does not modify other files.
In a deployment shell with variables already loaded, use `bun run storage:check`.

## Migrate the public webserver files before deployment

Run the migration separately for each client database and prefix, from the main
repository checkout. This tool copies referenced PDFs, PNGs, and JPEGs; it does
not mirror the whole old webserver. The old delivery origin is:

```dotenv
LEGACY_STORAGE_URL="https://cdn.pirrot.de"
```

Set this in the migration environment along with `DATABASE_URL` and the S3
settings. `LEGACY_STORAGE_API_KEY` is optional for a protected legacy source;
leave it unset for the public server. Do not use `api.cdn.pirrot.de/api/upload/`
as the download source.

With these variables loaded:

```sh
bun run storage:migrate             # inspect the plan; no S3 writes
bun run storage:migrate --apply     # copy missing files and verify their bytes
bun run storage:migrate --verify    # read-only verification
bun run storage:audit              # current objects and missing references
```

The inventory includes all `File.src` and `File.srcGrayscale` references,
including disconnected files and soft-deleted modules, `/storage/notizen.pdf`,
and an internal `CUSTOM_COVER_TEMPLATE_URL` when configured. Duplicate references
are copied once per client namespace. Unsupported/external references are
reported for separate review. The migration preserves database references and
source files, refuses redirects and unsupported file contents, and never
intentionally replaces an existing target. Individual copies are limited to
128 MiB; larger legacy files need a separate reviewed transfer.

Hetzner does not support conditional PUT on versioned buckets. The migration
requires versioning to be unset on this new Hetzner bucket and stops if it is
enabled or suspended; it does not change bucket settings. Review any external
assets or references outside the database inventory before cutover.

For cutover, briefly pause legacy uploads, run a final copy and verification,
then deploy both apps for the client with the same prefix and credentials.
Check a module upload, image thumbnail, grayscale PDF, planner preview, and
print PDF in both apps. A dry run is not proof that files have been copied.
Keep the old server until these checks pass. Once users create new S3-only
uploads, reverting to old code also requires preserving access to those files.
Direct links outside these apps that still point at `cdn.pirrot.de` continue to
need the old domain; this change does not redirect that domain globally.

## Cost controls implemented

- Unchanged browser downloads can reuse cached bytes after authorization and
  ETag/date validation. A successful validation returns `304` without file data.
  This saves transfer bytes; validation still makes an S3 read request.
- A static grayscale module loads its stored grayscale PDF first. It loads the
  colour original only if fallback is needed. The normal case uses one source
  download instead of two. Planners retain their original form geometry.
- Repeated optional PDF variants are reused within each generation job.
- Identical files within a single upload batch share one stored object. Separate
  upload calls retain independent keys and lifetimes.
- `storage:audit` lists object counts and bytes in the client's prefix, missing
  references, and the largest objects not referenced by this database. It is
  read-only: unreferenced objects are review candidates, not deletion approval.

Print originals are stored without lossy compression. The audit measures S3
object sizes instead of trusting historical database `File.size` values. Its
current-object listing excludes older versions, incomplete multipart uploads,
and provider metadata overhead; it is not an invoice estimate.

## Operating costs

Hetzner's included storage and outgoing traffic are shared across an account's
buckets. S3 API calls and uploads are free; storage and outgoing traffic above
the included allowance are the main storage costs. App hosting can add its own
bandwidth charges. Monitor the total stored bytes and outgoing traffic in the
Hetzner console, plus the app host's transfer usage. See the current
[Hetzner pricing and included allowances](https://www.hetzner.com/storage/object-storage/).

Hetzner currently offers Standard storage, without AWS-style archive tiers.
Do not apply Glacier or Intelligent-Tiering recommendations here. An incomplete
multipart-upload lifecycle rule (for example, abort after 7 days) can prevent
abandoned upload parts accumulating if multipart uploads are introduced. Merge
such a rule with existing rules; do not replace a bucket's full configuration
blindly. Do not expire completed modules or client files solely by age: old books
and templates can still reference them. See
[Hetzner storage capabilities](https://docs.hetzner.com/storage/object-storage/faq/general/)
and [lifecycle behavior](https://docs.hetzner.com/storage/object-storage/faq/buckets-objects/).

Reference: [Hetzner SDK configuration](https://docs.hetzner.com/storage/object-storage/getting-started/using-libraries/)
and [supported S3 actions](https://docs.hetzner.com/storage/object-storage/supported-actions/).

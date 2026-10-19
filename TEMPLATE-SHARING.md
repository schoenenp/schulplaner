# Template invitations

An authorized owner shares an active template from Dashboard → Planer. A link
can be claimed by signed-in users; an email invitation is restricted to the
invited email address. Each recipient gets their own editable planner.

## Recipient flow

1. Open the invitation, then sign in with the invited address. New accounts are
   created after the normal email verification step. Google sign-in is also
   available for the same address.
2. Select **Vorlage übernehmen und öffnen**. The copy opens directly in the editor
   at `/config?bookId=…`, with custom dates, module order, colors and locations.
3. Reopening the invitation offers **Meinen Planer öffnen**. Repeated claims return
   the same planner. An owned copy remains accessible after the invitation expires.
4. If a different account is signed in, **Mit anderer E-Mail anmelden** signs out
   and retains the invitation when returning to sign-in.

Old `/template/share/claim?token=…` email links redirect to the same landing page.
Opening a link no longer creates a user/session or claims a template on a GET
request. Existing `claimedTemplate` dashboard URLs also open the planner editor.
Expired, revoked or unavailable templates cannot create new copies.

Invitation emails go only to the recipient, without the order-notification BCC.
SMTP rejection returns an error and revokes that new invitation. SMTP acceptance
does not prove delivery to the inbox.

## Verification and rollout

Run `bun run test:template-sharing` from the repository root for the focused suite,
or `bun run test` for all tests. Both use `scripts/run-tests.ts` to isolate module
mocks and supply dummy credentials. Invitation coverage lives in three places:

- `template-share.test.ts`: sharing/claiming through the API and the real email
  sender, with one reusable persistence fixture in `src/test/template-sharing.ts`.
- `template-invitation.test.ts`: real Auth.js handlers and Prisma adapter with
  production proxy headers, including new/existing accounts and another browser.
- `claim/route.test.ts`: old invitation URLs and missing tokens.

The focused command also runs the existing auth-origin policy checks. Tests use
captured email and in-memory persistence, covering ownership, retries and expiry.
They do not test a live SMTP service, a real database or browser rendering.

Deploy the changed genbooks app to activate the fix. These changes require no new
schema migration; the existing `20260607120000_add_template_shares` migration must
already be applied. Configure `AUTH_URL` with that deployment's public HTTPS
origin and allow it in `APP_ALLOWED_ORIGINS` if an explicit allowlist is set.
The reverse proxy must preserve the public forwarded host/protocol.

After deployment, verify a fresh invitation with a controlled recipient mailbox:
open it signed out, finish sign-in, claim it, edit the copy, and reopen the same
invitation. Repeat with a different account initially signed in. This live check
has not been performed as part of the local automated verification.

Sharing operates within one deployment's database. Moving templates between
separately deployed client databases is a separate import/publishing operation.

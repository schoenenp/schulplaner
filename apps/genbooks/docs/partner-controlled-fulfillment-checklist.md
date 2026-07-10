# Partner-Controlled Fulfillment Checklist

## 0) Scope and Feature Flag
- [x] Add feature flag `PARTNER_CONTROLLED_FULFILLMENT_ENABLED` (default off in production).
- [x] Keep current flow as fallback until full rollout is verified.
- [x] Add migration-safe defaults so old orders remain processable.

## 1) Data Model and Status Machine
- [x] Add `PartnerOrderStatus` enum:
  - [x] `SUBMITTED_BY_SCHOOL`
  - [x] `UNDER_PARTNER_REVIEW`
  - [x] `PARTNER_CONFIRMED`
  - [x] `PARTNER_DECLINED`
  - [x] `RELEASED_TO_PRODUCTION`
  - [x] `FULFILLED`
- [x] Add `PartnerOrder` model with:
  - [x] `id` (cuid)
  - [x] `partnerUserId`
  - [x] `schoolUserId` (nullable for guest)
  - [x] `bookId`
  - [x] `status`
  - [x] `submittedAt`
  - [x] `reviewedAt` (nullable)
  - [x] `reviewedByUserId` (nullable)
  - [x] `declineReason` (nullable)
  - [x] `releasedAt` (nullable)
  - [x] `fulfilledAt` (nullable)
  - [x] `createdAt`, `updatedAt`
- [x] Add immutable snapshot fields for legal/audit:
  - [x] school billing snapshot (name/address/email/vat)
  - [x] partner issuer snapshot (name/address/vat/contact)
  - [x] line items snapshot (qty/modules/prices/taxes)
  - [x] source campaign/claim ids
- [x] Add indexes:
  - [x] `(partnerUserId, status, updatedAt)`
  - [x] `(bookId)` unique or constrained as needed
  - [x] `(status, submittedAt)`

## 2) Move "Partner Vorlagen fortsetzen" to Planner
- [x] Remove section from profile partner area.
- [x] Add section to planner/saved-config area where school configs already appear.
- [x] Show label for partnered configs and link back to `/config?bookId=...`.
- [x] Preserve ownership guards (`PARTNER_TEMPLATE` only claim owner).

## 3) School Submit -> Partner Inbox (No Auto Fulfillment)
- [x] On partner-template checkout submit, create `PartnerOrder` in `SUBMITTED_BY_SCHOOL`.
- [x] Do not send shop fulfillment email automatically.
- [x] Do not release production automatically.
- [x] Create partner notification event for incoming order.

## 4) Partner Notifications in Profile
- [x] Add `PartnerNotification` model:
  - [x] `id`, `partnerUserId`, `type`, `payload`, `readAt`, `createdAt`
- [x] Add procedures:
  - [x] `listPartnerNotifications`
  - [x] `markPartnerNotificationRead`
  - [x] unread count endpoint
- [x] Add profile widget "Eingehende Partner-Bestellungen":
  - [x] unread badge
  - [x] quick links to review queue

## 5) Partner Review Queue and Actions
- [x] Add partner order list procedure:
  - [x] `listIncomingPartnerOrders(status[])`
- [x] Add detail procedure:
  - [x] `getPartnerOrderById`
- [x] Add action procedures:
  - [x] `confirmPartnerOrder(orderId)`
  - [x] `declinePartnerOrder(orderId, reason)`
- [x] Transition rules:
  - [x] submit -> review
  - [x] review -> confirmed/declined
  - [x] confirmed -> released
- [x] Require decline reason.
- [x] Record reviewer user + timestamp in audit fields.

## 6) Release to Production and Shop Email
- [x] Add server-side release procedure:
  - [x] `releasePartnerOrderToProduction(orderId)`
- [x] Idempotent email dispatch with `idempotencyKey`.
- [x] Send shop email only after partner confirmation.
- [x] Include final locked snapshot in fulfillment payload.

## 7) Invoice Logic (Current Target)
- [x] Generate school-facing invoice branded by partner.
- [x] Add mandatory footer text:
  - [x] `in Partnerschaft mit Digitaldruck Pirrot GmbH`
- [x] Store invoice issuer snapshot from partner profile at confirmation time.
- [x] Ensure school invoice references partner as issuer.
- [x] Keep partner->platform invoice creation deferred for batch settlement.

## 8) Settlement (Later, Bulk)
- [x] Add `PartnerSettlementBatch` skeleton model.
- [x] Add monthly aggregation job design doc.
- [x] Add preview endpoint for partner settlement totals.
- [x] Keep disabled behind feature flag for now.

## 9) Compliance and Audit (EU/DE/AT)
- [x] Add compliance checklist doc with sign-off section.
- [x] Persist immutable evidence per order:
  - [x] status transition history
  - [x] actor id + timestamp
  - [x] invoice payload hash/snapshot
- [x] Add country-aware invoice format rules:
  - [x] DE path
  - [x] AT path
- [x] Prepare structured e-invoice compatibility path (DE phased obligations).

## 10) API and Security Guardrails
- [x] Enforce partner ownership on all partner-order procedures.
- [x] Enforce claim ownership for school-side partner templates.
- [x] Add rate limits on submit/confirm/decline/release.
- [x] Add optimistic concurrency guard to avoid double-review races.

## 11) Observability
- [x] Add structured logs for each status transition.
- [x] Add error logs for release/invoice failures with correlation id.
- [x] Add minimal dashboard metrics:
  - [x] incoming count
  - [x] pending review age
  - [x] confirmed vs declined ratio

## 12) Tests
- [x] Unit tests:
  - [x] status transition validator
  - [x] invoice snapshot builder
  - [x] idempotent release key behavior
- [x] API tests:
  - [x] submit -> notification
  - [x] confirm -> release -> shop email
  - [x] decline requires reason
  - [x] unauthorized partner access blocked
- [x] Integration tests:
  - [x] end-to-end school submit -> partner confirm -> production release
  - [x] end-to-end school submit -> partner decline

## 13) Rollout Plan
- [x] Phase 1: deploy schema + read-only UI changes.
- [x] Phase 2: enable submit->partner review flow for internal pilot partners.
- [x] Phase 3: enable release-to-production in pilot.
- [x] Phase 4: full partner rollout + old auto-flow removal.
- [x] Phase 5: settlement batch go-live.

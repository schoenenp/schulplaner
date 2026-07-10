# Partner Claim Flow Rollout Checklist

## 1) Prisma Schema
- [x] Add enum `PartnerClaimStatus` (`PENDING`, `VERIFIED`, `CONSUMED`, `EXPIRED`)
- [x] Add enum `BookSourceType` (`STANDARD`, `PARTNER_TEMPLATE`)
- [x] Add model `PartnerClaim` with:
  - [x] `id` (cuid)
  - [x] `campaignId` (nullable, string)
  - [x] `promotionCodeId`
  - [x] `snapshotBookId`
  - [x] `email`
  - [x] `userId` (nullable)
  - [x] `bookId` (nullable)
  - [x] `status`
  - [x] `verifyTokenHash` (unique)
  - [x] `expiresAt`
  - [x] `verifiedAt` (nullable)
  - [x] `consumedAt` (nullable)
  - [x] `createdAt`, `updatedAt`
- [x] Add to `Book`:
  - [x] `sourceType` default `STANDARD`
  - [x] `partnerClaimId` (nullable)
  - [x] `partnerPromotionCodeId` (nullable)
  - [x] `partnerSnapshotBookId` (nullable)
- [x] Add indexes:
  - [x] `PartnerClaim(email, status)`
  - [x] `PartnerClaim(promotionCodeId, status)`
  - [x] `PartnerClaim(verifyTokenHash)` unique

## 2) Server Utilities
- [x] Create `src/util/partner-claim.ts`:
  - [x] token generation
  - [x] token hashing
  - [x] expiry helpers
  - [x] email masking helper for UI feedback

## 3) New Partner Claim APIs
- [x] `startPartnerClaim` (public):
  - [x] validate token + campaign + promo code
  - [x] create/update `PartnerClaim(PENDING)`
  - [x] send verification/auth email with claim link
  - [x] no clone yet
  - [x] no redemption increment yet
- [x] `completePartnerClaim` (protected):
  - [x] resolve by token hash
  - [x] enforce email match to session user
  - [x] clone snapshot template idempotently
  - [x] mark claim `VERIFIED/CONSUMED`
  - [x] increment redemption once
  - [x] return redirect payload to `/config?bookId=...`
- [x] `listPartnerClaims` (protected):
  - [x] list resumable partnered configs for dashboard

## 4) Frontend Template Entry
- [x] Replace direct redeem with 2-step claim flow:
  - [x] Step 1: promo + email => `startPartnerClaim`
  - [x] Step 2: open claim link from email
- [x] On `/template?claim=...`:
  - [x] if not logged in => prompt signin with callback back to claim URL
  - [x] if logged in => run `completePartnerClaim` and redirect to config

## 5) Config/Access Guards
- [x] Ensure partnered templates only accessible by claim owner
- [x] Return clear errors for expired/invalid/foreign claim usage

## 6) Dashboard Resume
- [x] Add section to resume partnered templates from claimed links
- [x] Show status and continue button

## 7) Cleanup
- [x] Remove old direct `redeemCampaign` flow
- [x] Update user-facing wording from sponsor->partner where needed
- [x] Update docs to describe claim/verify flow

## 8) Tests
- [x] Unit tests for token/hash/expiry
- [x] API tests for start/complete/idempotency/email mismatch
- [x] Integration test for end-to-end claim->verify->config resume

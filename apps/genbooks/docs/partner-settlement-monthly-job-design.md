# Partner Settlement Monthly Job Design

## Goal
Aggregate partner-controlled orders into monthly settlement batches (partner -> platform) without blocking school fulfillment.

## Inputs
- `PartnerOrder` with status in `RELEASED_TO_PRODUCTION | FULFILLED`
- `settlementBatchId = null`
- `lineItemsSnapshot` (`baseTotalAmount`, `addOnTotalAmount`)
- Partner identity (`partnerUserId`)

## Batch Strategy
1. Resolve settlement cycle window in UTC (`cycleStart`, `cycleEnd`).
2. Group eligible orders by `partnerUserId`.
3. Create one `PartnerSettlementBatch` per partner and cycle with `status=DRAFT`.
4. Attach orders to the created batch in one transaction.
5. Write a summary snapshot into `batch.summary` (counts/totals/hash).

## Safety / Idempotency
- Job key: `partner_settlement_{year}_{month}`.
- Per-partner idempotency key: `{jobKey}_{partnerUserId}`.
- Skip creation if a draft/finalized batch already exists for same partner + cycle.

## Output
- Draft batch records for finance review.
- No invoice emission yet (bulk settlement remains manual phase).

## Follow-up Phases
- Finance review screen
- Batch finalize/export states
- Automated partner->platform invoice creation

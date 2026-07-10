# Partner-Programm EU Compliance Checklist

## Scope
Partner-controlled school planner flow (DE/AT/EU) with school-facing partner-branded invoices and platform fulfillment.

## Data & Audit
- [x] Immutable transition history persisted (`PartnerOrderTransition`).
- [x] Actor id + timestamp persisted on each transition.
- [x] Correlation id persisted for traceability.
- [x] Invoice payload hash persisted for confirmation events.
- [x] Locked release snapshot included in production release payload.

## Invoice Requirements
- [x] School-facing invoice footer includes: `in Partnerschaft mit Digitaldruck Pirrot GmbH`
- [x] Invoice issuer snapshot persisted on partner confirmation.
- [x] Country-aware invoice path marker stored (`DE` / `AT` / `EU`).
- [x] E-invoice compatibility marker stored:
  - DE: `DE_XRECHNUNG_ZUGFERD_PREP`
  - AT: `AT_EBINTERFACE_PREP`
  - EU: `EU_GENERIC_PREP`

## Operational Controls
- [x] Partner ownership checks on partner-order procedures.
- [x] Claim ownership enforced for school-side partner templates.
- [x] Rate limiting on submit/confirm/decline/release.
- [x] Concurrency guards on confirm/decline/release transitions.

## Sign-off
- Product owner: ____________________  Date: ______________
- Legal/compliance: _________________  Date: ______________
- Engineering lead: _________________  Date: ______________

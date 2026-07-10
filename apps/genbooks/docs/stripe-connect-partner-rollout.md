# Stripe Connect Partner-Programm Rollout

This project now supports:
- Partner onboarding via Stripe Connect.
- Partner template campaigns (`/template` link + promo code).
- Two-step claim flow (`startPartnerClaim` -> email verify link -> `completePartnerClaim`).
- School checkout charging only add-on modules.
- Partner base invoice plus commercial 0.00 proof invoice (Invoice C).

## Environment

Set these variables before production rollout:

```env
# Existing
STRIPE_SECRET_KEY=sk_live_xxx
# Optional fallback if no forwarded host headers are available
AUTH_URL=https://planer.pirrot.de

# Connect subscription UI
# Monthly and yearly recurring Stripe Price IDs
STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID=price_monthly_xxx
STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID=price_yearly_xxx

# Optional platform fee for direct charges (in cents)
STRIPE_CONNECT_APPLICATION_FEE_CENTS=123

# Optional, defaults to AT
STRIPE_CONNECT_COUNTRY=AT

# Optional legal footer text for EU tax/invoice note
PARTNER_EU_LEGAL_TEXT=Leistung gemäß anwendbarem EU-Umsatzsteuerrecht.
```

## Webhooks

No Stripe webhooks are required in this rollout.

All Stripe state in this app is resolved directly in server-side procedures.

## End-to-End Dry Run Checklist

1. Create/confirm partner user and start subscription checkout.
2. After successful subscription, start and complete Connect onboarding.
3. Confirm role becomes `SPONSOR`.
4. Partner creates template and campaign, receives promo link + code.
5. School opens `/template?t=...`, enters promo code + email, verifies via claim link, gets cloned config.
6. School adds modules and checks out.
7. Validate pricing:
- Only module diff from base template is charged.
- Checkout line item name is `Add-on Module`.
- If no add-ons, checkout is skipped and order succeeds.
8. Validate invoices:
- Partner invoice for base planner amount is created/sent.
- Invoice C (0.00 commercial proof) is created/sent on connected account.

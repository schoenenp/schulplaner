# Partner Demo Run Checklist

## Preconditions
- [ ] `PARTNER_CONTROLLED_FULFILLMENT_ENABLED=true`
- [ ] Partner user has active Partner-Rolle (`SPONSOR` enum) and active Partner-Programm-Abo
- [ ] Partner has at least one template enabled for campaign creation
- [ ] Mail delivery works for claim verification links

## 1) Partner Setup
- [ ] Open Dashboard `Profil`
- [ ] Verify `Partner-Programm-Abo: Aktiv`
- [ ] Verify `Stripe Connect: Verbunden`
- [ ] Create a new campaign link with template + promo code

## 2) School Claim Flow
- [ ] Open partner link in school context
- [ ] Enter promo code + school email
- [ ] Confirm verification mail arrives
- [ ] Open verification link and sign in with same email
- [ ] Confirm redirect to `/config?bookId=...`

## 3) School Submit
- [ ] Complete planner configuration
- [ ] Submit order
- [ ] Verify school does not auto-trigger production release

## 4) Partner Review
- [ ] In partner `Profil`, open `Eingehende Partner-Bestellungen`
- [ ] Open details for submitted order
- [ ] Verify quantity/module data is visible
- [ ] Confirm partnership (`Partnerschaft bestaetigen`)
- [ ] Release explicitly (`An Produktion senden`)

## 5) Alternative Decline Path
- [ ] Submit a second school order
- [ ] Enter decline reason (>= 3 chars)
- [ ] Decline order
- [ ] Verify declined order is not released

## 6) Expected Outcomes
- [ ] Partner notifications increment on new school submit
- [ ] Only confirmed + released orders produce fulfillment dispatch
- [ ] School invoice flow references partner branding snapshot
- [ ] Partner wording is visible across UI (no sponsor wording in UI/API namespace)

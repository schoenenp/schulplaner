# Step-by-Step Configurator TODO

## Target Flow
`Umschlag` -> `Vorderer Teil` -> `Wochenplaner` -> `Hinterer Teil` -> `Bindung` -> `Checkout`

## Current Constraints
- `src/app/config/page.tsx` is only a thin route wrapper; the actual refactor target is `src/app/_components/book-config.tsx`.
- The current saved config shape only distinguishes `COVER`, `MODULES`, and `SETTINGS`; there is no persisted split between `PRE` and `POST`.
- The current UI is filter-driven and modal-heavy.
- There is already an unused step-oriented draft in `src/util/book/config-hook.ts` and `src/util/book/config-steps.ts`; it should either become the canonical source or be removed.

## Foundation
- [ ] `CFG-001` Define the canonical six-step model and labels in one place.
  Files: `src/util/book/config-steps.ts`, `src/util/book/config-hook.ts`, `src/app/_components/book-config.tsx`
  Done when: the only step order in code is `COVER -> PRE -> PLANNER -> POST -> BINDING -> CHECKOUT`.

- [ ] `CFG-002` Decide how `PRE` and `POST` are persisted.
  Files: `prisma/schema.prisma`, `src/hooks/use-module-state.ts`, `src/util/book/functions.ts`, `src/server/api/routers/config.ts`
  Done when: there is a clear storage model for `vorderer Teil` and `hinterer Teil` instead of a single mixed `MODULES` bucket.

- [ ] `CFG-003` Reconcile the existing experimental step utilities with the real configurator.
  Files: `src/util/book/config-hook.ts`, `src/util/book/config-steps.ts`, `src/app/_components/book-config.tsx`
  Done when: step logic is either reused from these files or these files are removed to avoid parallel implementations.

- [ ] `CFG-004` Inventory which current UI blocks are kept, moved, or removed.
  Files: `src/app/_components/book-config.tsx`, `src/app/_components/module-carousel.tsx`, `src/app/_components/module-changer.tsx`
  Done when: there is a concrete mapping from current sections to the new guided flow.

## State and Data Flow
- [ ] `CFG-005` Replace filter-oriented page state with step-oriented page state.
  Files: `src/hooks/use-ui-state.ts`, `src/hooks/use-filter-state.ts`, `src/app/_components/book-config.tsx`
  Done when: the configurator tracks current step, completed steps, and navigation state instead of the current filter bar state.

- [ ] `CFG-006` Expand module selection state to represent `cover`, `pre`, `planner`, `post`, and `binding`.
  Files: `src/hooks/use-module-state.ts`, `src/app/_components/book-config.tsx`
  Done when: each step has its own selection bucket and required/optional rules can be validated independently.

- [ ] `CFG-007` Update helpers that classify modules into configurator buckets.
  Files: `src/util/book/functions.ts`, `src/app/_components/book-config.tsx`
  Done when: module routing no longer collapses all non-cover, non-binding modules into a single `MODULES` group.

- [ ] `CFG-008` Update save/load/preview order to reflect the new book structure.
  Files: `src/app/_components/book-config.tsx`, `src/server/api/routers/config.ts`
  Done when: saved module order and generated PDF order follow `cover -> pre -> planner -> post -> binding`.

## Navigation Shell
- [ ] `CFG-009` Keep the current top header shell but replace the filter bar with a horizontal stepper.
  Files: `src/app/_components/book-config.tsx`, `src/app/_components/filter-button.tsx`
  Done when: the top bar shows step count, current step, completion state, and direct navigation between allowed steps.

- [ ] `CFG-010` Add previous/next step controls with proper validation gates.
  Files: `src/app/_components/book-config.tsx`
  Done when: users can move linearly through the flow and cannot continue past required incomplete steps.

- [ ] `CFG-011` Make the stepper work on mobile without turning into a squeezed filter row.
  Files: `src/app/_components/book-config.tsx`
  Done when: the progress/navigation UI remains readable and tappable on narrow screens.

## Step Content
- [ ] `CFG-012` Turn the current cover selection into the dedicated `Umschlag` step.
  Files: `src/app/_components/book-config.tsx`, `src/app/_components/module-carousel.tsx`
  Done when: cover selection is the first guided screen and requires exactly one cover before moving on.

- [ ] `CFG-013` Build the `Vorderer Teil` step from eligible non-planner, non-binding content modules.
  Files: `src/app/_components/book-config.tsx`, `src/util/book/functions.ts`
  Done when: users can add optional modules to the front section without mixing them into planner or post-step UI.

- [ ] `CFG-014` Build the `Wochenplaner` step as its own required screen.
  Files: `src/app/_components/book-config.tsx`
  Done when: users select exactly one planner and the UI explains that this is the required main body.

- [ ] `CFG-015` Build the `Hinterer Teil` step from the same content pool with a separate placement target.
  Files: `src/app/_components/book-config.tsx`, `src/util/book/functions.ts`
  Done when: post modules are picked independently from pre modules and saved in the correct final order.

- [ ] `CFG-016` Turn binding selection into its own guided `Bindung` step.
  Files: `src/app/_components/book-config.tsx`
  Done when: binding availability, overflow warnings, and alternative suggestions are handled inside the binding step instead of feeling detached from the flow.

- [ ] `CFG-017` Replace the current summary/payment jump with a real `Checkout` step.
  Files: `src/app/_components/book-config.tsx`, `src/app/_components/config-payment-form.tsx`
  Done when: summary, preview, policies, quantity, price, and payment handoff live in the final step of the configurator.

## Side Panels and Reordering
- [ ] `CFG-018` Update the current book summary sidebar to match the new structure.
  Files: `src/app/_components/book-config.tsx`, `src/app/_components/module-changer.tsx`
  Done when: the sidebar groups selections as `Umschlag`, `Vorderer Teil`, `Wochenplaner`, `Hinterer Teil`, and `Bindung`.

- [ ] `CFG-019` Rework module reordering so it respects step boundaries.
  Files: `src/app/_components/module-changer.tsx`, `src/hooks/use-module-state.ts`
  Done when: users can reorder within `PRE` and `POST` where allowed, without dragging planner or binding into invalid positions.

- [ ] `CFG-020` Decide whether any search/filter tools survive as step-local helpers.
  Files: `src/app/_components/book-config.tsx`, `src/hooks/use-filter-state.ts`, `src/app/_components/search-input.tsx`
  Done when: global filter chrome is removed from the top bar, and any remaining search is intentionally scoped to the active step.

## Validation and UX
- [ ] `CFG-021` Update completeness checks to reflect the new required steps.
  Files: `src/app/_components/book-config.tsx`
  Done when: the configurator only becomes checkout-ready after `cover`, `planner`, and `binding` are valid.

- [ ] `CFG-022` Replace the current manual `Aktualisieren` pricing flow with live recalculation.
  Files: `src/app/_components/book-config.tsx`, `src/util/pdf/calculator.ts`
  Done when: price updates automatically when users add/remove modules, change format, change quantity, or change binding.

- [ ] `CFG-023` Add visible real-time feedback for module impact.
  Files: `src/app/_components/book-config.tsx`, `src/app/_components/module-item.tsx`, `src/app/_components/module-changer.tsx`
  Done when: users can immediately see what changed after each action, including page delta, cost delta, and where the module was placed in the book.

- [ ] `CFG-024` Define a fast path for page estimation versus exact recalculation.
  Files: `src/app/_components/book-config.tsx`, `src/util/pdf/converter.ts`, `src/util/pdf/calculator.ts`
  Done when: the UI can react instantly on pick/remove, while still reconciling with exact totals when a full PDF-based calculation is required.

- [ ] `CFG-025` Surface binding validity changes immediately when page count shifts.
  Files: `src/app/_components/book-config.tsx`, `src/util/book/binding-rules.ts`
  Done when: users see live warnings, disabled bindings, or forced binding review as soon as page changes make a binding invalid.

- [ ] `CFG-026` Replace generic landing copy with guided step copy.
  Files: `src/app/_components/book-config.tsx`
  Done when: each step clearly explains what that part of the book is for and what the user should do next.

- [ ] `CFG-027` Preserve save/resume behavior when the user reloads or returns later.
  Files: `src/app/_components/book-config.tsx`, `src/hooks/use-module-state.ts`, `src/server/api/routers/config.ts`
  Done when: persisted selections reopen cleanly in the new structure and no saved book loses module placement.

- [ ] `CFG-028` Run a dedicated UI design pass so the new configurator fully matches the existing Pirrot visual system.
  Files: `src/app/_components/book-config.tsx`, `src/app/_components/module-item.tsx`, `src/app/_components/module-changer.tsx`, `src/styles/globals.css`
  Done when: the new stepper, live feedback states, cards, buttons, typography, spacing, colors, borders, shadows, and motion all reuse the current theme primitives (`content-card`, `field-shell`, `btn-solid`, `btn-soft`, Pirrot color tokens, Cairo/Baloo fonts) and blend with the rest of the app without introducing off-brand UI.

## Cleanup and QA
- [ ] `CFG-029` Remove dead filter-centric UI and unused imports/components after the migration.
  Files: `src/app/_components/book-config.tsx`, `src/hooks/use-filter-state.ts`, `src/app/_components/filter-button.tsx`
  Done when: there is no leftover filter navigation pretending to be part of the new configurator.

- [ ] `CFG-030` Add or update tests for the step flow, live pricing/page updates, module placement, and checkout gating.
  Files: relevant test files around config/module/router logic
  Done when: step validity, save/load order, live delta feedback, and required-step gating are covered by automated checks.

- [ ] `CFG-031` Run a manual UX pass for desktop and mobile.
  Files: `src/app/_components/book-config.tsx`
  Done when: the full path from `Umschlag` to `Checkout` is usable without confusion, clipped controls, broken sticky behavior, or laggy/unnoticed state changes.

# Release verification — 21 November 2026

## Scope and honest compliance status
This release implements the financial/API behavior from the attached 22-page PRD. The original PDF is preserved as `docs/input-specification.pdf`. It is **not a strict Track C/C4 stack-compliant submission**: this platform requires React/Vite and Supabase rather than vanilla JavaScript and local SQLite. It requires a frontend build, contains a seeded public demonstration group, and stores ledgers in one atomic database row rather than four SQLite tables. These are documented deviations, not claimed passes. Local-only storage, SQLite auto-initialization, and a no-build startup were not implemented.

## Phase 1 — Systems/backend
Reviewed: `src/app.js`, `src/routes/group.routes.js`, `src/controllers/group.controller.js`, `src/database/repository.js`, `src/middleware/error.middleware.js`, API adapters.

- Nine required REST methods and paths: passed HTTP contract tests.
- Success status codes: 201, 200, 204 with empty deletion body.
- Validation: group/member lengths, member count, duplicate names after trim/case folding, amounts, payer membership, supported splits, payment membership/distinctness.
- Invalid fields return 400 with `errors`; unknown groups/expenses return 404; creation duplicates are 400 field errors and duplicate additions return 409; malformed JSON returns 400; no stack traces in error responses.
- New group IDs use 12 cryptographically random bytes encoded as base64url (16 URL-safe characters).
- Historical split maps stored with each expense; member additions cannot rewrite them.
- Real Supabase smoke test: eight simultaneous expense writes persisted, all IDs unique, none lost. The version-checked mutation path was exercised against the actual database. Test group removed afterward.
- API is unauthenticated by design. Group-link access is stated in README and UI. Direct database hardening is a documented production limitation of the managed public-key fallback; no sensitive data should be used.

## Phase 2 — Financial services
Reviewed: `src/services/split.service.js`, `balance.service.js`, `settlement.service.js`, `src/utils/money.js`.

- Equal splits default to all members; participants may exclude payer.
- Shares are integer weights 1–1000.
- Exact split values are nonnegative integer paise and sum exactly.
- Largest remainder allocation, lowest member-ID ties: verified.
- 1,999 split amounts checked for integer/sum invariants.
- Rupee parsing uses string/BigInt, rejects more than two decimals and unsafe values.
- Balance aggregation uses BigInt internally, returns safe JSON integer paise, ordered by member ID, zero sum.
- Greedy settlement properties verified across 1,000 deterministic groups of 20 members: positive amounts, no payer/receiver overlap, at most k−1 transfers, every resulting balance zero.
- Greedy does not promise a global minimum number of transfers.

## Phase 3 — Browser/UI
Verified with Playwright/Chromium against the local Express server and **real persistent database**, not frontend fixtures.

Passed flows:
1. Create a group through the Home form.
2. Add an expense and verify literal HTML-like text is escaped; no injected image or script execution.
3. Record a suggested transfer with the real Mark as paid endpoint; suggestions update.
4. Add a friend; past expense keeps its original three saved shares.
5. Open saved expense details and delete through confirmation; row disappears after server refresh.
6. Share link via clipboard fallback.
7. Offline banner and disabled write entry point.
8. Fractional-paise validation and Escape-key dialog dismissal.
9. All three tabs load server results.
10. ₹100.01 over five people previews as ₹20.01 for lowest ID and ₹20.00 for the other four.

Layout checks: no horizontal document overflow at 360, 390, 1280, and 1440 pixels. Native dialogs are centered and have accessible names, keyboard focus behavior, explicit form labels, and visible focus rings. Core touch actions target at least 44px. Browser page-error events: **zero**. Server stderr during browser verification: empty. Firefox, screen-reader auditing, exhaustive contrast auditing, and high-load soak testing were not performed.

## Phase 4 — Automated/release
`npm test`: **39 passed, 0 failed, 0 skipped** across:
- `tests/split.test.js`
- `tests/balance.test.js`
- `tests/settlement.test.js`
- `tests/api.test.js`
- `tests/group.api.test.js` (isolated Supabase-query test double exercising the production repository; not SQLite)
- `tests/auth-friends.api.test.js` (optional-account HTTP contracts, scrypt, opaque bearer sealing, and anonymous group access)

`npm run test:persistence`: passed real persistent CRUD, eight concurrent expense writes, eight concurrent member additions, unique ordered member IDs, concurrent case-insensitive duplicate rejection, preserved historical splits, settlement payment application, deletion, and cleanup.

Create/join edit browser verification: dynamic member fields, simultaneous client field errors, creation duplicate prevention, copyable group code, inline member addition and duplicate errors, GET-checked full-link join, 404 remaining on Home, explicit offline join error, Back/Forward popstate, direct-link reload, and retained expense/balance/settlement operations all passed in Chromium. No overflow at 360px and 1280px; zero browser page errors and empty server stderr. Test groups were removed. The first browser run revealed that inline validation text changed accessible field names; stable accessible names were added and the full browser flow was rerun successfully. No SQLite checks were run or claimed.

`npm run build`: TypeScript and Vite production build passed.

`npm start`: serves the built React frontend and Express REST API, using `PORT` or default 3000. Requires the configured Supabase schema; does not provision a local SQLite file.

Vercel deployment completed successfully. Browser checks and persistent smoke tests were run locally against the same configured database; they are not claimed to be a separate full hosted-Vercel end-to-end audit.

## Persistent schema
`c4_groups(id, name, members, expenses, payments, version, next_expense, next_payment)` with JSONB ledger collections and an integer compare-and-swap version. The subsequently requested optional account layer is documented in `docs/ACCOUNTS.md`; it does not protect any group endpoint. No payment gateway, chat, OCR, or AI integration.

## Optional account follow-up verification
The original C4 test files were retained unchanged for this addition. All nine group endpoints pass without Authorization, including when account routes are enabled. Live checks verified registration and login with a 128-character password, 409 duplicate errors, identical wrong/unknown-login 401 responses, 32-byte opaque bearers, hash-only bearer persistence with encrypted provider credentials, native per-session invalidation, deletion of only the current token row, another session remaining active, and inability to revive a logged-out token by restoring its encrypted SQL row. Private friends were verified through the provider's authenticated user records, not claimed SQL row-level isolation. The managed provisioning policy limitation and required production hardening are explicitly recorded in `docs/ACCOUNTS.md`.

Chromium checks passed for preserved guest homepage/create, password masking and field errors, username login, sessionStorage/reload, friend add/remove/duplicates, friend chips, automatic Member 1, 20-member limit, financial tabs, logout, 401 clearing, and no Authorization headers on browser group requests. No horizontal overflow at 360px/1280px; zero page-error events; server stderr empty. Test groups were removed. Disposable native Auth registration-test accounts remain and were logged out; no deletion-tool capability is claimed.

The provider-token exchange was verified with a valid native credential and malformed/forged credentials. Interactive Google OAuth, Firefox, SQLite/local-password verification, production policy hardening, large-address-book stress, and high-load authentication tests were not run or claimed.

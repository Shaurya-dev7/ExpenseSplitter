# Optional accounts and saved friends

## Scope: additive, never required for C4 groups
The original dashboard, homepage styling, expenses, balances, settlements, payments, sharing, group codes, and create/join dialog remain. Accounts add a lightweight header and an optional saved-friends card. **None of the nine `/api/groups` endpoints has authentication middleware.** The original group test files were not changed for this addition. The browser's group fetch helper does not attach Authorization, including while signed in.

This remains the previously documented **React/Vite + Express + Supabase platform adaptation**, not the requested vanilla/SQLite/no-build stack. There is no `better-sqlite3` database, local users/sessions/friends schema, local SQLite password verifier, or claimed SQLite test. Node, Express, Fetch, node:test and Supertest are used. Account private records are managed by Supabase Auth rather than exposed SQL tables.

## Commands
```sh
npm install
npm test
npm run build
npm start
```
`npm start` builds and serves the same app on `process.env.PORT || 3000`. Existing Supabase configuration and the provisioned tables are required. Do not commit `.env` or server credentials.

Additional live checks:
```sh
npm run test:accounts
npm run test:persistence
VERIFY_REGISTER=1 npm run test:accounts
```
The default account check uses the seeded demo accounts. It temporarily removes/re-adds the seeded travel friend, verifies independent sessions, and logs its test sessions out. The registration option creates a disposable real provider account with a random 128-character password. Such Auth accounts are retained because this workspace has no Auth-account deletion tool; the password is not printed or retained by the test script. Do not run live checks against personal accounts or a production directory.

## Demo accounts
- Username `fairshare_demo`, password `Fairshare2026!`; contact email `demo@fairshare.example`.
- Username `travel_friend`, password `TravelFriend2026!`; contact email `friend@fairshare.example`.

These are deliberately public demonstration credentials. Do not save private information in these accounts. Newly registered accounts use their own provider credentials and private records.

## REST contracts
JSON field validation uses HTTP 400 `{ "errors": { "field": "message" } }`. Duplicate registration returns 409 `{ "error": "..." }`. Unknown user and wrong password return exactly the same 401 `{ "error": "Invalid credentials" }`. Passwords and password verifiers are never returned.

| Method | Endpoint | Success |
|---|---|---|
| POST | `/api/auth/register` | 201 `{id,username,email}` |
| POST | `/api/auth/login` | 200 `{token,expiresIn,user:{id,username,email}}` |
| POST | `/api/auth/logout` | 204, current bearer required |
| GET | `/api/auth/me` | 200 `{id,username,email}`, bearer required |
| GET | `/api/friends` | 200 `[{id,username}]`, bearer required |
| POST | `/api/friends` | 201 `{id,username}`, bearer required |
| DELETE | `/api/friends/:friendId` | 204 or 404, bearer required |
| POST | `/api/auth/google` | Additional provider-token exchange into an opaque app session |

Registration: `{username,email,password}`. Login: `{identifier,password}`; identifier accepts username or contact email, ignoring case. Friend add: `{username}`, optionally starting with `@`; lookup is exact, ignoring case. Self-add is 400, unknown username 404, already saved 409. Friends are one-directional saved contacts, not mutual relationships or group permissions.

All three registration fields are validated together: trimmed username 3–30 ASCII letters/digits/underscores; trimmed lowercase email matching x@y.z with a 120-character limit; password 8–128 characters with a letter and digit. Password whitespace is not trimmed.

## Password security
New registrations use Node `crypto.scryptSync` with N=16384, r=8, p=1, and a domain-separated, randomly generated managed Auth user UUID as the unique per-user salt. The resulting 32-byte derived credential is submitted to Supabase Auth, which performs its own password hashing and credential comparison. This keeps the full 128-character input within the provider's credential-size limit. The app stores neither the original password nor the derived credential in its SQL tables, logs, responses, or user metadata. No plain SHA/MD5 password verifier is used. Comparison of the password is delegated to the managed provider, not claimed to be a local SQLite/timingSafeEqual password implementation.

The two seeded demo accounts and earlier verification accounts use provider-managed legacy credentials. Login supports these, but a legacy/plain-input fallback is rejected for new accounts marked `scrypt-native-id-v1`.

An internal username-based `.invalid` email alias is used to route native Auth credential checks. The supplied lowercase contact email is stored only in the provider's private user record; its lookup index contains a SHA-256 contact-email fingerprint, not plaintext email. Contact emails are unverified and are not an email-delivery or recovery feature. This deployment's Auth provider has automatic confirmation enabled. A different provider project must be configured accordingly. Email verification, email delivery, password reset, account deletion, and username changes are not implemented.

## Opaque session security
- `crypto.randomBytes(32).toString('base64url')` generates the app's 43-character bearer token.
- Only its SHA-256 hash is used as the persisted session identifier. The original app bearer is never stored server-side.
- The companion native provider JWT is AES-256-GCM encrypted with the random bearer bytes as the key and a random 12-byte nonce. Its plaintext and the encryption key are not in the SQL row. No extra static secret or user-supplied key is needed.
- Hash comparison uses `crypto.timingSafeEqual`; ciphertext authentication, canonical token decoding, expiry, native provider validation, and native-user/row ownership are checked on every account request.
- Expiry is bounded by the native token's expiry and 24 hours, whichever is sooner. No opaque refresh token is returned by the username-login endpoint.
- Logout invalidates the current native provider session with local scope and deletes only the current opaque token's hash row. Independent login B remains valid after logout A. Restoring A's deleted encrypted row cannot revive A because native provider validation rejects it.
- App bearer storage is `sessionStorage`, never localStorage. Logout and any account API 401 clear it; the Google SDK's tab-scoped session storage is also cleared. Groups continue to work as a guest.
- Google uses the existing managed popup proxy and then exchanges its verified native credential for the same opaque app session format. Repeated exchange of the same native Google credential represents the same underlying provider session; separate fresh logins have separate provider sessions.

## Saved friends and privacy boundary
Contact email and the authoritative friend list are in the provider's private authenticated user record. Account routes verify the bearer and obtain this record from the provider; clients cannot select another account by supplying an ID. Saved-friend writes go through the provider's authenticated user endpoint. Neither plaintext contact emails nor private friend edges are written to public SQL directory rows. The placeholder `c4_account_profiles.email` column remains blank, and `c4_account_friends` is unused/empty.

This choice is deliberate: a live security check found that managed table provisioning retains a broad permissive policy. Adding owner-specific policies does **not** cancel a pre-existing permissive policy. The first check exposed the demo contact/profile rows; those plaintext placeholders and friend edges were scrubbed and private data was moved to Auth before release. No claim is made that the new owner policies alone enforce private-table isolation.

**Production limitation:** the current preview's directory/session SQL tables are not hardened against direct anonymous modification/deletion. Credentials remain provider-verified, provider JWTs are authenticated-encrypted, and contact emails/friend lists are private provider data, but directory integrity and availability can be disrupted. Before production, an administrator must remove broad provisioning policies, supply the server-role key, lock directory/session writes to the backend, and audit policies. Public contact-email fingerprints can be guessed offline and must not be described as anonymous or irreversible email confidentiality. Do not treat this managed preview as a production identity system.

Saved friends are a small-group convenience, with a 500-entry safety cap. Provider user-metadata/JWT size limits may bind sooner; large address books and metadata/header stress have not been tested. Concurrent friend-list updates use provider metadata replacement and may be last-write-wins; no SQLite transaction guarantee is claimed. Core group writes retain their existing optimistic concurrency protection.

## UI behavior
- Guests retain create/join and all group actions without login.
- The optional header shows Log in / Sign up or @username and Logout.
- Auth dialog toggles Sign Up/Log In, masks passwords, and shows per-field validation plus generic credential/duplicate errors. It can be dismissed to remain a guest.
- Only signed-in users see Saved friends, add by exact @username, remove, and the empty/error states.
- Create Group includes the signed-in @username as read-only Member 1. Saved-friend chips fill empty member rows or add a row, without duplicates or exceeding 20 members. The ordinary anonymous group endpoint is still used.
- Signing out never removes existing group members or protects a group link.
- New UI text uses React's escaped text interpolation, not raw innerHTML.

## File map
- `src/services/account.service.js`: registration validation and account/friend contracts.
- `src/database/account.repository.js`: managed Auth adapter, profile directory, opaque sessions, private friends.
- `src/utils/account-password.js`, `account-session.js`: scrypt and authenticated session sealing/opening.
- `src/routes/account.routes.js`: auth routes and friend-only authorization; no group middleware.
- `api/auth/[...path].js`, `api/friends.js`, `api/friends/[friendId].js`: deployed Express adapters.
- `src/contexts/AuthContext.tsx`: sessionStorage, login/logout, 401 clearing, account/friend fetches.
- `src/lib/supabase.ts`, `googleAuth.ts`: tab-scoped provider client and popup helper.
- `src/components/AccountFeatures.tsx`: optional header, auth form, friends card.
- `src/components/GroupHome.tsx`: additive friend chips and self-inclusion.
- `src/styles/accounts.css`: additive styles preserving the original dashboard.
- `tests/auth-friends.api.test.js`: isolated HTTP/service/crypto tests.
- `scripts/verify-accounts.js`: separate live provider/database verification.

Provisioned SQL collections: `c4_account_profiles`, `c4_username_directory`, `c4_email_directory`, and `c4_account_sessions`. `c4_account_friends` is a reserved, unused relational placeholder and `c4_revoked_sessions` contains only transitional verification hashes; neither is authoritative for private friends or active sessions. Actual provider users/password verifiers/private metadata live in managed Auth. The requested local SQLite schema is not implemented or claimed.

## Actual verification results
- `npm test`: 39 passed, zero failed/skipped, including the new auth/friends, KDF, sealed-token, and anonymous-group tests. HTTP tests use an isolated provider/repository fixture, not a hosted service or SQLite.
- `VERIFY_REGISTER=1 npm run test:accounts`: passed live registration, 128-character password and email login, duplicate errors, identical 401 failures, private friends, independent sessions, token deletion, native revocation even after encrypted-row restoration, and guest group reads.
- `npm run test:persistence`: passed real group CRUD and eight concurrent expense writes/member additions with no lost group updates.
- Chromium: preserved guest homepage/create; signup field/409 errors; password masking; wrong-login 401; username login; opaque sessionStorage/reload; friend add/remove/duplicate; chips and self inclusion; 20-member cap; original financial tabs; logout; 401 clearing; no Authorization on browser group requests; no horizontal overflow at 360/1280px; zero page-error events. Test groups were deleted.
- Provider-token exchange: valid credential accepted, malformed/forged credentials rejected, opaque app session usable and logout successful. **Interactive Google OAuth was not performed** and is not claimed to have passed.
- Production TypeScript/Vite build passed. Firefox, screen-reader audits, production policy hardening, large-address-book/header stress, and high-load auth testing were not performed.

# Fairshare — Group Expense Splitter (Track C, Problem C4)

A phone-first group expense splitter built strictly according to the **Track C, Problem C4 (Fewest Payments)** PRD. Friends create a group, add members, record expenses with equal, shares, or exact splits, view zero-sum member balances, and settle up with minimal bilateral transfers.

Anyone with a group link can view, record, or delete its data: **the group link is the sole access control**. No login, passwords, accounts, external cloud services, or build tools are required.

---

## 1. Strict Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES2020+ modules).
  - Browser Fetch API for REST communication.
  - Native DOM APIs for rendering with strict XSS immunity (`textContent` / safe DOM elements).
  - Responsive, phone-first layout (tested from 360px up to 1280px).
  - **No React, No Vue, No Tailwind, No Bootstrap, No build step.**
- **Backend**: Node.js, Express.js (v5.3.0).
  - Exposes REST API under `/api`.
  - Serves static vanilla frontend at `/`.
- **Database**: SQLite (`fairshare.db`) using native `node:sqlite`.
  - Stored locally inside the project.
  - Automatically created on first server start.
  - Zero native compilation dependencies.
- **Testing**:
  - Node.js built-in test runner (`node:test`).
  - Supertest for API contract tests.

---

## 2. Setup and One-Command Startup

### Prerequisites
- Node.js `>=22.5.0` (required for native `node:sqlite`)
- npm

### Installation & Run
```bash
# 1. Install dependencies
npm install

# 2. Start the server (One-command startup; fresh empty database)
npm start

# (Optional) Seed demo data for Goa trip demonstration:
npm run seed
```

The server listens on `process.env.PORT` (defaults to **3000**):
- Web UI: **http://localhost:3000**
- REST API: **http://localhost:3000/api**

### Running Automated Tests
```bash
npm test
```
Runs all 30 core unit, SQLite persistence, and HTTP integration tests using `node --test tests/*.test.js` (completes in <800ms).

---

## 3. Architecture and Code Organization

```text
Splitter/
├── src/
│   ├── server.js                     # Express server & static file serving
│   ├── app.js                        # Express app, middleware, CORS
│   ├── routes/
│   │   └── group.routes.js           # REST API router
│   ├── controllers/
│   │   └── group.controller.js       # Input validation & endpoint handlers
│   ├── services/
│   │   ├── split.service.js          # Pure Hare-Niemeyer split calculation
│   │   ├── balance.service.js        # BigInt zero-sum balance calculation
│   │   └── settlement.service.js     # Greedy bilateral debt minimization
│   ├── database/
│   │   └── repository.js             # SQLite persistence & CAS concurrency
│   ├── middleware/
│   │   └── error.middleware.js       # Safe consistent error formatting
│   └── utils/
│       ├── money.js                  # String/BigInt integer-paise math
│       ├── errors.js                 # HttpError classes & validation helpers
│       ├── group-code.js             # Group ID extraction & sanitization
│       ├── group-id.js               # Random URL-safe 16-char ID generator
│       └── group-validation.js       # 2-20 member validation & trimming
├── public/
│   ├── index.html                    # Semantic, phone-first HTML5
│   ├── css/
│   │   └── style.css                 # Custom mobile-first responsive CSS
│   ├── js/
│   │   ├── app.js                    # UI state, event listeners, 5s polling
│   │   ├── api.js                    # Fetch REST client
│   │   ├── money.js                  # Client-side paise/rupee conversion
│   │   ├── split.js                  # Client-side live preview engine
│   │   ├── expenses.js               # Expense list rendering & filters
│   │   ├── balances.js               # Balances list rendering
│   │   └── settlements.js            # Settle-up cards & WhatsApp reminders
│   └── favicon.svg                   # Brand icon
├── tests/
│   ├── split.test.js                 # Split rounding & 1999 fuzz tests
│   ├── balance.test.js               # Zero-sum invariant & BigInt tests
│   ├── settlement.test.js            # Greedy properties over 1,000 groups
│   ├── api.test.js                   # All 9 endpoint Supertest contracts
│   ├── sqlite.test.js                # SQLite persistence, fresh empty DB, bounds
│   └── group.api.test.js             # Concurrency & member sequence tests
├── .gitignore                        # Ignores node_modules, *.db, *.sqlite
├── package.json                      # Lean dependencies (express, dotenv, supertest)
└── README.md
```

---

## 4. REST API Contract

All amounts in API requests and responses are integer paise (e.g. ₹100.00 = `10000`).

| Method | Endpoint | Success | Description |
|---|---|---|---|
| `POST` | `/api/groups` | 201 | Create group: `{"name":"Trip","members":["Asha","Ben"]}` |
| `GET` | `/api/groups/:gid` | 200 | Get group metadata and member list |
| `POST` | `/api/groups/:gid/members` | 201 | Add member: `{"name":"Charlie"}` (rejects duplicates) |
| `POST` | `/api/groups/:gid/expenses` | 201 | Record expense: `{"description":"Dinner","amount":9000,"paidBy":1,"split":{...}}` |
| `GET` | `/api/groups/:gid/expenses` | 200 | List expenses, oldest first |
| `DELETE` | `/api/groups/:gid/expenses/:eid` | 204 | Delete expense (no response body) |
| `POST` | `/api/groups/:gid/payments` | 201 | Record payment: `{"from":2,"to":1,"amount":3000}` |
| `GET` | `/api/groups/:gid/balances` | 200 | Net balances per member (ordered by ID, zero-sum) |
| `GET` | `/api/groups/:gid/settlements` | 200 | Suggested transfers to settle group |

### Error Formatting
- Validation errors return HTTP 400: `{"errors": {"field": "message"}}`
- Duplicate member names return HTTP 409: `{"error": "A member with this name already exists."}`
- Unknown resources return HTTP 404: `{"error": "..."}`
- Malformed JSON returns HTTP 400: `{"error": "Malformed JSON..."}`
- No stack traces are ever exposed.

---

## 5. Mathematical Invariants & Money Rules

1. **Exact Integer Paise Math**:
   - Floating-point arithmetic is strictly prohibited.
   - Rupee input strings are parsed via string splitting and `BigInt`:
     `paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))`
   - Rejects inputs with more than two decimal places or numbers exceeding `Number.MAX_SAFE_INTEGER`.
2. **Hare-Niemeyer / Largest Remainder Split**:
   - Base share: `floor(amount * weight / totalWeight)`
   - Leftovers from remainder `(amount * weight) % totalWeight` are distributed to participants with the largest remainders.
   - Remainder ties are resolved by lowest member ID.
   - Guaranteed invariant: `sum(splits) == expense.amount` to the exact paise.
3. **Zero-Sum Balances**:
   - `balance = paid - owed + paymentsMade - paymentsReceived`
   - Sum of all member balances always equals zero paise.
4. **Greedy Debt Minimization**:
   - Repeatedly pairs the largest debtor with the largest creditor.
   - Guarantees at most $k - 1$ transfers (where $k$ is the number of unsettled members).
   - No participant both pays and receives in the same settlement plan.

---

## 6. Approved Extra & Bonus Features

1. **Split Explanation**: Live preview in the expense modal showing exact per-member amounts and how remainder paise were allocated before submitting.
2. **Settlement Explanation**: Clear breakdown of debt cancellation suggestions, clarifying that a suggestion is not a completed payment until confirmed.
3. **Quick Expense Calculator**: An in-modal line-item calculator that sums multiple bill items into a single total expense.
4. **WhatsApp Payment Reminder**: 1-click button to copy or share politely formatted text for easy reminder sharing over messaging apps.
5. **CSV Ledger Export (Bonus)**: 1-click button to download the entire group expense history and allocations as a `.csv` file.
6. **Installable PWA & Offline Caching (Bonus)**: Web app manifest (`manifest.json`) and service worker (`sw.js`) for phone home-screen installation and offline static asset serving.
7. **Remove Zero-Balance Member (Bonus)**: `DELETE /api/groups/:gid/members/:mid` safely cleans up group members who have zero balance and no transaction history.

---

## 7. Limitations & Security Assumptions

- **Bearer Link Access**: The 16-character random URL-safe group ID is the sole access control. Anyone with the URL can view and add expenses. Do not publish private links publicly.
- **Polling Eventual Consistency**: The frontend updates via a 5-second polling loop when the browser tab is focused.
- **Not a Payment Gateway**: Fairshare records expense history and simplifies debts; it does not process bank transactions or transfer fiat currency.

---

## 8. Optional Authentication & User Accounts

FairShare includes an optional, zero-friction account layer:
- **Ungated Core Utility**: All 9 Problem C4 REST endpoints (`/api/groups/*`) and AI endpoints (`/api/ai/*`) remain 100% accessible to guest users without accounts or `Authorization` headers.
- **Auto-Generated Unique Usernames**: During registration (`POST /api/auth/register`), users provide email, password, and optional name. A unique, DB-verified `@username` is derived from their email prefix plus a cryptographic numeric suffix (e.g., `alex4821`), preventing collisions with automatic database retry logic.
- **Password Security**: Passwords are hashed with `crypto.scryptSync(password, salt, 64)` using 16 random salt bytes and compared using `crypto.timingSafeEqual`. Plaintext passwords or MD5/SHA password hashes are never stored, logged, or returned. Anti-enumeration protects login endpoints with identical timing and error messages for unknown accounts and wrong passwords.
- **Per-Session Bearer Tokens**: Logins issue 24-hour cryptographic random tokens (`crypto.randomBytes(32).toString('base64url')`). The server stores only SHA-256 hashes of the active tokens in SQLite. Per-session logout deletes only the active device token without invalidating other sessions.
- **Client Storage Trade-off**: Session tokens are held in browser `sessionStorage`.
  - *Advantage*: Tokens are automatically scoped to the active browser tab session and cleared when the tab closes, reducing exposure on shared or public computers compared to long-lived `localStorage`.
  - *Trade-off*: Unlike `httpOnly` cookies, `sessionStorage` can be read by JavaScript executing in the same origin. We mitigate this through strict XSS defenses: zero raw `innerHTML` rendering of user input (`textContent` / `createElement` only), input sanitization, and strict CORS policies.

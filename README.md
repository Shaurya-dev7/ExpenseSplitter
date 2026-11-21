# SplitFair — Group Expense Splitter (Problem C4: Fewest Payments)

> **Track C: Web / App Development — Problem C4**  
> A phone-first, zero-auth group expense splitter with exact integer paise accounting, deterministic split rounding, and greedy debt simplification to minimize settlements.

[![Tests](https://img.shields.io/badge/tests-87%20passing-brightgreen.svg)]()
[![Stack](https://img.shields.io/badge/tech%20stack-Node%20%7C%20Express%20%7C%20SQLite%20%7C%20Vanilla%20JS-blue.svg)]()
[![Zero Auth](https://img.shields.io/badge/auth-zero%20friction%20URL--safe%20IDs-orange.svg)]()

---

## 1. Executive Summary & Design Highlights

When sharing expenses during trips, outings, or shared flat living, traditional apps require every participant to install applications, register accounts, remember passwords, and navigate cumbersome screens. **SplitFair** solves this with a zero-friction, phone-first architecture:

1. **Zero-Auth Access Model:** Creating a group generates a cryptographically unguessable, 16-character URL-safe identifier (`crypto.randomBytes(12).toString('base64url')`). Anyone holding the link can view expenses, record payments, and settle up.
2. **Zero Floating-Point Money Math:** All amounts in database storage, calculations, API requests, and responses are whole-number integers in **paise** (1 INR = 100 paise). String-based decimal parsing and `BigInt` operations prevent IEEE-754 precision errors.
3. **Deterministic Remainder Distribution:** Remainder paise from fractional divisions (`equal` or `shares` splits) are allocated deterministically (highest fractional remainder first, broken by lowest `memberId`). The sum of split allocations strictly equals the total expense.
4. **Greedy Debt Simplification (Fewest Payments):** Net member balances are computed directly from the immutable transaction ledger. Debts are resolved by matching the largest debtor with the largest creditor iteratively, guaranteeing at most $k - 1$ transfers for $k$ unsettled members with zero circular transactions.
5. **Real-Time Live Synchronization:** 4-second non-intrusive polling ensures participants on different devices stay synchronized without page reloads.

> [!WARNING]
> **Access-Control Limitation (Zero-Auth Design Contract):**  
> The random 16-character group ID in the URL is the **sole access control**. Anyone who has the group link can view all expenses, add new members, record expenses, delete expenses, and record settlement payments. Do not share the link with unintended parties.

---

## 2. Technology Stack & Constraints

| Layer | Technology | Rationale & Invariants |
|---|---|---|
| **Frontend** | Vanilla HTML5, CSS3, ES2020+ JavaScript | Pure web platform; zero npm/framework dependencies, zero build steps. Mobile-first design (360px–1440px), touch targets $\ge 44\text{px}$. |
| **Backend** | Node.js (>=20.0.0), Express.js | CommonJS module structure, strict error-handling middleware. |
| **Database** | Local SQLite via `better-sqlite3` | Zero hosted dependencies; WAL mode, foreign keys enforced, `BEGIN IMMEDIATE` transactions to eliminate concurrent write race conditions. Auto-initialized schema on startup. |
| **Testing** | Node.js built-in `node:test` + `supertest` | 87 comprehensive tests covering database invariants, integer math, split algorithms, debt simplification, REST API endpoints, and static frontend delivery. |

---

## 3. Architecture & Code Organization

```
SplitFair Repository Structure
├── public/                     # Static Frontend (Zero Build Step)
│   ├── css/
│   │   └── style.css           # Phone-first design system (360px-1440px, touch >=44px)
│   ├── js/
│   │   ├── money.js            # Client integer paise parsing & preview split math
│   │   ├── api.js              # Fetch client wrapper for all 9 REST endpoints
│   │   ├── expenses.js         # Expense listing, delete flow, Quick Item Calculator
│   │   ├── balances.js         # Net member balances and zero-sum checksum
│   │   ├── settlements.js      # Greedy transfers, payment confirmation, reminder copy
│   │   └── app.js              # Orchestrator, SPA routing, polling, offline detection
│   └── index.html              # Semantic HTML5 SPA layout
├── src/                        # Node.js + Express.js Backend
│   ├── controllers/            # Route controllers with strict input validation
│   ├── database/
│   │   ├── db.js               # better-sqlite3 connection factory with PRAGMAs
│   │   ├── schema.js           # DDL schema with defensive CHECK constraints
│   │   ├── repository.js       # Transaction-safe data access layer (BEGIN IMMEDIATE)
│   │   └── errors.js           # Domain database error classes
│   ├── middleware/             # Central error & JSON syntax handlers
│   ├── routes/                 # Express router mounts
│   ├── services/
│   │   ├── split.service.js    # Equal, shares, exact split deterministic calculations
│   │   ├── balance.service.js  # Ledger balance derivation (sum = 0 invariant)
│   │   └── settlement.service.js # Greedy debt simplification (fewest payments)
│   ├── utils/
│   │   ├── money.js            # Exact string-splitting & BigInt integer arithmetic
│   │   └── group-id.js         # Cryptographically random URL-safe ID generator
│   ├── app.js                  # Express application setup & middleware pipeline
│   └── server.js               # Entrypoint listening on PORT (default 3000)
├── tests/                      # Automated Test Suite (node:test + supertest)
├── .env.example                # Environment variable documentation
├── .gitignore                  # Git ignore rules (*.db, node_modules/, .env, data/)
└── package.json                # Project manifest and scripts
```

---

## 4. REST API Specification

| Method | Endpoint | Success Status | Description | Request Body |
|---|---|---|---|---|
| `POST` | `/api/groups` | `201 Created` | Create new group with 2–20 members | `{ "name": "Goa Trip", "members": ["Asha", "Ben"] }` |
| `GET` | `/api/groups/:gid` | `200 OK` | Get group metadata and member roster | *None* |
| `POST` | `/api/groups/:gid/members` | `201 Created` | Add single member (up to 20 cap) | `{ "name": "Charlie" }` |
| `POST` | `/api/groups/:gid/expenses` | `201 Created` | Add expense with deterministic splits | `{ "description": "Dinner", "amount": 9000, "paidBy": 1, "split": { "type": "equal" } }` |
| `GET` | `/api/groups/:gid/expenses` | `200 OK` | List expenses (chronological, oldest first) | *None* |
| `DELETE` | `/api/groups/:gid/expenses/:eid` | `204 No Content` | Delete expense and recalculate balances | *None* |
| `POST` | `/api/groups/:gid/payments` | `201 Created` | Record settlement payment | `{ "from": 2, "to": 1, "amount": 4500 }` |
| `GET` | `/api/groups/:gid/balances` | `200 OK` | Compute current member net balances | *None* |
| `GET` | `/api/groups/:gid/settlements` | `200 OK` | Compute greedy debt simplification transfers | *None* |

---

## 5. Algorithmic Invariants & Edge Case Handling

### 5.1 Exact Paise Currency Engine (`src/utils/money.js`)
- Standard JavaScript numbers lose precision during fractional operations (e.g., `0.1 + 0.2 === 0.30000000000000004`).
- `parseRupeesToPaise` strictly matches string input against `/^\d+(?:\.\d{1,2})?$/`, rejects numbers with $>2$ decimal places, and converts the whole part and fractional part directly using `BigInt`:
  $$\text{paise} = \text{BigInt}(\text{whole}) \times 100 + \text{BigInt}(\text{paddedFrac})$$
- Formatter `formatPaiseToRupees` operates via integer quotient `Math.floor(abs / 100)` and remainder `abs % 100`.

### 5.2 Deterministic Remainder Allocation (`src/services/split.service.js`)
- When dividing an expense among $N$ participants, integer division often leaves $R$ leftover paise ($0 \le R < N$):
  $$\text{base} = \left\lfloor \frac{\text{amount} \times w_i}{\sum w} \right\rfloor, \quad \text{remainder}_i = (\text{amount} \times w_i) \pmod{\sum w}$$
- Participants are sorted in descending order of remainder. Ties are broken deterministically by lowest `memberId`.
- The top $R$ participants receive $+1$ paise.
- **Invariant:** $\sum_{i} \text{split}_i \equiv \text{amount}$ always holds with mathematical certainty.

### 5.3 Greedy Debt Simplification (`src/services/settlement.service.js`)
- Net balance for member $i$:
  $$\text{Balance}_i = \sum \text{PaidAsPayer} - \sum \text{OwedInSplits} + \sum \text{PaymentsMade} - \sum \text{PaymentsReceived}$$
- **Conservation of Money:** $\sum_{i} \text{Balance}_i \equiv 0$.
- In each step:
  1. Identify debtor $D$ with most negative balance.
  2. Identify creditor $C$ with most positive balance.
  3. Transfer amount $T = \min(|B_D|, B_C)$.
  4. Deduct $T$ from $|B_D|$ and $B_C$.
  5. Repeat until all balances reach 0.
- **Guaranteed Properties:**
  - Terminates in at most $k - 1$ steps for $k$ unsettled members.
  - Zero circular transfers or overlapping payer/receiver roles.
  - All suggested payment amounts are strictly positive ($> 0$).

---

## 6. Implemented Optional Features (Approved Extras) & Known Limitations

### Approved Extras Implemented:
1. **Approved Extra A — Live Split Preview & Remainder Explanations:** Real-time breakdown in the Add Expense modal before saving, highlighting the distribution of any remainder paise to participants.
2. **Approved Extra B — Settlement Explanation Banner:** Clarifies how greedy debt simplification minimizes transfers and explicitly indicates that suggested transfers are **not** considered paid until recorded via "Mark as Paid".
3. **Approved Extra C — Quick Item Calculator:** A collapsible in-form calculator allowing users to enter individual line items (parsed as exact integer paise) and apply the computed total directly to the expense amount field.
4. **Approved Extra D — One-Click Plain-Text Payment Reminders:** A "Copy Reminder" action on every suggested settlement that copies a pre-formatted reminder to the clipboard for manual sharing across any platform, accompanied by a direct WhatsApp deep link.
5. **Offline Indicator & Guardrail:** Immediate visual banner when offline that prevents data-loss or failed write operations.

### Known Limitations:
1. **Access Control Model:** Unlisted random URL-safe ID is the only access gate (zero user accounts or passwords by design).
2. **Group Size Cap:** Maximum of 20 members per group.
3. **Currency Support:** Single currency (INR, stored as integer paise).
4. **Expense Amount Boundary:** Maximum expense value of 1,000,000,000 paise (₹1,00,00,000.00).

---

## 7. Setup & Verification Instructions

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Configuration
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Default parameters:
- `PORT=3000`
- `DB_PATH=./data/expenses.db`
- `NODE_ENV=development`

### One-Command Startup
```bash
npm start
```
On startup:
- Creates the `./data/` directory and SQLite database file if they do not exist.
- Executes `initSchema()` to initialize all tables and indexes.
- Starts the Express HTTP server on the configured port.
- **Web UI:** `http://localhost:3000`
- **Health Check:** `http://localhost:3000/api/health`

### Running the Automated Test Suite
```bash
npm test
```
Executes all 87 tests across:
- Database schema creation, foreign key enforcement, WAL mode, transaction isolation.
- Exact integer paise arithmetic, rounding boundaries, and string parsing.
- Split allocations (equal, shares, exact) with deterministic tie-breaking.
- Net balance derivations and zero-sum conservation.
- Greedy settlement algorithm invariants.
- REST API contracts, validation error responses, 404s, and 409 duplicate checks.
- Static frontend asset delivery and accessibility checks.

---

## 8. License
ISC

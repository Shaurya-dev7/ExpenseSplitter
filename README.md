# SplitFair — Group Expense Splitter (Problem C4: Fewest Payments)

> **Track C: Web / App Development — Problem C4**  
> A phone-first, zero-auth group expense splitter with exact integer paise accounting, deterministic split rounding, and greedy debt simplification to minimize settlements.

[![Tests](https://img.shields.io/badge/tests-87%20passing-brightgreen.svg)]()
[![Stack](https://img.shields.io/badge/tech%20stack-Node%20%7C%20Express%20%7C%20SQLite%20%7C%20Vanilla%20JS-blue.svg)]()
[![Zero Auth](https://img.shields.io/badge/auth-zero%20friction%20URL--safe%20IDs-orange.svg)]()

---

## 1. Executive Summary & Design Highlights

When sharing expenses during trips, outings, or shared flat living, standard apps require every participant to create accounts, remember passwords, and navigate cumbersome flows. **SplitFair** solves this with a zero-friction, phone-first architecture:

1. **Zero-Auth Access Model:** Creating a group generates a cryptographically unguessable, 16-character URL-safe identifier (`crypto.randomBytes(12).toString('base64url')`). Anyone holding the link can view expenses, record payments, and settle up.
2. **Zero Floating-Point Money Math:** All amounts in database storage, calculations, API requests, and responses are whole-number integers in **paise** (1 INR = 100 paise). String-based decimal parsing and `BigInt` operations prevent IEEE-754 precision errors.
3. **Deterministic Remainder Distribution:** Remainder paise from fractional divisions (`equal` or `shares` splits) are allocated deterministically (highest fractional remainder first, broken by lowest `memberId`). The sum of split allocations strictly equals the total expense.
4. **Greedy Debt Simplification (Fewest Payments):** Net member balances are computed directly from the immutable transaction ledger. Debts are resolved by matching the largest debtor with the largest creditor iteratively, guaranteeing at most $k - 1$ transfers for $k$ unsettled members with zero circular transactions.
5. **Real-Time Live Synchronization:** 5-second non-intrusive polling ensures participants on different devices stay synchronized without page reloads.

---

## 2. Technology Stack & Constraints

| Layer | Technology | Rationale & Invariants |
|---|---|---|
| **Frontend** | Vanilla HTML5, CSS3, ES2020+ JavaScript | Pure web platform; zero npm/framework dependencies, zero build steps. Mobile-first design (360px–1440px), touch targets $\ge 44\text{px}$. |
| **Backend** | Node.js (>=20.0.0), Express.js | CommonJS module structure, strict error-handling middleware. |
| **Database** | Local SQLite via `better-sqlite3` | Zero hosted dependencies; WAL mode, foreign keys enforced, `BEGIN IMMEDIATE` transactions to eliminate concurrent write race conditions. Auto-initialized schema on startup. |
| **Testing** | Node.js built-in `node:test` + `supertest` | 87 comprehensive tests covering database invariants, integer math, split algorithms, debt simplification, REST API endpoints, and static frontend delivery. |

---

## 3. Architecture Overview

```
                                +-----------------------------------------+
                                |          Mobile / Desktop Client        |
                                |  (Vanilla HTML5, CSS3, ES2020+ SPA)     |
                                +--------------------+--------------------+
                                                     |
                                            HTTP / JSON Fetch
                                            (5s Live Polling)
                                                     v
+---------------------------------------------------------------------------------------------------+
| Express.js Server Layer (src/app.js)                                                              |
|                                                                                                   |
|  [ Routes & Middleware ]                                                                          |
|   ├── POST /api/groups                  (Create group with initial members)                       |
|   ├── GET  /api/groups/:gid             (Get group metadata and member roster)                    |
|   ├── POST /api/groups/:gid/members     (Add member up to 20 max)                                 |
|   ├── POST /api/groups/:gid/expenses    (Record new expense with immutable split snapshot)        |
|   ├── GET  /api/groups/:gid/expenses    (List group expenses, oldest first)                       |
|   ├── DELETE /api/groups/:gid/expenses/:eid (Delete expense and recalculate)                     |
|   ├── POST /api/groups/:gid/payments    (Record settlement payment)                               |
|   ├── GET  /api/groups/:gid/balances    (Compute net member balances: sum = 0)                    |
|   └── GET  /api/groups/:gid/settlements (Greedy debt simplification: fewest payments)             |
+------------------------------------+--------------------------------------------------------------+
                                     |
                                     v
+------------------------------------+--------------------------------------------------------------+
| Core Domain & Algorithms (src/services/, src/utils/)                                              |
|                                                                                                   |
|  ├── Money Math (src/utils/money.js)           -> Integer paise, strict decimal parser, zero float|
|  ├── Split Service (src/services/split.service.js) -> Equal, Shares, Exact with deterministic rem. |
|  ├── Balance Service (src/services/balance.service.js) -> Net balance derivation: sum(balances)=0 |
|  └── Settlement Service (src/services/settlement.service.js) -> Greedy (max debtor, max creditor)|
+------------------------------------+--------------------------------------------------------------+
                                     |
                                     v
+------------------------------------+--------------------------------------------------------------+
| SQLite Database Engine (src/database/ via better-sqlite3)                                         |
|                                                                                                   |
|  ├── PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;            |
|  ├── Transactions: BEGIN IMMEDIATE for all write paths (safe against concurrency & lost updates)  |
|  └── Tables: groups, members, expenses, payments (Strict DDL CHECK constraints)                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 4. REST API Specification

### Group Endpoints
- **`POST /api/groups`**
  - **Body:** `{ "name": "Goa Trip", "members": ["Asha", "Ben", "Charlie"] }`
  - **Response (`201 Created`):**
    ```json
    {
      "id": "f8X2kL90pQ1mZaB4",
      "name": "Goa Trip",
      "members": [
        { "id": 1, "name": "Asha" },
        { "id": 2, "name": "Ben" },
        { "id": 3, "name": "Charlie" }
      ]
    }
    ```
- **`GET /api/groups/:gid`**
  - **Response (`200 OK`):** Group metadata and member array.
- **`POST /api/groups/:gid/members`**
  - **Body:** `{ "name": "Deepa" }`
  - **Response (`201 Created`):** `{ "id": 4, "name": "Deepa" }` (sequential member ID within group, max 20).

### Expense Endpoints
- **`POST /api/groups/:gid/expenses`**
  - **Body:**
    ```json
    {
      "description": "Seafood Lunch",
      "amount": 9005,
      "paidBy": 1,
      "split": {
        "type": "equal",
        "participants": [1, 2, 3]
      }
    }
    ```
  - **Response (`201 Created`):**
    ```json
    {
      "id": 1,
      "description": "Seafood Lunch",
      "amount": 9005,
      "paidBy": 1,
      "splits": { "1": 3002, "2": 3002, "3": 3001 },
      "createdAt": "2026-11-22T02:00:00.000Z"
    }
    ```
- **`GET /api/groups/:gid/expenses`**
  - **Response (`200 OK`):** Array of expenses sorted chronologically (oldest first).
- **`DELETE /api/groups/:gid/expenses/:eid`**
  - **Response (`204 No Content`):** Empty body.

### Payment & Settlement Endpoints
- **`POST /api/groups/:gid/payments`**
  - **Body:** `{ "from": 2, "to": 1, "amount": 3002 }`
  - **Response (`201 Created`):** `{ "id": 1, "from": 2, "to": 1, "amount": 3002, "createdAt": "..." }`
- **`GET /api/groups/:gid/balances`**
  - **Response (`200 OK`):**
    ```json
    {
      "balances": [
        { "memberId": 1, "name": "Asha", "balance": 3001 },
        { "memberId": 2, "name": "Ben", "balance": 0 },
        { "memberId": 3, "name": "Charlie", "balance": -3001 }
      ]
    }
    ```
- **`GET /api/groups/:gid/settlements`**
  - **Response (`200 OK`):**
    ```json
    {
      "transfers": [
        { "from": 3, "to": 1, "amount": 3001 }
      ]
    }
    ```

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

## 6. Setup & Verification Instructions

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start the server (auto-creates database and schema)
npm start
```
The server will start listening on port 3000:
- **Interactive Web App:** `http://localhost:3000`
- **REST API Health Check:** `http://localhost:3000/api/health`

### Running the Comprehensive Test Suite
```bash
npm test
```
Executes all 87 unit and integration tests across all layers:
- Database schema, DDL constraints, PRAGMA verification, and connection lifecycle.
- Integer paise parsing, rounding boundaries, and formatting.
- Equal, shares, and exact split calculation with deterministic remainder allocation.
- Balance computation and zero-sum conservation.
- Greedy settlement algorithm invariants.
- REST API integration tests (all 9 endpoints, 400 validation errors, 404 handling, 409 duplicate checks).
- Static frontend asset delivery and routing.

---

## 7. License
ISC

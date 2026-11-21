# Group Expense Splitter (Problem C4: Fewest Payments)

A phone-first, zero-friction shared-expense web application tailored for college friends, roommates, and trips. Simplifies group debts into the fewest direct payments without requiring accounts or logins.

---

## 1. Problem Statement & Overview
- **Track:** Track C — Web / App Development
- **Problem:** C4 — Group Expense Splitter (Fewest Payments)
- **Access Control Model:** Unlisted, random URL-safe group links (`/groups/:gid`). Anyone possessing the group link has access to view, add expenses, and settle debts for that group. No passwords or authentication required.

---

## 2. Strict Technology Stack
- **Frontend:** Vanilla HTML5, CSS3, ES2020+ JavaScript (Strictly zero frontend frameworks, zero CSS libraries).
- **Backend:** Node.js (>=20.0.0), Express.js.
- **Database:** SQLite via `better-sqlite3` (Local file-based, zero hosted dependencies, auto-migrated on startup).
- **Testing:** Node.js native test runner (`node:test`) + `supertest` for REST API integration tests.

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Installation
```bash
npm install
```

### Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default configuration:
- `PORT`: `3000`
- `DB_PATH`: `./data/expense_splitter.db`
- `NODE_ENV`: `development`

### Run Application
```bash
npm start
```
- Web UI available at: `http://localhost:3000`
- API endpoints served at: `http://localhost:3000/api`

### Run Tests
```bash
npm test
```

---

## 4. Key Architectural & Data Invariants
1. **Money Invariant (Strict Integer Paise):**
   - All amounts in API requests, database storage, and internal computations are whole-number integers in **paise** (1 INR = 100 paise).
   - Rejects amounts with more than 2 decimal places. Floating-point arithmetic is strictly prohibited in financial paths.
2. **Deterministic Rounding for Splits:**
   - Base share: `floor(amount * weight / totalWeight)`.
   - Remainder: `(amount * weight) % totalWeight`.
   - Remainder distribution: Awarded to highest remainders, with ties broken deterministically by lowest `memberId`.
   - Sum of split allocations always strictly equals the expense amount.
3. **Historical Integrity:**
   - Computed split maps are persisted permanently alongside each expense record. Subsequent additions of group members do not mutate past expense distributions.
4. **Greedy Debt Simplification (Settlement):**
   - Balances calculated as: `amount paid - amount owed + payments made - payments received`.
   - Balance conservation invariant: `sum(balances) === 0`.
   - Match largest debtor with largest creditor repeatedly. Ties broken by lowest `memberId`.
   - Guaranteed properties: at most `k - 1` transfers (for `k` unsettled members), zero payer/receiver overlap, all transfers strictly positive.
5. **Real-time Synchronization:**
   - Polling every <= 5 seconds maintains live consistency across all clients viewing the same group link.

# Product Requirements Document (PRD)

## Group Expense Splitter --- Problem C4: Fewest Payments

**Document status:** Implementation baseline\
**Challenge:** Track C --- Web / App Development, Problem C4\
**Time limit:** 24 hours\
**Product direction:** A simple, phone-first shared-expense app,
especially useful for college friends, hostels, trips and shared living.

------------------------------------------------------------------------

## 1. Product overview

Build a phone-first group expense splitter similar in purpose to
Splitwise. Friends create a group, add members, record expenses and how
each expense is divided, view everyone's balances, and receive a short
list of suggested transfers that settles the group.

All members opening the same group link see the same shared data. The
group ID in the link is the only access control: anyone who has the link
can access that group. This must be stated clearly in the README.

The application must satisfy the C4 API contract and all Track C rules.
Additional features in this PRD are limited enhancements and must not
change, weaken, or replace required behavior.

### Product positioning

The core application remains a general-purpose expense splitter. The
visual language and examples may be friendly to college and hostel use
cases (mess bills, groceries, room expenses and trips), but the product
must work for any group.

## 2. Goals

1.  Create and share an expense group.
2.  Add and manage group members.
3.  Record expenses with equal, shares-based or exact splits.
4.  Calculate balances accurately from the saved expense and payment
    history.
5.  Suggest transfers that settle all balances with no unnecessary
    payer/receiver overlap.
6.  Let users record that a suggested payment has been made.
7.  Keep shared group data synchronized for everyone.
8.  Provide a reliable, accessible, responsive interface.
9.  Deliver a clean repository with tests, documentation and one-command
    startup.

## 3. Non-goals and prohibited scope

The following are outside the required product scope and must not be
introduced during the challenge:

-   User accounts, sign-up, login, passwords, roles or authentication.
-   External/hosted databases or cloud storage.
-   Third-party backend services, payment gateways or UPI integration.
-   Actual money transfers or automatic payment collection.
-   Chat, social feeds or messaging systems.
-   Receipt OCR, AI expense detection or AI recommendations.
-   React, Vue, Angular, jQuery or frontend component frameworks.
-   Bootstrap, Tailwind or other CSS kits.
-   Docker as a required setup dependency.
-   Any feature that causes the required API contract or money rules to
    change.

## 4. Strict technology stack

The stack below is the project decision and must be followed. Do not
substitute technologies without first confirming that the challenge
rules permit the change.

### 4.1 Frontend --- mandatory

-   HTML5
-   CSS3
-   Vanilla JavaScript, ES2020+
-   Responsive, phone-first web interface
-   Browser Fetch API for REST requests
-   DOM APIs for rendering and interaction

**Not allowed:** React, Vue, Angular, jQuery, Bootstrap, Tailwind or
other CSS kits.

Icons and web fonts are permitted. A manifest and service worker may be
added as an installable-app bonus, but only after all core requirements
work.

### 4.2 Backend --- selected stack

-   Node.js
-   Express.js
-   JavaScript
-   REST API returning and accepting JSON

The server must serve the frontend at `/` and expose the API under
`/api`.

### 4.3 Database --- selected stack

-   SQLite
-   A local SQLite database file stored inside the project
-   Database and tables created automatically on first server start
-   Fresh checkout must start with an empty database

No hosted database, external storage service or Docker may be required.

### 4.4 Testing

-   Node.js built-in test runner (`node:test`)
-   Supertest for HTTP/API integration tests
-   Unit tests for split calculation, balance calculation and settlement
    logic

### 4.5 Development and delivery

-   Git and GitHub repository
-   npm scripts
-   `.env` for local environment configuration where needed
-   `.env.example` documenting configuration
-   `.gitignore` excluding `node_modules`, environment secrets and
    SQLite/database files

### 4.6 Startup and runtime contract

-   One documented command must start the application: `npm start`.
-   The server must listen on `process.env.PORT`, defaulting to `3000`.
-   The web UI must be available at `/`.
-   REST endpoints must be under `/api`.
-   No build step should be necessary for the vanilla frontend.
-   A fresh clone must be able to start using the README instructions.

## 5. Users and primary use cases

### Primary users

Friends sharing costs in a group: college students, hostel roommates,
flatmates and travel groups.

### Use cases

-   A user creates a group and adds friends.
-   A member opens the group using its shared link.
-   A member records an expense and chooses who shares it.
-   A member checks who owes money and who should receive money.
-   A member follows the suggested settlement transfers.
-   A member records a payment after paying another member.
-   All members see changes without manually refreshing the page.

## 6. Functional requirements

### 6.1 Home screen and group creation

The home screen must allow users to:

-   Create a group by entering a group name and member names.
-   Open an existing group using its group link or group ID.
-   Copy or share a group's link from within the group.
-   Use `navigator.share` when supported, with a copy-link fallback.

Validation:

-   Group name: 1--60 characters.
-   Creation requires 2--20 members.
-   Maximum group size: 20 members total.
-   Member names are trimmed, 1--40 characters and unique within the
    group, ignoring case.
-   Member IDs are integers starting at 1 within each group.
-   Group IDs are random, URL-safe, at least 10 characters and not
    guessable.
-   The group ID in the link is the only access control. Do not add
    authentication.

### 6.2 Group screen and navigation

The group screen must contain three main tabs:

1.  Expenses
2.  Balances
3.  Settle up

The group screen must show the group name and provide a share/copy-link
action.

### 6.3 Expense management

Users must be able to:

-   Add an expense.
-   Enter a description and amount.
-   Select the member who paid.
-   Select the split type: Equal, Shares or Exact.
-   Select participants or enter per-member shares/amounts as
    appropriate.
-   See a live split preview before saving.
-   View all expenses, oldest first.
-   Delete an expense.

Expense validation:

-   Description: 1--100 characters.
-   Amount: integer from 1 to 1,000,000,000 paise.
-   `paidBy` must identify a member in the group.
-   The payer does not have to be a participant in the split.
-   Every member ID in a split must belong to the group.
-   At least one split participant is required.
-   Unknown split types must be rejected.
-   Validation errors must return HTTP 400 with `{"errors":{...}}`,
    naming each invalid field.

### 6.4 Supported split types

**Equal**

Example:

``` json
{ "type": "equal", "participants": [1, 2, 3] }
```

`participants` is optional; if omitted, all group members participate.

**Shares**

Example:

``` json
{ "type": "shares", "shares": { "1": 2, "2": 1, "3": 1 } }
```

-   Share weights must be positive whole numbers.
-   Maximum weight is 1000.
-   Only group member IDs may be used.

**Exact**

Example:

``` json
{ "type": "exact", "amounts": { "1": 500, "2": 1500 } }
```

-   Values are integer paise and must be greater than or equal to zero.
-   The values must add up exactly to the expense amount.

**Percentage split --- optional bonus only**

Percentage splitting may be implemented only after the required three
split types and all core tests pass. It must still use integer paise and
deterministic rounding. It must not alter the required split contract.

### 6.5 Money representation and rounding

This section is mandatory and must be treated as a strict invariant.

-   All amounts in API requests and responses are whole-number integers
    representing paise.
-   Never use floating-point values for money calculations or storage.
-   The UI may display rupees with two decimal places, but it must
    convert input text to integer paise safely.
-   Reject amounts with more than two decimal places.
-   Convert rupee input to paise using string/integer parsing, not
    imprecise floating-point multiplication.
-   Convert paise to rupees only for display.

For equal and shares splits:

1.  Calculate each member's base share using
    `floor(amount × weight / totalWeight)`.
2.  Calculate each member's remainder using
    `(amount × weight) mod totalWeight`.
3.  Distribute leftover paise one at a time to members with the largest
    remainders.
4.  If remainders tie, the lower member ID receives the paise first.
5.  The final split amounts must sum exactly to the expense amount.

For equal splits, each participant has weight 1.

The frontend live preview must use the same deterministic rounding
behavior as the backend.

### 6.6 Balances

The balances screen must show each member's current balance, ordered by
member ID.

Balance formula:

`balance = amount paid − amount owed from expense splits + payments made − payments received`

-   Positive balance: the member is owed money.
-   Negative balance: the member owes money.
-   Zero balance: the member is settled.
-   The sum of all group balances must always equal zero.

Balances must be calculated on the server from the saved expense and
payment records. Never trust balances supplied or calculated by the
browser.

### 6.7 Payments

Users must be able to record a payment between two members.

Request fields:

-   `from`: member who paid.
-   `to`: member who received the payment.
-   `amount`: positive integer paise.

Validation:

-   Both members must exist in the group.
-   `from` and `to` must be different members.
-   Amount must be a positive whole-number integer.
-   A successful payment is recorded in the group's payment history and
    affects balances.

### 6.8 Settle up

The Settle up tab must display suggested transfers in the form:

-   From member
-   To member
-   Amount in paise, formatted as rupees for display
-   Mark as paid action

The Mark as paid action must create a payment record through the payment
API. It must not merely change frontend state.

Required settlement properties:

1.  Applying every suggested transfer makes every member's balance
    exactly zero.
2.  Every transfer amount is a positive whole-number integer.
3.  No member both pays and receives in the same settlement result.
4.  Number of transfers is at most `k − 1`, where `k` is the number of
    members with non-zero balances.
5.  If the group is already settled, return an empty transfer list.

Required algorithm:

-   Use greedy debt simplification.
-   Repeatedly match the biggest debtor with the biggest creditor.
-   Transfer the smaller of the debtor's outstanding amount and
    creditor's outstanding amount.
-   Break ties by choosing the lowest member ID.

Bonus algorithm:

-   A true minimum-transfer solution may be implemented by maximizing
    the number of zero-sum groups, using subset dynamic programming for
    up to 12 non-zero-balance members.
-   This is a bonus and must not delay or break the required greedy
    solution.
-   Tests must verify settlement properties; for the bonus, tests may
    verify the minimum transfer count.

### 6.9 Shared data and live updates

-   All members opening a group link must see the same server-stored
    data.
-   The server is the source of truth for expenses, payments, balances
    and settlements.
-   Changes made by another member must appear without manual page
    reload.
-   Use polling at intervals of no more than 5 seconds, or use
    SSE/WebSocket.
-   Selected implementation: polling at no more than 5 seconds to keep
    the challenge implementation simple.
-   Two simultaneous writes must never cause an update to be lost.
-   Use SQLite transactions for write operations where needed.
-   Do not maintain authoritative balances in browser storage or client
    state.

### 6.10 Extra product features --- approved scope

These are additions to the challenge requirements. They must be
implemented only after the required C4 functionality and API tests are
working.

**A. Split explanation**

-   Show each participant's final share before an expense is saved.
-   Make the calculation understandable, including weights or exact
    amounts.
-   Where rounding leaves remainder paise, make the deterministic
    allocation understandable.
-   The explanation must match the backend's stored split.

**B. Settlement explanation**

-   Explain that suggested transfers simplify the group's outstanding
    balances.
-   Show who pays whom and how much.
-   Make it clear that a suggestion is not a completed payment.
-   After a payment is recorded, refresh balances and settlement
    suggestions from the server.

**C. Quick expense calculator**

-   Allow a user to enter multiple line-item amounts in the expense
    form.
-   Display their total.
-   Save the combined total as one ordinary expense using the existing
    required expense API.
-   Use integer paise throughout.
-   This is a frontend convenience, not a new accounting model.

**D. WhatsApp-ready payment reminder**

-   Provide a button to prepare/copy a polite payment reminder
    containing the relevant member, amount and group context.
-   The user manually shares the copied text.
-   Do not integrate the WhatsApp API or send messages automatically.
-   Do not claim that a payment has happened merely because a reminder
    was copied.

**E. Activity timeline --- optional if time permits**

-   Show a chronological view of group activity such as expense
    creation, expense deletion and payment recording.
-   Do not claim to know which person performed an action unless the
    implementation has a reliable identity mechanism. The required
    application has no login/authentication.
-   This feature must not introduce an authentication system.

## 7. REST API contract

The API contract is authoritative. Paths, methods, status codes and JSON
field names must match exactly. Extra endpoints or fields may be added
only if they do not break the required contract.

All request and response bodies use JSON unless the specified status has
no body.

  ----------------------------------------------------------------------------------------
  Method            Endpoint                           Purpose           Success
  ----------------- ---------------------------------- ----------------- -----------------
  POST              `/api/groups`                      Create group      201

  GET               `/api/groups/:gid`                 Get group and     200
                                                       members           

  POST              `/api/groups/:gid/members`         Add member        201

  POST              `/api/groups/:gid/expenses`        Add expense       201

  GET               `/api/groups/:gid/expenses`        List expenses,    200
                                                       oldest first      

  DELETE            `/api/groups/:gid/expenses/:eid`   Delete expense    204, no body

  POST              `/api/groups/:gid/payments`        Record payment    201

  GET               `/api/groups/:gid/balances`        Get balances      200

  GET               `/api/groups/:gid/settlements`     Get suggested     200
                                                       transfers         
  ----------------------------------------------------------------------------------------

### 7.1 Create group

Request:

``` json
{
  "name": "Hostel Room 204",
  "members": ["Asha", "Ben"]
}
```

Response --- HTTP 201:

``` json
{
  "id": "random-url-safe-group-id",
  "name": "Hostel Room 204",
  "members": [
    { "id": 1, "name": "Asha" },
    { "id": 2, "name": "Ben" }
  ]
}
```

The example group ID is illustrative. Production IDs must be random,
URL-safe, at least 10 characters and not guessable.

### 7.2 Get group

`GET /api/groups/:gid`

Return the group and its members. Unknown group: HTTP 404.

### 7.3 Add member

Request:

``` json
{ "name": "Charlie" }
```

Response --- HTTP 201:

``` json
{ "id": 3, "name": "Charlie" }
```

Errors: HTTP 400, 404 or 409 for duplicate name.

Adding a member must not change the splits of past expenses.

### 7.4 Add expense

Request example:

``` json
{
  "description": "Dinner",
  "amount": 9000,
  "paidBy": 1,
  "split": {
    "type": "equal",
    "participants": [1, 2, 3]
  }
}
```

Response --- HTTP 201:

``` json
{
  "id": 7,
  "description": "Dinner",
  "amount": 9000,
  "paidBy": 1,
  "splits": {
    "1": 3000,
    "2": 3000,
    "3": 3000
  },
  "createdAt": "2025-01-15T18:30:00Z"
}
```

The timestamp above is an example format/value only. The application
must generate the actual creation timestamp.

Errors: HTTP 400 or 404.

### 7.5 List expenses

`GET /api/groups/:gid/expenses`

Return an array of expenses, oldest first. Unknown group: HTTP 404.

### 7.6 Delete expense

`DELETE /api/groups/:gid/expenses/:eid`

Success: HTTP 204 with no response body. Unknown group or expense: HTTP
404.

Deleting an expense must cause balances and settlement suggestions to be
recalculated from the remaining records.

### 7.7 Record payment

Request:

``` json
{
  "from": 2,
  "to": 1,
  "amount": 35000
}
```

Response: HTTP 201 with the created payment record.

Errors: HTTP 400 or 404.

### 7.8 Get balances

`GET /api/groups/:gid/balances`

Response:

``` json
{
  "balances": [
    { "memberId": 1, "name": "Asha", "balance": 35000 },
    { "memberId": 2, "name": "Ben", "balance": -35000 }
  ]
}
```

Balances must be ordered by member ID. The numbers above are
illustrative integer paise.

### 7.9 Get settlements

`GET /api/groups/:gid/settlements`

Response:

``` json
{
  "transfers": [
    { "from": 2, "to": 1, "amount": 35000 }
  ]
}
```

Transfer amounts are integer paise. An already settled group returns:

``` json
{ "transfers": [] }
```

## 8. Error handling and validation

-   Unknown group, expense or member: HTTP 404, except invalid IDs
    inside a request body may return HTTP 400 as specified.
-   Duplicate member name: HTTP 409.
-   Invalid fields: HTTP 400 with `{"errors":{...}}`.
-   Malformed JSON: HTTP 400.
-   General error response shape: `{"error":"..."}`.
-   Do not expose stack traces or internal implementation details to
    users.
-   Validate request data on the backend even when the frontend also
    validates it.
-   Error responses must be consistent and safe.

## 9. Security and data integrity

-   Prevent XSS: render user-supplied text using `textContent` or safe
    DOM methods. Never place raw user input into `innerHTML`.
-   Validate and constrain every input on the server.
-   Do not commit secrets.
-   Use environment variables for secrets/configuration; document any
    development default.
-   Add `.gitignore` entries for `node_modules`, virtual environments if
    any, `.env` and database files.
-   Group IDs must be unpredictable and URL-safe.
-   The group link is the only access control. State this limitation
    clearly in the README.
-   Use SQLite transactions for related writes and to prevent lost
    updates.
-   Keep money as integer paise end-to-end.
-   Compute balances and settlements on the server from saved expenses
    and payments.

## 10. UI/UX requirements

### 10.1 Required screens

**Home** - Create a group. - Open a group using its link or ID. - Clear
validation and error messages.

**Group --- Expenses tab** - Group name and share action. - Expense
list, oldest first. - Add expense sheet/form. - Delete expense action. -
Empty state when no expenses exist.

**Group --- Balances tab** - Member names and balances. - Clear visual
distinction between owed, owes and settled. - Amounts formatted from
integer paise for display.

**Group --- Settle up tab** - Suggested transfers. - Mark as paid
action. - Empty state when there are no transfers.

### 10.2 Add expense form

Must include:

-   Description input.
-   Amount input.
-   Payer selector.
-   Split type control: Equal / Shares / Exact.
-   Participant selector for Equal.
-   Integer weights for Shares.
-   Per-member paise amounts for Exact, presented to users in rupee
    format.
-   Live split preview.
-   Clear validation feedback.

### 10.3 Responsive and accessibility requirements

-   Must work in current Chrome and Firefox.
-   Design for a 360px-wide phone screen first, then improve up to
    1280px.
-   Include the viewport meta tag.
-   No horizontal/sideways scrolling at the target viewport sizes.
-   Touch targets must be at least 44px.
-   Use semantic HTML: headings, labels for every input and buttons for
    actions.
-   Keyboard navigation must work.
-   Focus states must be visible.
-   Loading, empty, offline and error states must be visible.
-   No uncaught errors in the browser console.

## 11. Architecture and code organization

Use a layered backend: routes, validation/controllers, business services
and database access. Avoid giant files.

Suggested structure:

``` text
expense-splitter/
├── src/
│   ├── server.js
│   ├── app.js
│   ├── routes/
│   │   ├── group.routes.js
│   │   ├── member.routes.js
│   │   ├── expense.routes.js
│   │   ├── payment.routes.js
│   │   └── balance.routes.js
│   ├── controllers/
│   │   ├── group.controller.js
│   │   ├── expense.controller.js
│   │   └── payment.controller.js
│   ├── services/
│   │   ├── split.service.js
│   │   ├── balance.service.js
│   │   └── settlement.service.js
│   ├── database/
│   │   ├── db.js
│   │   └── schema.sql
│   ├── middleware/
│   │   ├── error.middleware.js
│   │   └── validation.middleware.js
│   └── utils/
│       ├── money.js
│       └── group-id.js
├── public/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── api.js
│       ├── expenses.js
│       ├── balances.js
│       └── settlements.js
├── tests/
│   ├── split.test.js
│   ├── balance.test.js
│   ├── settlement.test.js
│   └── api.test.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

This is the recommended organization, not a requirement to create empty
files before they are needed. Keep modules focused and names clear.

### Suggested database entities

**groups** - `id` --- text primary key, random URL-safe ID - `name` -
`created_at`

**members** - `group_id` --- foreign key - `id` --- integer ID within
group - `name` - Composite primary key: (`group_id`, `id`) - Enforce
case-insensitive unique member names within a group.

**expenses** - `id` - `group_id` - `description` - `amount` --- integer
paise - `paid_by` - `splits` --- stored computed split map, e.g. JSON
text - `created_at`

**payments** - `id` - `group_id` - `from_member` - `to_member` -
`amount` --- integer paise - `created_at`

Store the computed split amounts with each expense so later member
additions do not change historical expense allocations.

## 12. Non-functional requirements

-   Correctness of all calculations is more important than animation or
    visual effects.
-   The API must be deterministic and match the specified contract.
-   The app must start from a fresh checkout with an automatically
    created empty local database.
-   Concurrent writes must not silently overwrite one another.
-   The UI must remain usable on a small phone screen.
-   The codebase must be understandable during a 20--30 minute
    walkthrough and small live code change.

## 13. Testing and acceptance criteria

### 13.1 Split calculation tests

Test:

-   Equal split with no remainder.
-   Equal split with leftover paise.
-   Remainder tie resolved by lowest member ID.
-   Shares split with unequal weights.
-   Shares split with leftover paise.
-   Exact split summing exactly to the expense amount.
-   Rejection of invalid weights, IDs and amounts.
-   Payer not included in participants.
-   Adding a new member does not alter past expense splits.

### 13.2 Balance tests

Test:

-   Expense paid by one member and split equally.
-   Expense payer is not a split participant.
-   Multiple expenses.
-   Payment between members.
-   Expense deletion.
-   Sum of all balances equals zero.
-   Balances ordered by member ID.

### 13.3 Settlement tests

Test all required properties:

-   Every transfer is positive.
-   Applying transfers makes all balances zero.
-   No member both pays and receives.
-   Transfer count is no more than `k − 1`.
-   Already settled group returns an empty list.
-   Greedy matching uses biggest debtor and biggest creditor.
-   Ties are resolved by lowest member ID.
-   Optional minimum-transfer implementation is tested separately.

### 13.4 API tests

Test:

-   Every required endpoint and HTTP method.
-   Exact success status codes.
-   Required response field names and JSON types.
-   Unknown group, member and expense.
-   Duplicate member name.
-   Malformed JSON.
-   Invalid expense and split fields.
-   Invalid payment.
-   Delete expense returns 204 with no body.
-   Group creation and member limit boundaries.

### 13.5 UI checks

Manually verify:

-   360px phone width and desktop width up to 1280px.
-   No horizontal overflow.
-   Touch targets at least 44px.
-   Every input has a label.
-   Keyboard navigation and visible focus.
-   Loading, empty, offline and error states.
-   Live updates appear within the polling interval.
-   No browser console errors.
-   User-provided text is rendered safely.

## 14. Scoring priorities

The challenge scoring is:

  Criterion                           Weight Project priority
  --------------------------------- -------- ------------------
  Functional completeness                35% Highest
  Architecture and design                25% Highest
  Validation, errors and security        20% High
  Code hygiene and Git habits            10% High
  README and setup                       10% High

Do not sacrifice API correctness, money accuracy, validation or tests
for optional features or visual polish.

## 15. 24-hour implementation plan

Suggested time allocation (approximately 21 hours planned work plus 3
hours buffer):

  -----------------------------------------------------------------------------------
  Phase                                         Time Deliverable
  --------------------- ---------------------------- --------------------------------
  1\. Project setup                           1 hour Node/Express app, scripts,
                                                     static frontend serving

  2\. Database and API                       3 hours SQLite schema, initialization,
  foundation                                         group/member/expense/payment
                                                     routes

  3\. Core algorithms                        3 hours Money parsing, split rounding,
                                                     balances, greedy settlement

  4\. API and algorithm                      2 hours Unit and HTTP tests for required
  tests                                              behavior

  5\. Frontend                               5 hours Home, group tabs, expense form,
                                                     balances and settle up

  6\. Integration                            2 hours Connect frontend to API, polling
                                                     and share link

  7\. Verification and                       4 hours Edge cases, validation,
  fixes                                              responsive/accessibility and
                                                     concurrency checks

  8\. README and Git                          1 hour Setup/design/assumptions/tests
  cleanup                                            documentation and clean commits

  Buffer                                     3 hours Unexpected issues and final
                                                     review
  -----------------------------------------------------------------------------------

Optional features must be postponed if core requirements are not
complete.

## 16. Git, README and hand-in

### Git

-   Commit in small, meaningful increments.
-   Use clear commit messages.
-   Do not commit generated database files, `node_modules` or secrets.
-   Keep the repository clean and easy to inspect.

### README must include

-   Project overview and selected problem: C4.
-   Exact technology stack.
-   Prerequisites and setup steps.
-   One-command startup instructions (`npm start`).
-   PORT configuration and default port 3000.
-   Database creation and storage behavior.
-   API endpoint overview.
-   Architecture and design overview.
-   Money representation and rounding assumptions.
-   Settlement algorithm explanation.
-   Group-link access-control limitation: anyone with the link can
    access the group.
-   How to run tests.
-   Implemented optional features and known limitations.

### Submission and walkthrough

-   Submit a Git repository link or ZIP containing source code, tests
    and README.
-   Be ready for a 20--30 minute walkthrough.
-   Be prepared to make a small live code change and explain the
    relevant design.

## 17. Scope and implementation rules

1.  The C4 requirements and API contract take priority over all optional
    ideas.
2.  The chosen stack is fixed: HTML5, CSS3, vanilla JavaScript ES2020+,
    Node.js, Express.js and local SQLite.
3.  Do not add prohibited frontend frameworks or CSS kits.
4.  Do not add hosted services, external databases or Docker
    dependencies.
5.  Do not add login or authentication.
6.  Keep all money values as integer paise in the API, database and
    calculations.
7.  Keep the server authoritative for splits, balances and settlements.
8.  Implement the required greedy settlement algorithm before attempting
    the bonus minimum-transfer algorithm.
9.  Add optional features only after required endpoints, validation and
    tests pass.
10. If any ambiguity arises, follow the C4 problem's clarifications and
    the Track C general rules. Document reasonable assumptions in the
    README.

------------------------------------------------------------------------

## Appendix A --- Key API and data invariants

-   Group IDs: random, URL-safe, at least 10 characters.
-   Group members: 2--20 at creation; 20 maximum total.
-   Member names: trimmed, 1--40 characters, case-insensitive unique
    within group.
-   Group name: 1--60 characters.
-   Expense description: 1--100 characters.
-   Expense amount: integer paise, 1--1,000,000,000.
-   Share weights: positive integers, maximum 1000.
-   Exact split amounts: integer paise, each at least zero, sum exactly
    to expense amount.
-   Payments: positive integer paise; sender and receiver must differ.
-   Balances: server-calculated and sum to zero.
-   Settlement: positive transfers; no payer/receiver overlap; at most
    `k − 1` transfers.
-   Polling: no more frequently than every 5 seconds.
-   Touch targets: at least 44px.
-   Supported viewport range: phone-first at 360px through 1280px.

## Appendix B --- Source basis

This PRD is based on the supplied Coding Test Pack PDF:

-   Track C general rules, repository/run requirements, UI quality,
    security and scoring: pages 17--18.
-   Problem C4 overview, money rules, REST API, split formats,
    clarifications, settlement rules, shared-state requirements and UI
    requirements: pages 25--26.

Where this PRD labels an item as an optional extra or implementation
choice, it is a project decision layered on top of the challenge
requirements, not a claim that the PDF requires it.

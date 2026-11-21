const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const app = require("../src/app");
const { calculateSplits } = require("../src/services/split.service");

// ===========================================================================
// 1. Static Asset Delivery & HTML Accessibility
// ===========================================================================

test("Frontend: GET / serves index.html with viewport, labels, and modular scripts", async () => {
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /html/);

  // Viewport & meta
  assert.ok(res.text.includes("<!DOCTYPE html>"));
  assert.ok(res.text.includes('meta name="viewport" content="width=device-width, initial-scale=1.0'));
  assert.ok(res.text.includes("SplitFair — Group Expense Splitter"));

  // Offline banner & accessibility
  assert.ok(res.text.includes('id="offline-banner"'));
  assert.ok(res.text.includes('role="alert"'));

  // Form labels & buttons
  assert.ok(res.text.includes('for="input-group-name"'));
  assert.ok(res.text.includes('id="btn-add-member-field"'));
  assert.ok(res.text.includes('id="btn-share-link"'));
  assert.ok(res.text.includes('id="btn-open-add-member"'));
  assert.ok(res.text.includes('id="btn-open-add-expense"'));
  assert.ok(res.text.includes('id="quick-calc-details"'));

  // Tab semantics
  assert.ok(res.text.includes('role="tablist"'));
  assert.ok(res.text.includes('role="tab"'));

  // Scripts in dependency order
  assert.ok(res.text.includes('src="/js/money.js"'));
  assert.ok(res.text.includes('src="/js/api.js"'));
  assert.ok(res.text.includes('src="/js/expenses.js"'));
  assert.ok(res.text.includes('src="/js/balances.js"'));
  assert.ok(res.text.includes('src="/js/settlements.js"'));
  assert.ok(res.text.includes('src="/js/app.js"'));
});

test("Frontend: GET all static JS and CSS modules returns 200 OK", async () => {
  const files = [
    "/css/style.css",
    "/js/money.js",
    "/js/api.js",
    "/js/expenses.js",
    "/js/balances.js",
    "/js/settlements.js",
    "/js/app.js",
  ];

  for (const file of files) {
    const res = await request(app).get(file);
    assert.equal(res.status, 200, `Failed to load ${file}`);
    assert.ok(res.text.length > 50, `${file} appears empty`);
  }
});

// ===========================================================================
// 2. Zero-XSS Audit (No unsafe innerHTML with dynamic user strings)
// ===========================================================================

test("Frontend Security: No unsafe innerHTML interpolation of user-supplied variables", () => {
  const jsDir = path.join(__dirname, "../public/js");
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"));

  const unsafePatterns = [
    /innerHTML\s*=\s*`[^`]*\$\{[^}]*(?:name|description|title|text|input|val)[^}]*\}[^`]*`/i,
    /innerHTML\s*\+=\s*`[^`]*\$\{[^}]*(?:name|description|title|text|input|val)[^}]*\}[^`]*`/i,
    /outerHTML\s*=\s*`[^`]*\$\{[^}]*(?:name|description|title|text|input|val)[^}]*\}[^`]*`/i,
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(jsDir, file), "utf-8");
    for (const pattern of unsafePatterns) {
      const match = content.match(pattern);
      assert.equal(
        match,
        null,
        `Potential unsafe innerHTML interpolation found in ${file}: ${match && match[0]}`
      );
    }
  }
});

// ===========================================================================
// 3. Algorithmic Parity: Client Preview vs Backend Split Service
// ===========================================================================

test("Frontend Parity: Client MoneyUtils preview matches Backend calculateSplits exactly", () => {
  // Load client money utils into sandbox
  const moneyJsCode = fs.readFileSync(path.join(__dirname, "../public/js/money.js"), "utf-8");
  const sandbox = { window: {}, BigInt, Math, Number, String, Object };
  const fn = new Function("window", "BigInt", "Math", "Number", "String", "Object", moneyJsCode);
  fn(sandbox.window, BigInt, Math, Number, String, Object);
  const ClientMoney = sandbox.window.MoneyUtils;

  assert.ok(ClientMoney, "Client MoneyUtils failed to export on window");

  const members = [
    { id: 1, name: "Asha" },
    { id: 2, name: "Ben" },
    { id: 3, name: "Charlie" },
  ];
  const memberIds = [1, 2, 3];

  // Case A: Equal split with remainder (100 paise across 3 members -> 34, 33, 33)
  const clientEqual100 = ClientMoney.calculatePreviewSplits(100, "equal", { participants: [1, 2, 3] }, members);
  const serverEqual100 = calculateSplits({
    amount: 100,
    paidBy: 1,
    split: { type: "equal", participants: [1, 2, 3] },
    memberIds,
  });

  assert.equal(clientEqual100.isValid, true);
  assert.deepEqual(
    clientEqual100.splits,
    { 1: 34, 2: 33, 3: 33 }
  );
  assert.deepEqual(
    clientEqual100.splits,
    { 1: serverEqual100["1"], 2: serverEqual100["2"], 3: serverEqual100["3"] }
  );

  // Case B: Equal split with 2 remainders across 4 members (102 paise -> 26, 26, 25, 25)
  const members4 = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const clientEqual102 = ClientMoney.calculatePreviewSplits(102, "equal", { participants: [1, 2, 3, 4] }, members4);
  const serverEqual102 = calculateSplits({
    amount: 102,
    paidBy: 1,
    split: { type: "equal", participants: [1, 2, 3, 4] },
    memberIds: [1, 2, 3, 4],
  });

  assert.deepEqual(clientEqual102.splits, { 1: 26, 2: 26, 3: 25, 4: 25 });
  assert.deepEqual(
    clientEqual102.splits,
    {
      1: serverEqual102["1"],
      2: serverEqual102["2"],
      3: serverEqual102["3"],
      4: serverEqual102["4"],
    }
  );

  // Case C: Shares split (1000 paise with weights 1:2:1)
  const clientShares = ClientMoney.calculatePreviewSplits(
    1000,
    "shares",
    { shares: { "1": 1, "2": 2, "3": 1 } },
    members
  );
  const serverShares = calculateSplits({
    amount: 1000,
    paidBy: 1,
    split: { type: "shares", shares: { "1": 1, "2": 2, "3": 1 } },
    memberIds,
  });

  assert.equal(clientShares.isValid, true);
  assert.deepEqual(
    clientShares.splits,
    { 1: serverShares["1"], 2: serverShares["2"], 3: serverShares["3"] }
  );

  // Case D: Exact split
  const clientExact = ClientMoney.calculatePreviewSplits(
    1500,
    "exact",
    { amounts: { "1": 500, "2": 1000 } },
    members
  );
  assert.equal(clientExact.isValid, true);
  assert.equal(clientExact.diff, 0);

  const clientExactMismatch = ClientMoney.calculatePreviewSplits(
    1500,
    "exact",
    { amounts: { "1": 500, "2": 900 } },
    members
  );
  assert.equal(clientExactMismatch.isValid, false);
  assert.equal(clientExactMismatch.diff, 100);
});

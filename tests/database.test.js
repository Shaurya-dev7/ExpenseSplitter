const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb, closeDb } = require("../src/database/db");
const { initSchema } = require("../src/database/schema");
const { DatabaseError, translateSqliteError } = require("../src/database/errors");
const repo = require("../src/database/repository");

// ---------------------------------------------------------------------------
// Helper: fresh isolated :memory: DB per test
// ---------------------------------------------------------------------------

function freshDb() {
  const db = createDb(":memory:");
  initSchema(db);
  return db;
}

function makeGroupId(n = 1) {
  return "testgroup_" + String(n).padStart(4, "0");
}

const TS = "2026-01-15T18:30:00.000Z";

// ===================================================================
// 1. Schema auto-initialisation & PRAGMAs
// ===================================================================

test("Schema: tables and indexes created in :memory: mode", () => {
  const db = freshDb();
  const names = db
    .prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table','index')")
    .all()
    .map((r) => r.name);

  assert.ok(names.includes("groups"));
  assert.ok(names.includes("members"));
  assert.ok(names.includes("expenses"));
  assert.ok(names.includes("payments"));
  assert.ok(names.includes("idx_expenses_group_id"));
  assert.ok(names.includes("idx_payments_group_id"));
  closeDb(db);
});

test("Schema: PRAGMA foreign_keys is ON in :memory: mode", () => {
  const db = freshDb();
  const fk = db.pragma("foreign_keys", { simple: true });
  assert.equal(fk, 1);
  closeDb(db);
});

test("Schema: PRAGMA busy_timeout is set", () => {
  const db = freshDb();
  const timeout = db.pragma("busy_timeout", { simple: true });
  assert.equal(timeout, 5000);
  closeDb(db);
});

test("Lifecycle: closeDb handles default db and closed connections idempotently", () => {
  const db = freshDb();
  closeDb(db);
  // Closing an already closed db must not throw
  assert.doesNotThrow(() => closeDb(db));
  assert.doesNotThrow(() => closeDb(null));
  assert.doesNotThrow(() => closeDb(undefined));
});

// ===================================================================
// 2. createGroupWithMembers
// ===================================================================

test("createGroupWithMembers: assigns sequential IDs 1..N and preserves order", () => {
  const db = freshDb();
  const result = repo.createGroupWithMembers(
    { id: makeGroupId(), name: "Room 204", members: ["Asha", "Ben", "Charlie"], createdAt: TS },
    db
  );
  assert.equal(result.members.length, 3);
  assert.equal(result.members[0].id, 1);
  assert.equal(result.members[0].name, "Asha");
  assert.equal(result.members[1].id, 2);
  assert.equal(result.members[2].id, 3);
  closeDb(db);
});

test("createGroupWithMembers: rolls back entirely on duplicate name (case-insensitive)", () => {
  const db = freshDb();
  const gid = makeGroupId();
  assert.throws(
    () =>
      repo.createGroupWithMembers(
        { id: gid, name: "Dupes", members: ["Asha", "asha"], createdAt: TS },
        db
      ),
    (err) => err instanceof DatabaseError && err.code === "DUPLICATE_MEMBER"
  );
  // Entire transaction must roll back: group row must NOT exist
  const group = repo.getGroupById(gid, db);
  assert.equal(group, null);
  closeDb(db);
});

test("createGroupWithMembers: enforces minimum group id length (>= 10 chars)", () => {
  const db = freshDb();
  assert.throws(
    () =>
      repo.createGroupWithMembers(
        { id: "short", name: "Short ID Group", members: ["Asha", "Ben"], createdAt: TS },
        db
      ),
    (err) => err instanceof DatabaseError || err.message.includes("CHECK constraint failed")
  );
  closeDb(db);
});

// ===================================================================
// 3. Per-group ID isolation
// ===================================================================

test("Per-group ID isolation: two distinct groups both start member IDs at 1", () => {
  const db = freshDb();
  const g1 = repo.createGroupWithMembers(
    { id: makeGroupId(1), name: "Group A", members: ["Alice", "Bob"], createdAt: TS },
    db
  );
  const g2 = repo.createGroupWithMembers(
    { id: makeGroupId(2), name: "Group B", members: ["Xena", "Yara", "Zoe"], createdAt: TS },
    db
  );
  assert.equal(g1.members[0].id, 1);
  assert.equal(g2.members[0].id, 1);
  assert.equal(g2.members[2].id, 3);
  closeDb(db);
});

// ===================================================================
// 4. addMember
// ===================================================================

test("addMember: increments ID sequentially", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  const added = repo.addMember(gid, "C", db);
  assert.equal(added.id, 3);
  assert.equal(added.name, "C");
  closeDb(db);
});

test("addMember: trims whitespace from name", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  const added = repo.addMember(gid, "  Spacey  ", db);
  assert.equal(added.name, "Spacey");
  closeDb(db);
});

test("addMember: rejects case-insensitive duplicate with DUPLICATE_MEMBER", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["Asha", "Ben"], createdAt: TS },
    db
  );
  assert.throws(
    () => repo.addMember(gid, "asha", db),
    (err) => err instanceof DatabaseError && err.code === "DUPLICATE_MEMBER"
  );
  closeDb(db);
});

test("addMember: rejects unknown group with GROUP_NOT_FOUND", () => {
  const db = freshDb();
  assert.throws(
    () => repo.addMember("nonexistent_group", "Nobody", db),
    (err) => err instanceof DatabaseError && err.code === "GROUP_NOT_FOUND"
  );
  closeDb(db);
});

test("addMember: enforces 20-member hard cap", () => {
  const db = freshDb();
  const gid = makeGroupId();
  const names = Array.from({ length: 20 }, (_, i) => `Member${i + 1}`);
  repo.createGroupWithMembers(
    { id: gid, name: "Big Group", members: names.slice(0, 2), createdAt: TS },
    db
  );
  for (let i = 2; i < 20; i++) {
    repo.addMember(gid, names[i], db);
  }
  // 21st member must fail
  assert.throws(
    () => repo.addMember(gid, "TooMany", db),
    (err) => err instanceof DatabaseError && err.code === "MEMBER_LIMIT_EXCEEDED"
  );
  closeDb(db);
});

// ===================================================================
// 5. Expenses
// ===================================================================

test("expenses: stores integer paise and lists oldest-first", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B", "C"], createdAt: TS },
    db
  );

  const e1 = repo.createExpense(
    {
      groupId: gid,
      description: "Dinner",
      amount: 9000,
      paidBy: 1,
      splits: { "1": 3000, "2": 3000, "3": 3000 },
      createdAt: "2026-01-15T19:00:00.000Z",
    },
    db
  );
  const e2 = repo.createExpense(
    {
      groupId: gid,
      description: "Groceries",
      amount: 4500,
      paidBy: 2,
      splits: { "1": 2250, "2": 2250 },
      createdAt: "2026-01-15T20:00:00.000Z",
    },
    db
  );

  assert.equal(e1.amount, 9000);
  assert.deepEqual(e1.splits, { "1": 3000, "2": 3000, "3": 3000 });

  const list = repo.listExpensesByGroup(gid, db);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, e1.id); // oldest first
  assert.equal(list[1].id, e2.id);
  closeDb(db);
});

test("expenses: rejects float amount at DB CHECK level", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  assert.throws(() =>
    repo.createExpense(
      {
        groupId: gid,
        description: "Bad",
        amount: 99.5,
        paidBy: 1,
        splits: { "1": 50, "2": 50 },
        createdAt: TS,
      },
      db
    )
  );
  closeDb(db);
});

test("expenses: rejects zero amount", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  assert.throws(() =>
    repo.createExpense(
      {
        groupId: gid,
        description: "Zero",
        amount: 0,
        paidBy: 1,
        splits: { "1": 0 },
        createdAt: TS,
      },
      db
    )
  );
  closeDb(db);
});

test("expenses: rejects amount > 1 billion paise", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  assert.throws(() =>
    repo.createExpense(
      {
        groupId: gid,
        description: "Huge",
        amount: 1000000001,
        paidBy: 1,
        splits: { "1": 1000000001 },
        createdAt: TS,
      },
      db
    )
  );
  closeDb(db);
});

test("expenses: preserves historical splits unchanged after adding new members", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  repo.createExpense(
    {
      groupId: gid,
      description: "Before",
      amount: 1000,
      paidBy: 1,
      splits: { "1": 500, "2": 500 },
      createdAt: TS,
    },
    db
  );
  // Add a third member later
  repo.addMember(gid, "C", db);

  // Historical split must remain intact
  const list = repo.listExpensesByGroup(gid, db);
  assert.deepEqual(list[0].splits, { "1": 500, "2": 500 });
  closeDb(db);
});

test("expenses: scoped deleteExpense — cannot delete another group's expense", () => {
  const db = freshDb();
  const gidA = makeGroupId(1);
  const gidB = makeGroupId(2);
  repo.createGroupWithMembers(
    { id: gidA, name: "A", members: ["X", "Y"], createdAt: TS },
    db
  );
  repo.createGroupWithMembers(
    { id: gidB, name: "B", members: ["X", "Y"], createdAt: TS },
    db
  );
  const exp = repo.createExpense(
    {
      groupId: gidA,
      description: "A only",
      amount: 100,
      paidBy: 1,
      splits: { "1": 50, "2": 50 },
      createdAt: TS,
    },
    db
  );

  // Attempting to delete with wrong group must return false
  const deleted = repo.deleteExpense(gidB, exp.id, db);
  assert.equal(deleted, false);

  // Deleting with correct group succeeds
  const deleted2 = repo.deleteExpense(gidA, exp.id, db);
  assert.equal(deleted2, true);
  closeDb(db);
});

// ===================================================================
// 6. Payments
// ===================================================================

test("payments: records valid integer paise payment", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  const p = repo.createPayment(
    { groupId: gid, from: 2, to: 1, amount: 5000, createdAt: TS },
    db
  );
  assert.equal(p.from, 2);
  assert.equal(p.to, 1);
  assert.equal(p.amount, 5000);

  const list = repo.listPaymentsByGroup(gid, db);
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, 5000);
  closeDb(db);
});

test("payments: rejects from === to via DB CHECK constraint", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  assert.throws(() =>
    repo.createPayment(
      { groupId: gid, from: 1, to: 1, amount: 100, createdAt: TS },
      db
    )
  );
  closeDb(db);
});

test("payments: rejects non-positive amount", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  assert.throws(() =>
    repo.createPayment(
      { groupId: gid, from: 1, to: 2, amount: 0, createdAt: TS },
      db
    )
  );
  assert.throws(() =>
    repo.createPayment(
      { groupId: gid, from: 1, to: 2, amount: -500, createdAt: TS },
      db
    )
  );
  closeDb(db);
});

test("payments: rejects non-existent member foreign keys", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Test", members: ["A", "B"], createdAt: TS },
    db
  );
  assert.throws(() =>
    repo.createPayment(
      { groupId: gid, from: 1, to: 99, amount: 100, createdAt: TS },
      db
    )
  );
  closeDb(db);
});

// ===================================================================
// 7. getGroupLedger & Read Transaction Snapshot Consistency
// ===================================================================

test("getGroupLedger: returns consistent members, expenses, and payments in single snapshot", () => {
  const db = freshDb();
  const gid = makeGroupId();
  repo.createGroupWithMembers(
    { id: gid, name: "Ledger Group", members: ["A", "B", "C"], createdAt: TS },
    db
  );
  repo.createExpense(
    {
      groupId: gid,
      description: "Food",
      amount: 3000,
      paidBy: 1,
      splits: { "1": 1000, "2": 1000, "3": 1000 },
      createdAt: TS,
    },
    db
  );
  repo.createPayment(
    { groupId: gid, from: 2, to: 1, amount: 1000, createdAt: TS },
    db
  );

  const ledger = repo.getGroupLedger(gid, db);
  assert.ok(ledger);
  assert.equal(ledger.group.name, "Ledger Group");
  assert.equal(ledger.members.length, 3);
  assert.equal(ledger.members[0].id, 1);
  assert.equal(ledger.expenses.length, 1);
  assert.deepEqual(ledger.expenses[0].splits, { "1": 1000, "2": 1000, "3": 1000 });
  assert.equal(ledger.payments.length, 1);
  assert.equal(ledger.payments[0].amount, 1000);
  closeDb(db);
});

test("getGroupLedger: returns null for non-existent group", () => {
  const db = freshDb();
  const result = repo.getGroupLedger("does_not_exist_1234", db);
  assert.equal(result, null);
  closeDb(db);
});

// ===================================================================
// 8. Error Translation
// ===================================================================

test("Error Translation: translates SQLite error codes to domain DatabaseError", () => {
  const checkErr = translateSqliteError({ code: "SQLITE_CONSTRAINT_CHECK", message: "CHECK constraint failed" });
  assert.equal(checkErr.code, "CHECK_CONSTRAINT_FAILED");
  assert.equal(checkErr.statusCode, 400);

  const busyErr = translateSqliteError({ code: "SQLITE_BUSY", message: "database is locked" });
  assert.equal(busyErr.code, "DATABASE_BUSY");
  assert.equal(busyErr.statusCode, 503);

  const fkErr = translateSqliteError({ code: "SQLITE_CONSTRAINT_FOREIGNKEY", message: "FOREIGN KEY constraint failed" });
  assert.equal(fkErr.code, "INVALID_REFERENCE");
  assert.equal(fkErr.statusCode, 400);

  assert.equal(translateSqliteError(null), null);
});

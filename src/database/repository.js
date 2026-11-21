const db = require("./db");
const {
  groupNotFound,
  duplicateMember,
  memberLimitExceeded,
  invalidReference,
  translateSqliteError,
} = require("./errors");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run `fn` inside a BEGIN IMMEDIATE transaction on `targetDb`.
 * Rolls back automatically on throw.
 */
function immediate(targetDb, fn) {
  const run = targetDb.transaction(fn);
  // better-sqlite3 .transaction() uses BEGIN DEFERRED by default.
  // Calling run.immediate() switches it to BEGIN IMMEDIATE.
  return run.immediate();
}

// ---------------------------------------------------------------------------
// 1. createGroupWithMembers
// ---------------------------------------------------------------------------

function createGroupWithMembers({ id, name, members, createdAt }, targetDb = db) {
  return immediate(targetDb, () => {
    targetDb
      .prepare("INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)")
      .run(id, name, createdAt);

    const insertMember = targetDb.prepare(
      "INSERT INTO members (group_id, id, name, created_at) VALUES (?, ?, ?, ?)"
    );

    const result = [];
    for (let i = 0; i < members.length; i++) {
      const trimmed = members[i].trim();
      const memberId = i + 1;
      try {
        insertMember.run(id, memberId, trimmed, createdAt);
      } catch (err) {
        const domainErr = translateSqliteError(err);
        if (domainErr) {
          domainErr.message = `Member '${trimmed}' already exists in this group`;
          throw domainErr;
        }
        throw err;
      }
      result.push({ id: memberId, name: trimmed });
    }

    return { id, name, members: result };
  });
}

// ---------------------------------------------------------------------------
// 2. getGroupById
// ---------------------------------------------------------------------------

function getGroupById(groupId, targetDb = db) {
  const group = targetDb
    .prepare("SELECT id, name FROM groups WHERE id = ?")
    .get(groupId);

  if (!group) return null;

  const members = targetDb
    .prepare("SELECT id, name FROM members WHERE group_id = ? ORDER BY id ASC")
    .all(groupId);

  return { id: group.id, name: group.name, members };
}

// ---------------------------------------------------------------------------
// 3. addMember
// ---------------------------------------------------------------------------

function addMember(groupId, name, targetDb = db) {
  return immediate(targetDb, () => {
    // Verify group exists
    const group = targetDb
      .prepare("SELECT id FROM groups WHERE id = ?")
      .get(groupId);
    if (!group) throw groupNotFound(groupId);

    // Check 20-member cap
    const { count } = targetDb
      .prepare("SELECT COUNT(*) AS count FROM members WHERE group_id = ?")
      .get(groupId);
    if (count >= 20) throw memberLimitExceeded();

    // Compute next sequential ID
    const { nextId } = targetDb
      .prepare(
        "SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM members WHERE group_id = ?"
      )
      .get(groupId);

    const trimmed = name.trim();
    const createdAt = new Date().toISOString();

    try {
      targetDb
        .prepare(
          "INSERT INTO members (group_id, id, name, created_at) VALUES (?, ?, ?, ?)"
        )
        .run(groupId, nextId, trimmed, createdAt);
    } catch (err) {
      const domainErr = translateSqliteError(err);
      if (domainErr) {
        domainErr.message = `Member '${trimmed}' already exists in this group`;
        throw domainErr;
      }
      throw err;
    }

    return { id: nextId, name: trimmed };
  });
}

// ---------------------------------------------------------------------------
// 4. createExpense
// ---------------------------------------------------------------------------

function createExpense(
  { groupId, description, amount, paidBy, splits, createdAt },
  targetDb = db
) {
  const splitsJson = typeof splits === "string" ? splits : JSON.stringify(splits);

  try {
    const info = targetDb
      .prepare(
        `INSERT INTO expenses (group_id, description, amount, paid_by, splits, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(groupId, description, amount, paidBy, splitsJson, createdAt);

    return {
      id: info.lastInsertRowid,
      description,
      amount,
      paidBy,
      splits: typeof splits === "string" ? JSON.parse(splits) : splits,
      createdAt,
    };
  } catch (err) {
    const domainErr = translateSqliteError(err);
    if (domainErr) throw domainErr;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 5. listExpensesByGroup
// ---------------------------------------------------------------------------

function listExpensesByGroup(groupId, targetDb = db) {
  const rows = targetDb
    .prepare(
      `SELECT id, description, amount, paid_by AS paidBy, splits, created_at AS createdAt
       FROM expenses
       WHERE group_id = ?
       ORDER BY id ASC`
    )
    .all(groupId);

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: r.amount,
    paidBy: r.paidBy,
    splits: JSON.parse(r.splits),
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// 6. deleteExpense
// ---------------------------------------------------------------------------

function deleteExpense(groupId, expenseId, targetDb = db) {
  const info = targetDb
    .prepare("DELETE FROM expenses WHERE id = ? AND group_id = ?")
    .run(expenseId, groupId);

  return info.changes > 0;
}

// ---------------------------------------------------------------------------
// 7. createPayment
// ---------------------------------------------------------------------------

function createPayment({ groupId, from, to, amount, createdAt }, targetDb = db) {
  try {
    const info = targetDb
      .prepare(
        `INSERT INTO payments (group_id, from_member, to_member, amount, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(groupId, from, to, amount, createdAt);

    return {
      id: info.lastInsertRowid,
      from,
      to,
      amount,
      createdAt,
    };
  } catch (err) {
    const domainErr = translateSqliteError(err);
    if (domainErr) throw domainErr;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 8. listPaymentsByGroup
// ---------------------------------------------------------------------------

function listPaymentsByGroup(groupId, targetDb = db) {
  return targetDb
    .prepare(
      `SELECT id, from_member AS "from", to_member AS "to", amount, created_at AS createdAt
       FROM payments
       WHERE group_id = ?
       ORDER BY id ASC`
    )
    .all(groupId);
}

// ---------------------------------------------------------------------------
// 9. getGroupLedger
// ---------------------------------------------------------------------------

function getGroupLedger(groupId, targetDb = db) {
  const group = targetDb
    .prepare("SELECT id, name FROM groups WHERE id = ?")
    .get(groupId);

  if (!group) return null;

  const members = targetDb
    .prepare("SELECT id, name FROM members WHERE group_id = ? ORDER BY id ASC")
    .all(groupId);

  const expenses = listExpensesByGroup(groupId, targetDb);
  const payments = listPaymentsByGroup(groupId, targetDb);

  return { group, members, expenses, payments };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createGroupWithMembers,
  getGroupById,
  addMember,
  createExpense,
  listExpensesByGroup,
  deleteExpense,
  createPayment,
  listPaymentsByGroup,
  getGroupLedger,
};

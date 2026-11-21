const repository = require("../database/repository");
const { calculateSplits, ValidationError } = require("../services/split.service");

function getDb(req) {
  return req.app.locals.db;
}

/**
 * POST /api/groups/:gid/expenses
 * Record a new expense with deterministic splits.
 */
function addExpense(req, res, next) {
  try {
    const { gid } = req.params;
    const group = repository.getGroupById(gid, getDb(req));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ errors: { body: "Request body must be a JSON object" } });
    }

    const { description, amount, paidBy, split } = req.body;
    const errors = {};

    // Validate description: 1..100 characters
    if (typeof description !== "string" || description.trim().length === 0 || description.trim().length > 100) {
      errors.description = "Description is required and must be between 1 and 100 characters";
    }

    // Validate amount: integer paise 1..1,000,000,000
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) {
      errors.amount = "Amount must be a whole-number integer between 1 and 1,000,000,000 paise";
    }

    // Validate paidBy: member of group
    const memberIds = group.members.map((m) => m.id);
    const memberIdSet = new Set(memberIds);

    if (typeof paidBy !== "number" || !Number.isSafeInteger(paidBy) || !memberIdSet.has(paidBy)) {
      errors.paidBy = "paidBy must identify a valid member of the group";
    }

    // Validate split using calculateSplits
    let computedSplits = null;
    if (!split || typeof split !== "object" || Array.isArray(split)) {
      errors.split = "Split specification must be an object";
    } else {
      try {
        computedSplits = calculateSplits({
          amount,
          paidBy,
          split,
          memberIds,
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          Object.assign(errors, err.errors);
        } else {
          throw err;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const createdAt = new Date().toISOString();
    const expense = repository.createExpense(
      {
        groupId: gid,
        description: description.trim(),
        amount,
        paidBy,
        splits: computedSplits,
        createdAt,
      },
      getDb(req)
    );

    return res.status(201).json(expense);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/groups/:gid/expenses
 * List all expenses for a group, oldest first.
 */
function listExpenses(req, res, next) {
  try {
    const { gid } = req.params;
    const group = repository.getGroupById(gid, getDb(req));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const expenses = repository.listExpensesByGroup(gid, getDb(req));
    return res.status(200).json(expenses);
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/groups/:gid/expenses/:eid
 * Delete an expense from a group.
 */
function deleteExpense(req, res, next) {
  try {
    const { gid, eid } = req.params;
    const group = repository.getGroupById(gid, getDb(req));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!/^[1-9]\d*$/.test(eid)) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const expenseId = parseInt(eid, 10);
    const deleted = repository.deleteExpense(gid, expenseId, getDb(req));

    if (!deleted) {
      return res.status(404).json({ error: "Expense not found" });
    }

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  addExpense,
  listExpenses,
  deleteExpense,
};

const repository = require("../database/repository");
const { calculateBalances } = require("../services/balance.service");
const { calculateSettlements } = require("../services/settlement.service");

function getDb(req) {
  return req.app.locals.db;
}

/**
 * GET /api/groups/:gid/balances
 * Compute current member balances from saved expenses and payments.
 */
function getBalances(req, res, next) {
  try {
    const { gid } = req.params;
    const ledger = repository.getGroupLedger(gid, getDb(req));

    if (!ledger) {
      return res.status(404).json({ error: "Group not found" });
    }

    const balances = calculateBalances({
      members: ledger.members,
      expenses: ledger.expenses,
      payments: ledger.payments,
    });

    return res.status(200).json(balances);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/groups/:gid/settlements
 * Compute suggested debt simplification transfers.
 */
function getSettlements(req, res, next) {
  try {
    const { gid } = req.params;
    const ledger = repository.getGroupLedger(gid, getDb(req));

    if (!ledger) {
      return res.status(404).json({ error: "Group not found" });
    }

    const { balances } = calculateBalances({
      members: ledger.members,
      expenses: ledger.expenses,
      payments: ledger.payments,
    });

    const settlements = calculateSettlements(balances);
    return res.status(200).json(settlements);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getBalances,
  getSettlements,
};

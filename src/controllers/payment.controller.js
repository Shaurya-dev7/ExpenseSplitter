const repository = require("../database/repository");

function getDb(req) {
  return req.app.locals.db;
}

/**
 * POST /api/groups/:gid/payments
 * Record a direct payment between two members.
 */
function recordPayment(req, res, next) {
  try {
    const { gid } = req.params;
    const group = repository.getGroupById(gid, getDb(req));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ errors: { body: "Request body must be a JSON object" } });
    }

    const { from, to, amount } = req.body;
    const errors = {};
    const memberIdSet = new Set(group.members.map((m) => m.id));

    const isFromValid = typeof from === "number" && Number.isSafeInteger(from) && memberIdSet.has(from);
    if (!isFromValid) {
      errors.from = "from must identify a valid member of the group";
    }

    const isToValid = typeof to === "number" && Number.isSafeInteger(to) && memberIdSet.has(to);
    if (!isToValid) {
      errors.to = "to must identify a valid member of the group";
    }

    if (isFromValid && isToValid && from === to) {
      errors.to = "Payer and receiver must be different members";
    }

    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1) {
      errors.amount = "Amount must be a positive whole-number integer in paise";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const createdAt = new Date().toISOString();
    const payment = repository.createPayment(
      {
        groupId: gid,
        from,
        to,
        amount,
        createdAt,
      },
      getDb(req)
    );

    return res.status(201).json(payment);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  recordPayment,
};

const express = require("express");
const {
  addExpense,
  listExpenses,
  deleteExpense,
} = require("../controllers/expense.controller");

const router = express.Router();

router.post("/:gid/expenses", addExpense);
router.get("/:gid/expenses", listExpenses);
router.delete("/:gid/expenses/:eid", deleteExpense);

module.exports = router;

const express = require("express");
const {
  getBalances,
  getSettlements,
} = require("../controllers/balance.controller");

const router = express.Router();

router.get("/:gid/balances", getBalances);
router.get("/:gid/settlements", getSettlements);

module.exports = router;

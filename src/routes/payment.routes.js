const express = require("express");
const { recordPayment } = require("../controllers/payment.controller");

const router = express.Router();

router.post("/:gid/payments", recordPayment);

module.exports = router;

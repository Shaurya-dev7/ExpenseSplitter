const express = require("express");
const { createGroup, getGroup } = require("../controllers/group.controller");

const router = express.Router();

router.post("/", createGroup);
router.get("/:gid", getGroup);

module.exports = router;

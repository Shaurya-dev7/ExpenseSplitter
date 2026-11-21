const express = require("express");
const { addMember } = require("../controllers/group.controller");

const router = express.Router();

router.post("/:gid/members", addMember);

module.exports = router;

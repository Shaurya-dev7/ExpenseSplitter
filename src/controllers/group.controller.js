const repository = require("../database/repository");
const { generateGroupId } = require("../utils/group-id");

function getDb(req) {
  return req.app.locals.db;
}

/**
 * POST /api/groups
 * Create group with 2..20 initial members.
 */
function createGroup(req, res, next) {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ errors: { body: "Request body must be a JSON object" } });
    }

    const { name, members } = req.body;
    const errors = {};

    // Validate group name: 1..60 characters
    if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 60) {
      errors.name = "Group name is required and must be between 1 and 60 characters";
    }

    // Validate members: 2..20 unique names (case-insensitive)
    if (!Array.isArray(members)) {
      errors.members = "Members must be an array of member names";
    } else if (members.length < 2 || members.length > 20) {
      errors.members = "Group must have between 2 and 20 members";
    } else {
      const seen = new Set();
      let hasInvalidLength = false;
      let hasDuplicate = false;

      for (const m of members) {
        if (typeof m !== "string" || m.trim().length === 0 || m.trim().length > 40) {
          hasInvalidLength = true;
        } else {
          const lower = m.trim().toLowerCase();
          if (seen.has(lower)) {
            hasDuplicate = true;
          }
          seen.add(lower);
        }
      }

      if (hasInvalidLength) {
        errors.members = "Each member name must be between 1 and 40 characters";
      } else if (hasDuplicate) {
        errors.members = "Member names must be unique within the group";
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const groupId = generateGroupId();
    const createdAt = new Date().toISOString();
    const trimmedMembers = members.map((m) => m.trim());

    const group = repository.createGroupWithMembers(
      {
        id: groupId,
        name: name.trim(),
        members: trimmedMembers,
        createdAt,
      },
      getDb(req)
    );

    return res.status(201).json(group);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/groups/:gid
 * Retrieve group and members.
 */
function getGroup(req, res, next) {
  try {
    const { gid } = req.params;
    const group = repository.getGroupById(gid, getDb(req));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    return res.status(200).json(group);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/groups/:gid/members
 * Add member to group.
 */
function addMember(req, res, next) {
  try {
    const { gid } = req.params;
    const group = repository.getGroupById(gid, getDb(req));

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ errors: { body: "Request body must be a JSON object" } });
    }

    const { name } = req.body;
    if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 40) {
      return res.status(400).json({
        errors: { name: "Member name is required and must be between 1 and 40 characters" },
      });
    }

    try {
      const member = repository.addMember(gid, name.trim(), getDb(req));
      return res.status(201).json(member);
    } catch (err) {
      if (err.code === "MEMBER_LIMIT_EXCEEDED") {
        return res.status(400).json({ errors: { members: "Group cannot have more than 20 members" } });
      }
      if (err.code === "DUPLICATE_MEMBER") {
        return res.status(409).json({ error: "Member name already exists in this group" });
      }
      if (err.code === "GROUP_NOT_FOUND") {
        return res.status(404).json({ error: "Group not found" });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createGroup,
  getGroup,
  addMember,
};

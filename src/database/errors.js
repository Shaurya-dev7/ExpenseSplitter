/**
 * Lightweight domain errors for the database layer.
 * Maps low-level SQLite constraint failures to clean, predictable domain errors
 * with standard HTTP status codes, preventing database internals from leaking.
 */

class DatabaseError extends Error {
  /**
   * @param {string} message - Human-readable description.
   * @param {string} code - Machine-readable error code.
   * @param {number} statusCode - Corresponding HTTP status code.
   */
  constructor(message, code, statusCode) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Group does not exist. */
function groupNotFound(groupId) {
  return new DatabaseError(
    `Group '${groupId}' not found`,
    "GROUP_NOT_FOUND",
    404
  );
}

/** Expense does not exist or does not belong to group. */
function expenseNotFound(expenseId) {
  return new DatabaseError(
    `Expense '${expenseId}' not found`,
    "EXPENSE_NOT_FOUND",
    404
  );
}

/** Case-insensitive duplicate member name within group. */
function duplicateMember(name) {
  return new DatabaseError(
    name
      ? `Member '${name}' already exists in this group`
      : "Member name already exists in this group",
    "DUPLICATE_MEMBER",
    409
  );
}

/** Group already has 20 members. */
function memberLimitExceeded() {
  return new DatabaseError(
    "Group cannot have more than 20 members",
    "MEMBER_LIMIT_EXCEEDED",
    400
  );
}

/** Foreign key or relational reference violation. */
function invalidReference(detail) {
  return new DatabaseError(
    detail || "Referenced entity does not exist",
    "INVALID_REFERENCE",
    400
  );
}

/** Check constraint violation. */
function checkConstraintFailed(detail) {
  return new DatabaseError(
    detail || "Value violates database validation constraints",
    "CHECK_CONSTRAINT_FAILED",
    400
  );
}

/** Database locked or busy timeout exceeded. */
function databaseBusy() {
  return new DatabaseError(
    "Database is busy, please retry",
    "DATABASE_BUSY",
    503
  );
}

/**
 * Inspect a raw better-sqlite3 / SQLite error and map it
 * to a clean DatabaseError domain instance.
 * @param {Error} err
 * @returns {DatabaseError|null}
 */
function translateSqliteError(err) {
  if (!err) return null;
  const msg = err.message || "";
  const code = err.code || "";

  // Duplicate member unique constraint
  if (
    msg.includes("UNIQUE constraint failed: members.group_id, members.name") ||
    (code === "SQLITE_CONSTRAINT_UNIQUE" && msg.includes("members"))
  ) {
    return duplicateMember("");
  }
  if (code === "SQLITE_CONSTRAINT_UNIQUE" || msg.includes("UNIQUE constraint failed")) {
    return duplicateMember("");
  }

  // Foreign key failure
  if (
    code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
    msg.includes("FOREIGN KEY constraint failed")
  ) {
    return invalidReference("Referenced record does not exist in group");
  }

  // Check constraint failure
  if (
    code === "SQLITE_CONSTRAINT_CHECK" ||
    msg.includes("CHECK constraint failed")
  ) {
    return checkConstraintFailed(msg);
  }

  // Database busy / lock timeout
  if (code === "SQLITE_BUSY" || msg.includes("database is locked")) {
    return databaseBusy();
  }

  return null;
}

module.exports = {
  DatabaseError,
  groupNotFound,
  expenseNotFound,
  duplicateMember,
  memberLimitExceeded,
  invalidReference,
  checkConstraintFailed,
  databaseBusy,
  translateSqliteError,
};

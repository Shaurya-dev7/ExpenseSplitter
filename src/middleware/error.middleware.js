const { ValidationError } = require("../services/split.service");
const { DatabaseError } = require("../database/errors");

/**
 * Handle malformed JSON body errors from express.json().
 */
function jsonSyntaxErrorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }
  return next(err);
}

/**
 * Handle 404 for unmatched API routes.
 */
function apiNotFoundHandler(req, res) {
  return res.status(404).json({ error: "Endpoint not found" });
}

/**
 * Global application error handler.
 * Maps known domain and database errors to HTTP responses without leaking stack traces.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Validation errors -> 400 with { errors: { field: message } }
  if (err instanceof ValidationError) {
    return res.status(400).json({ errors: err.errors });
  }

  // Database domain errors
  if (err instanceof DatabaseError) {
    if (err.code === "DUPLICATE_MEMBER") {
      return res.status(409).json({ error: "Member name already exists in this group" });
    }
    if (err.code === "GROUP_NOT_FOUND") {
      return res.status(404).json({ error: "Group not found" });
    }
    if (err.code === "EXPENSE_NOT_FOUND") {
      return res.status(404).json({ error: "Expense not found" });
    }
    if (err.code === "MEMBER_LIMIT_EXCEEDED") {
      return res.status(400).json({ errors: { members: "Group cannot have more than 20 members" } });
    }
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  // Unknown internal server error -> 500 without leaking details
  if (process.env.NODE_ENV !== "test") {
    console.error("Unhandled error:", err);
  }

  return res.status(500).json({ error: "Internal server error" });
}

module.exports = {
  jsonSyntaxErrorHandler,
  apiNotFoundHandler,
  errorHandler,
};

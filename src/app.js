const express = require("express");
const path = require("path");
const db = require("./database/db");
const { initSchema } = require("./database/schema");

const groupRoutes = require("./routes/group.routes");
const memberRoutes = require("./routes/member.routes");
const expenseRoutes = require("./routes/expense.routes");
const paymentRoutes = require("./routes/payment.routes");
const balanceRoutes = require("./routes/balance.routes");

const {
  jsonSyntaxErrorHandler,
  apiNotFoundHandler,
  errorHandler,
} = require("./middleware/error.middleware");

// Auto-initialize SQLite database schema on startup (PRD 4.3)
initSchema();

const app = express();

// Make default database instance accessible to controllers
app.locals.db = db;

// Body parsing with malformed JSON handler
app.use(express.json());
app.use(jsonSyntaxErrorHandler);

// Static frontend serving
app.use(express.static(path.join(__dirname, "../public")));

// Basic health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "group-expense-splitter" });
});

// REST API Contract (mounted under /api/groups)
app.use("/api/groups", groupRoutes);
app.use("/api/groups", memberRoutes);
app.use("/api/groups", expenseRoutes);
app.use("/api/groups", paymentRoutes);
app.use("/api/groups", balanceRoutes);

// Catch unmatched /api routes
app.use("/api", apiNotFoundHandler);

// Central error handler
app.use(errorHandler);

module.exports = app;

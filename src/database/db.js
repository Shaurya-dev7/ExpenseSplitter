const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

/**
 * Create a new better-sqlite3 connection with hardened PRAGMAs.
 * @param {string} [dbPath] - File path or ":memory:".
 * @returns {import("better-sqlite3").Database}
 */
function createDb(dbPath) {
  const resolvedPath =
    dbPath ||
    process.env.DB_PATH ||
    path.join(__dirname, "../../data", "expenses.db");

  const isMemory = resolvedPath === ":memory:";

  if (!isMemory) {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const database = new Database(resolvedPath);

  // Mandatory: enforce referential integrity across all modes
  database.pragma("foreign_keys = ON");

  // Concurrency: wait up to 5000ms on lock contention before throwing SQLITE_BUSY
  database.pragma("busy_timeout = 5000");

  if (!isMemory) {
    // WAL mode for non-blocking concurrent reads and writes
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = NORMAL");
  }

  return database;
}

// Default singleton used across the application runtime
const db = createDb();

/**
 * Close a database connection gracefully and idempotently.
 * @param {import("better-sqlite3").Database} [database]
 */
function closeDb(database = db) {
  if (database && database.open) {
    database.close();
  }
}

// Graceful process shutdown cleanup
process.once("SIGINT", () => {
  closeDb(db);
});
process.once("SIGTERM", () => {
  closeDb(db);
});

module.exports = db;
module.exports.createDb = createDb;
module.exports.closeDb = closeDb;

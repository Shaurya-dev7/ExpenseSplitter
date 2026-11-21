const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

/**
 * Create a new better-sqlite3 connection with hardened PRAGMAs.
 * @param {string} [dbPath] - File path or ":memory:".
 * @returns {import("better-sqlite3").Database}
 */
function createDb(dbPath) {
  const isMemory = dbPath === ":memory:";

  if (!isMemory) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Mandatory: enforce referential integrity in ALL modes
  db.pragma("foreign_keys = ON");

  // Concurrency: honour busy_timeout instead of failing immediately
  db.pragma("busy_timeout = 5000");

  if (!isMemory) {
    // File-mode performance: WAL + relaxed sync
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
  }

  return db;
}

/**
 * Close a database connection gracefully.
 * @param {import("better-sqlite3").Database} database
 */
function closeDb(database) {
  if (database && database.open) {
    database.close();
  }
}

// Default singleton used by the application
const defaultPath =
  process.env.DB_PATH ||
  path.join(__dirname, "../../data", "expenses.db");

const db = createDb(defaultPath);

module.exports = db;
module.exports.createDb = createDb;
module.exports.closeDb = closeDb;

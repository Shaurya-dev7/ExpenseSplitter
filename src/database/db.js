const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "../../data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "expenses.db");

if (dbPath !== ":memory:") {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

if (dbPath !== ":memory:") {
  db.pragma("journal_mode = WAL");
}

module.exports = db;

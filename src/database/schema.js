const db = require("./db");

function initSchema(targetDb = db) {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS members (
      group_id TEXT NOT NULL,
      id INTEGER NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (group_id, id),

      UNIQUE (group_id, name),

      FOREIGN KEY (group_id)
        REFERENCES groups(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      paid_by INTEGER NOT NULL,
      splits TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (group_id, paid_by)
        REFERENCES members(group_id, id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      from_member INTEGER NOT NULL,
      to_member INTEGER NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CHECK (from_member != to_member),

      FOREIGN KEY (group_id, from_member)
        REFERENCES members(group_id, id),

      FOREIGN KEY (group_id, to_member)
        REFERENCES members(group_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_group
    ON expenses(group_id);

    CREATE INDEX IF NOT EXISTS idx_payments_group
    ON payments(group_id);
  `);
  return targetDb;
}

if (require.main === module) {
  initSchema();
  console.log("Database tables created successfully!");
}

module.exports = { initSchema };

const db = require("./db");

/**
 * Initialise all tables and indexes.
 * Safe to call repeatedly (IF NOT EXISTS).
 * @param {import("better-sqlite3").Database} [targetDb]
 */
function initSchema(targetDb = db) {
  targetDb.exec(`
    -- ===================== groups =====================
    CREATE TABLE IF NOT EXISTS groups (
      id         TEXT PRIMARY KEY CHECK (length(id) >= 10),
      name       TEXT NOT NULL    CHECK (length(trim(name)) BETWEEN 1 AND 60),
      created_at TEXT NOT NULL
    );

    -- ===================== members =====================
    CREATE TABLE IF NOT EXISTS members (
      group_id   TEXT    NOT NULL,
      id         INTEGER NOT NULL CHECK (typeof(id) = 'integer' AND id >= 1 AND id <= 20),
      name       TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
      created_at TEXT    NOT NULL,

      PRIMARY KEY (group_id, id),
      UNIQUE (group_id, name COLLATE NOCASE),

      FOREIGN KEY (group_id)
        REFERENCES groups(id)
        ON DELETE CASCADE
    );

    -- ===================== expenses =====================
    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id    TEXT    NOT NULL,
      description TEXT    NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 100),
      amount      INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount >= 1 AND amount <= 1000000000),
      paid_by     INTEGER NOT NULL CHECK (typeof(paid_by) = 'integer'),
      splits      TEXT    NOT NULL,
      created_at  TEXT    NOT NULL,

      FOREIGN KEY (group_id)
        REFERENCES groups(id)
        ON DELETE CASCADE,
      FOREIGN KEY (group_id, paid_by)
        REFERENCES members(group_id, id)
    );

    -- ===================== payments =====================
    CREATE TABLE IF NOT EXISTS payments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id    TEXT    NOT NULL,
      from_member INTEGER NOT NULL CHECK (typeof(from_member) = 'integer'),
      to_member   INTEGER NOT NULL CHECK (typeof(to_member)   = 'integer'),
      amount      INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount >= 1),
      created_at  TEXT    NOT NULL,

      CHECK (from_member != to_member),

      FOREIGN KEY (group_id)
        REFERENCES groups(id)
        ON DELETE CASCADE,
      FOREIGN KEY (group_id, from_member)
        REFERENCES members(group_id, id),
      FOREIGN KEY (group_id, to_member)
        REFERENCES members(group_id, id)
    );

    -- ===================== indexes =====================
    CREATE INDEX IF NOT EXISTS idx_expenses_group_id
      ON expenses(group_id, id);

    CREATE INDEX IF NOT EXISTS idx_payments_group_id
      ON payments(group_id, id);
  `);
  return targetDb;
}

if (require.main === module) {
  initSchema();
  console.log("Database tables created successfully!");
}

module.exports = { initSchema };

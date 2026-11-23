import { HttpError } from '../utils/errors.js';
import { generateUniqueUsername } from '../utils/username.js';
import { hashPassword, generateSessionToken, hashToken } from '../services/auth.service.js';

/**
 * Creates an SQLite-backed Auth repository for users and bearer sessions.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createAuthRepository(db) {
  // Ensure tables exist with strict Problem C4 schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  function existsUsername(username) {
    const row = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username);
    return !!row;
  }

  function findUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
  }

  function findUserByIdentifier(identifier) {
    const clean = (identifier || '').replace(/^@/, '').trim();
    return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE').get(clean, clean);
  }

  function findUserById(id) {
    const row = db.prepare('SELECT id, email, username, name, created_at FROM users WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: Number(row.id),
      email: row.email,
      username: row.username,
      name: row.name,
      createdAt: row.created_at
    };
  }

  return {
    existsUsername,
    findUserByEmail,
    findUserByIdentifier,
    findUserById,

    async createUser({ email, password, name, username }) {
      // Check duplicate email upfront
      const existingEmail = findUserByEmail(email);
      if (existingEmail) {
        throw new HttpError(409, 'Email already registered');
      }

      const passwordHash = hashPassword(password);
      const now = new Date().toISOString();

      if (username) {
        const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
        if (existsUsername(cleanUser)) {
          throw new HttpError(409, 'Username is already taken', { username: 'Username is already taken' });
        }

        try {
          const res = db.prepare(`
            INSERT INTO users (email, username, name, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(email.toLowerCase(), cleanUser, name || '', passwordHash, now);

          return {
            id: Number(res.lastInsertRowid),
            email: email.toLowerCase(),
            username: cleanUser,
            name: name || ''
          };
        } catch (err) {
          const msg = (err.message || '').toLowerCase();
          if (msg.includes('users.email')) {
            throw new HttpError(409, 'Email already registered');
          }
          if (msg.includes('users.username') || msg.includes('unique constraint')) {
            throw new HttpError(409, 'Username is already taken', { username: 'Username is already taken' });
          }
          throw err;
        }
      }

      // Retry up to 5 times if SQLite throws UNIQUE constraint on users.username
      for (let attempt = 1; attempt <= 5; attempt++) {
        const autoUser = await generateUniqueUsername(email, (candidate) => existsUsername(candidate));
        try {
          const res = db.prepare(`
            INSERT INTO users (email, username, name, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(email.toLowerCase(), autoUser, name || '', passwordHash, now);

          return {
            id: Number(res.lastInsertRowid),
            email: email.toLowerCase(),
            username: autoUser,
            name: name || ''
          };
        } catch (err) {
          const msg = (err.message || '').toLowerCase();
          if (msg.includes('users.email')) {
            throw new HttpError(409, 'Email already registered');
          }
          if (msg.includes('users.username') || msg.includes('unique constraint')) {
            if (attempt === 5) {
              throw new HttpError(409, 'Failed to assign unique username. Please try again.');
            }
            continue;
          }
          throw err;
        }
      }
    },

    async createSession(userId) {
      const sess = generateSessionToken(userId);
      db.prepare(`
        INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(sess.tokenHash, sess.userId, sess.expiresAt, sess.createdAt);

      return {
        token: sess.rawToken,
        expiresIn: sess.expiresIn
      };
    },

    async validateSession(rawToken) {
      if (!rawToken || typeof rawToken !== 'string') return null;
      const tokenHash = hashToken(rawToken);
      const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
      if (!row) return null;

      // Check expiry
      if (Date.parse(row.expires_at) < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
        return null;
      }

      const user = findUserById(row.user_id);
      if (!user) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
        return null;
      }

      return {
        user,
        tokenHash
      };
    },

    async deleteSession(rawToken) {
      if (!rawToken || typeof rawToken !== 'string') return false;
      const tokenHash = hashToken(rawToken);
      const res = db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return res.changes > 0;
    }
  };
}

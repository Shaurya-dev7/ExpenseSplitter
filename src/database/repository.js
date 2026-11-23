import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../utils/errors.js';
import { createAuthRepository } from './auth.repository.js';

export function isUserAuthorizedForGroup(group, user) {
  if (!group || !user) return false;
  // 1. Creator check
  if (user.id != null && group.createdByUserId != null && group.createdByUserId === user.id) {
    return true;
  }
  // 2. Bound member check (m.userId === user.id)
  if (user.id != null && Array.isArray(group.members) && group.members.some((m) => m.userId === user.id)) {
    return true;
  }
  // 3. Legacy fallback for pre-existing groups without userId
  const username = typeof user.username === 'string' ? user.username.trim().toLowerCase() : '';
  const name = typeof user.name === 'string' ? user.name.trim().toLowerCase() : '';
  if (Array.isArray(group.members)) {
    return group.members.some((m) => {
      const mName = typeof m.name === 'string' ? m.name.trim().toLowerCase() : '';
      return (username && mName === username) || (name && mName === name) || mName === 'you';
    });
  }
  return false;
}

export function createRepository(supabase) {
  return {
    async get(id) {
      const { data, error } = await supabase.from('c4_groups').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, 'Group not found. Check your group link.');
      if (data && data.isActive === undefined) data.isActive = true;
      return data;
    },
    async create(group) {
      const g = { ...group, isActive: group.isActive !== false };
      const { data, error } = await supabase.from('c4_groups').insert(g).select('*').single();
      if (error) throw error;
      if (data && data.isActive === undefined) data.isActive = true;
      return data;
    },
    async change(id, mutate) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const current = await this.get(id);
        const next = structuredClone(current);
        const result = mutate(next);
        const { data, error } = await supabase.from('c4_groups').update({ ...next, version: current.version + 1 }).eq('id', id).eq('version', current.version).select('*').maybeSingle();
        if (error) throw error;
        if (data) return result;
      }
      throw new HttpError(409, 'The group is busy. Please try again.');
    }
  };
}

export function createLocalRepository(dbPath) {
  const file = dbPath || path.resolve(process.cwd(), 'fairshare.db');
  const db = new DatabaseSync(file);

  db.exec(`PRAGMA foreign_keys = ON;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS c4_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      members TEXT NOT NULL,
      expenses TEXT NOT NULL,
      payments TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      next_expense INTEGER NOT NULL DEFAULT 1,
      next_payment INTEGER NOT NULL DEFAULT 1,
      created_by_user_id INTEGER,
      created_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  try {
    db.exec(`ALTER TABLE c4_groups ADD COLUMN created_by_user_id INTEGER;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE c4_groups ADD COLUMN created_at TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE c4_groups ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
  } catch {}

  const auth = createAuthRepository(db);

  function deserialize(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      members: JSON.parse(row.members),
      expenses: JSON.parse(row.expenses),
      payments: JSON.parse(row.payments),
      version: row.version,
      next_expense: row.next_expense,
      next_payment: row.next_payment,
      createdByUserId: row.created_by_user_id ?? null,
      createdAt: row.created_at || new Date().toISOString(),
      isActive: row.is_active === undefined ? (row.isActive !== false) : Boolean(row.is_active)
    };
  }

  return {
    db,
    auth,
    async listAll() {
      const rows = db.prepare('SELECT * FROM c4_groups ORDER BY rowid DESC LIMIT 50').all();
      return rows.map(deserialize);
    },
    async listGroupsForUser(user) {
      if (!user) return [];
      const rows = db.prepare('SELECT * FROM c4_groups ORDER BY rowid DESC').all();
      return rows.map(deserialize).filter((g) => isUserAuthorizedForGroup(g, user));
    },
    async listForUser(user) {
      return this.listGroupsForUser(user);
    },
    async get(id) {
      const row = db.prepare('SELECT * FROM c4_groups WHERE id = ?').get(id);
      if (!row) throw new HttpError(404, 'Group not found. Check your group link.');
      return deserialize(row);
    },
    async create(group) {
      const now = group.createdAt || group.created_at || new Date().toISOString();
      const createdByUserId = group.createdByUserId ?? group.created_by_user_id ?? null;
      const members = (group.members || []).map((m, idx) => {
        const cloned = { ...m };
        if (createdByUserId != null && !cloned.userId && (idx === 0 || /^(you|creator|me)$/i.test(cloned.name?.trim()))) {
          cloned.userId = createdByUserId;
        }
        return cloned;
      });
      const isActive = group.isActive !== false;
      const g = {
        id: group.id,
        name: group.name,
        members,
        expenses: group.expenses || [],
        payments: group.payments || [],
        version: group.version ?? 0,
        next_expense: group.next_expense ?? 1,
        next_payment: group.next_payment ?? 1,
        createdByUserId,
        createdAt: now,
        isActive
      };
      db.prepare(`
        INSERT INTO c4_groups (id, name, members, expenses, payments, version, next_expense, next_payment, created_by_user_id, created_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        g.id,
        g.name,
        JSON.stringify(g.members),
        JSON.stringify(g.expenses),
        JSON.stringify(g.payments),
        g.version,
        g.next_expense,
        g.next_payment,
        g.createdByUserId,
        g.createdAt,
        g.isActive ? 1 : 0
      );
      return g;
    },
    async change(id, mutate) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const current = await this.get(id);
        const next = structuredClone(current);
        const result = mutate(next);
        const nextIsActive = next.isActive !== false ? 1 : 0;
        const res = db.prepare(`
          UPDATE c4_groups
          SET name = ?, members = ?, expenses = ?, payments = ?, version = ?, next_expense = ?, next_payment = ?, is_active = ?
          WHERE id = ? AND version = ?
        `).run(
          next.name,
          JSON.stringify(next.members),
          JSON.stringify(next.expenses),
          JSON.stringify(next.payments),
          current.version + 1,
          next.next_expense,
          next.next_payment,
          nextIsActive,
          id,
          current.version
        );
        if (res.changes > 0) return result;
      }
      throw new HttpError(409, 'The group is busy. Please try again.');
    }
  };
}

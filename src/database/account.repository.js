import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../utils/errors.js';
import { deriveAccountPassword } from '../utils/account-password.js';
import { sealAccountSession, openAccountSession, sessionHash } from '../utils/account-session.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const publicUser = profile => ({ id: profile.id, username: profile.username, email: profile.email });
function client(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {})
  });
}
function check(error) { if (error) { if (error.code === '23505') throw new HttpError(409, 'Username or email is already registered'); throw error; } }
const alias = username => `${username.toLowerCase()}@fairshare-login.invalid`;
function nativeExpiry(token) {
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { throw new HttpError(401, 'Invalid or expired session'); }
  if (!Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000 || !Number.isFinite(claims.iat) || claims.iat > Date.now() / 1000 + 60 || Date.now() / 1000 - claims.iat > 86400) throw new HttpError(401, 'Invalid or expired session');
  return new Date(Math.min(claims.exp * 1000, (claims.iat + 86400) * 1000)).toISOString();
}
export function createAccountRepository(supabase) {
  async function issueSession(nativeToken, authId, user) {
    const session = sealAccountSession(nativeToken, authId, nativeExpiry(nativeToken));
    const { error } = await supabase.from('c4_account_sessions').insert(session.row).select('*'); check(error);
    return { token: session.token, expiresIn: Math.max(1, Math.floor((Date.parse(session.row.expires_at) - Date.now()) / 1000)), user };
  }
  async function directory(username) {
    const { data, error } = await supabase.from('c4_username_directory').select('*').eq('username_key', username.toLowerCase()).maybeSingle(); check(error); return data;
  }
  async function emailEntry(email) {
    const { data, error } = await supabase.from('c4_email_directory').select('*').eq('email_hash', hash(email.toLowerCase())).maybeSingle(); check(error); return data;
  }
  async function profileFor(nativeUser, scoped, expected) {
    let { data: profile, error } = await scoped.from('c4_account_profiles').select('*').eq('auth_id', nativeUser.id).maybeSingle(); check(error);
    const metadata = nativeUser.user_metadata || {};
    let username = expected?.username || metadata.username || profile?.username;
    const email = (expected?.email || metadata.contact_email || nativeUser.email || '').trim().toLowerCase();
    if (profile?.active) return { ...profile, username, email };
    if (!username || !/^[A-Za-z0-9_]{3,30}$/.test(username)) {
      const stem = (nativeUser.email || 'friend').split('@')[0].replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) || 'friend';
      username = `${stem}_${randomBytes(3).toString('hex')}`;
    }
    if (!profile) {
      const existing = await directory(username);
      if (existing && existing.auth_id !== nativeUser.id) throw new HttpError(409, 'Username is already registered');
      // Contact email and saved friends live only in the provider's private user
      // record. Public directory rows never contain plaintext contact emails.
      const result = await scoped.from('c4_account_profiles').insert({ auth_id: nativeUser.id, username, email: '', active: false }).select('*').single(); check(result.error); profile = result.data;
    }
    const name = await directory(profile.username);
    if (name && name.auth_id !== nativeUser.id) throw new HttpError(409, 'Username is already registered');
    if (!name) { const result = await scoped.from('c4_username_directory').insert({ username_key: profile.username.toLowerCase(), username: profile.username, auth_id: nativeUser.id, profile_id: profile.id }).select('*'); check(result.error); }
    const e = await emailEntry(email);
    if (e && e.auth_id !== nativeUser.id) throw new HttpError(409, 'Email is already registered');
    if (!e) { const result = await scoped.from('c4_email_directory').insert({ email_hash: hash(email), auth_id: nativeUser.id, username_key: profile.username.toLowerCase() }).select('*'); check(result.error); }
    const result = await scoped.from('c4_account_profiles').update({ active: true }).eq('auth_id', nativeUser.id).select('*').single(); check(result.error); return { ...result.data, username, email };
  }
  const saved = context => Array.isArray(context.nativeUser.user_metadata?.fairshare_friends) ? context.nativeUser.user_metadata.fairshare_friends.filter(friend => Number.isSafeInteger(friend.id) && friend.id > 0 && /^[A-Za-z0-9_]{3,30}$/.test(friend.username) && typeof friend.authId === 'string') : [];
  async function saveFriends(context, friends) {
    // Use the provider's authenticated user endpoint: the managed SQL tables have
    // permissive provisioning policies, so private lists must not be stored there.
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { method: 'PUT', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${context.nativeToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { fairshare_friends: friends } }) });
    if (!response.ok) throw new HttpError(response.status === 401 || response.status === 400 ? 401 : 503, response.status === 401 || response.status === 400 ? 'Invalid or expired session' : 'Unable to save friends. Please try again.');
  }
  return {
    async register({ username, email, password }) {
      if (await directory(username)) throw new HttpError(409, 'Username is already registered');
      if (await emailEntry(email)) throw new HttpError(409, 'Email is already registered');
      const provider = client();
      const { data, error } = await provider.auth.signUp({ email: alias(username), password: randomBytes(32).toString('base64url'), options: { data: { username, contact_email: email, password_scheme: 'scrypt-native-id-v1' } } });
      if (error || !data.user || data.user.identities?.length === 0) {
        if (/already|registered|exists/i.test(error?.message || '') || data.user?.identities?.length === 0) throw new HttpError(409, 'Username or email is already registered');
        throw new HttpError(error?.status === 429 ? 429 : 400, error?.status === 429 ? 'Too many attempts. Please try again later.' : 'Unable to register this account.');
      }
      if (!data.session) throw new HttpError(503, 'Account confirmation is required by the authentication provider.');
      const updated = await provider.auth.updateUser({ password: deriveAccountPassword(password, data.user.id) });
      if (updated.error) throw new HttpError(400, 'Invalid fields', { password: 'Unable to securely configure this password. Please try again.' });
      try { return publicUser(await profileFor(updated.data.user, client(data.session.access_token), { username, email })); }
      finally { await provider.auth.signOut({ scope: 'local' }); }
    },
    async login(identifier, password) {
      let name = identifier.replace(/^@/, '');
      if (identifier.includes('@') && !identifier.startsWith('@')) { const entry = await emailEntry(identifier.toLowerCase()); name = entry?.username_key || '__unknown_account__'; }
      const entry = await directory(name);
      const provider = client();
      let result = await provider.auth.signInWithPassword({ email: alias(name), password: deriveAccountPassword(password, entry?.auth_id || 'unknown-account') });
      let legacy = false;
      if (result.error && result.error.status !== 429) { result = await provider.auth.signInWithPassword({ email: alias(name), password }); legacy = true; }
      const { data, error } = result;
      if (error || !data.session || !data.user) throw new HttpError(401, 'Invalid credentials');
      if (legacy && data.user.user_metadata?.password_scheme === 'scrypt-native-id-v1') { await provider.auth.signOut({ scope: 'local' }); throw new HttpError(401, 'Invalid credentials'); }
      let profile;
      try { profile = await profileFor(data.user, client(data.session.access_token)); }
      catch (error) { if (error.status === 409) throw new HttpError(401, 'Invalid credentials'); throw error; }
      if (identifier.includes('@') && !identifier.startsWith('@') && profile.email.toLowerCase() !== identifier.toLowerCase()) throw new HttpError(401, 'Invalid credentials');
      return issueSession(data.session.access_token, data.user.id, publicUser(profile));
    },
    async authorize(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, 'Invalid or expired session');
      const { data: row, error } = await supabase.from('c4_account_sessions').select('*').eq('token_hash', sessionHash(token)).maybeSingle(); check(error);
      const nativeToken = openAccountSession(token, row);
      const context = await this.authorizeNative(nativeToken);
      if (context.authId !== row.user_id) throw new HttpError(401, 'Invalid or expired session');
      return { ...context, token, sessionHash: row.token_hash };
    },
    async exchange(nativeToken) { const context = await this.authorizeNative(nativeToken); return issueSession(nativeToken, context.authId, context.user); },
    async authorizeNative(token) {
      const scoped = client(token);
      const { data, error } = await scoped.auth.getUser(token);
      if (error || !data.user) throw new HttpError(401, 'Invalid or expired session');
      const expiresAt = nativeExpiry(token);
      const profile = await profileFor(data.user, scoped);
      return { nativeToken: token, client: scoped, authId: data.user.id, nativeUser: data.user, user: publicUser(profile), expiresAt };
    },
    async logout(context) {
      const { error } = await context.client.auth.admin.signOut(context.nativeToken, 'local');
      if (error) throw new HttpError(503, 'Unable to invalidate this session. Please try again.');
      const result = await supabase.from('c4_account_sessions').delete().eq('token_hash', context.sessionHash); check(result.error);
    },
    async listFriends(context) {
      return saved(context).map(friend => ({ id: friend.id, username: friend.username })).sort((a, b) => a.username.localeCompare(b.username));
    },
    async addFriend(context, username) {
      const friend = await directory(username);
      if (!friend) throw new HttpError(404, 'Username not found');
      if (friend.auth_id === context.authId) throw new HttpError(400, 'You cannot add yourself');
      const friends = saved(context);
      if (friends.some(entry => entry.authId === friend.auth_id || entry.username.toLowerCase() === username.toLowerCase())) throw new HttpError(409, 'This friend is already saved');
      if (friends.length >= 500) throw new HttpError(400, 'The saved-friends limit has been reached');
      await saveFriends(context, [...friends, { id: friend.profile_id, username: friend.username, authId: friend.auth_id }]);
      return { id: friend.profile_id, username: friend.username };
    },
    async removeFriend(context, id) {
      const friends = saved(context);
      if (!friends.some(friend => friend.id === id)) throw new HttpError(404, 'Friend not found');
      await saveFriends(context, friends.filter(friend => friend.id !== id));
    }
  };
}

export function createLocalAccountRepository(dbPath) {
  const file = dbPath || path.resolve(process.cwd(), 'fairshare.db');
  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE IF NOT EXISTS c4_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL,
      verifier TEXT NOT NULL,
      friends TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS c4_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  // Seed demo accounts if not existing
  const findUser = db.prepare('SELECT * FROM c4_users WHERE username = ?');
  if (!findUser.get('fairshare_demo')) {
    const salt1 = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO c4_users (username, email, salt, verifier, friends) VALUES (?, ?, ?, ?, ?)').run(
      'fairshare_demo',
      'demo@fairshare.example',
      salt1,
      deriveAccountPassword('Fairshare2026!', salt1),
      JSON.stringify([{ id: 2, username: 'travel_friend' }])
    );
  }
  if (!findUser.get('travel_friend')) {
    const salt2 = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO c4_users (username, email, salt, verifier, friends) VALUES (?, ?, ?, ?, ?)').run(
      'travel_friend',
      'friend@fairshare.example',
      salt2,
      deriveAccountPassword('TravelFriend2026!', salt2),
      '[]'
    );
  }

  const digest = value => createHash('sha256').update(value).digest('hex');

  return {
    async register({ username, email, password }) {
      const existing = db.prepare('SELECT * FROM c4_users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)').get(username, email);
      if (existing) throw new HttpError(409, 'Username or email is already registered');
      const salt = randomBytes(16).toString('hex');
      const verifier = deriveAccountPassword(password, salt);
      const res = db.prepare('INSERT INTO c4_users (username, email, salt, verifier, friends) VALUES (?, ?, ?, ?, ?)').run(
        username,
        email.toLowerCase(),
        salt,
        verifier,
        '[]'
      );
      return { id: Number(res.lastInsertRowid), username, email: email.toLowerCase() };
    },
    async login(identifier, password) {
      const clean = identifier.replace(/^@/, '');
      const user = db.prepare('SELECT * FROM c4_users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)').get(clean, clean);
      if (!user) {
        deriveAccountPassword(password, 'unknown-account');
        throw new HttpError(401, 'Invalid credentials');
      }
      const supplied = Buffer.from(deriveAccountPassword(password, user.salt), 'hex');
      const expected = Buffer.from(user.verifier, 'hex');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw new HttpError(401, 'Invalid credentials');
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      db.prepare('INSERT OR REPLACE INTO c4_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
        digest(token),
        user.id,
        expiresAt
      );
      const safe = { id: user.id, username: user.username, email: user.email };
      return { token, expiresIn: 86400, user: safe };
    },
    async authorize(token) {
      if (!token) throw new HttpError(401, 'Authentication required');
      const session = db.prepare('SELECT * FROM c4_sessions WHERE token_hash = ?').get(digest(token));
      if (!session) throw new HttpError(401, 'Invalid or expired session');
      if (Date.parse(session.expires_at) < Date.now()) {
        db.prepare('DELETE FROM c4_sessions WHERE token_hash = ?').run(digest(token));
        throw new HttpError(401, 'Invalid or expired session');
      }
      const user = db.prepare('SELECT id, username, email FROM c4_users WHERE id = ?').get(session.user_id);
      if (!user) throw new HttpError(401, 'Invalid or expired session');
      return { token, user: { id: user.id, username: user.username, email: user.email } };
    },
    async logout(context) {
      db.prepare('DELETE FROM c4_sessions WHERE token_hash = ?').run(digest(context.token));
    },
    async listFriends(context) {
      const user = db.prepare('SELECT friends FROM c4_users WHERE id = ?').get(context.user.id);
      return user ? JSON.parse(user.friends) : [];
    },
    async addFriend(context, username) {
      const clean = username.replace(/^@/, '');
      const friend = db.prepare('SELECT id, username FROM c4_users WHERE LOWER(username) = LOWER(?)').get(clean);
      if (!friend) throw new HttpError(404, 'Username not found');
      if (friend.id === context.user.id) throw new HttpError(400, 'You cannot add yourself');
      const user = db.prepare('SELECT friends FROM c4_users WHERE id = ?').get(context.user.id);
      const friends = user ? JSON.parse(user.friends) : [];
      if (friends.some(f => f.id === friend.id)) throw new HttpError(409, 'This friend is already saved');
      const safeFriend = { id: friend.id, username: friend.username };
      friends.push(safeFriend);
      db.prepare('UPDATE c4_users SET friends = ? WHERE id = ?').run(JSON.stringify(friends), context.user.id);
      return safeFriend;
    },
    async removeFriend(context, id) {
      const user = db.prepare('SELECT friends FROM c4_users WHERE id = ?').get(context.user.id);
      const friends = user ? JSON.parse(user.friends) : [];
      const filtered = friends.filter(f => f.id !== id);
      if (filtered.length === friends.length) throw new HttpError(404, 'Friend not found');
      db.prepare('UPDATE c4_users SET friends = ? WHERE id = ?').run(JSON.stringify(filtered), context.user.id);
    },
    async exchange(token) {
      throw new HttpError(501, 'Google auth requires managed provider.');
    }
  };
}

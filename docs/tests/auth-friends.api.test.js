import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAccountService } from '../src/services/account.service.js';
import { HttpError } from '../src/utils/errors.js';
import { deriveAccountPassword } from '../src/utils/account-password.js';
import { sealAccountSession, openAccountSession, sessionHash } from '../src/utils/account-session.js';
// Isolated provider/repository double for HTTP tests. The real scrypt credential
// derivation is tested separately below; provider verification is checked live.
function setup() {
  const users = [], sessions = new Map(), lists = new Map(), groups = new Map();
  const digest = value => createHash('sha256').update(value).digest('hex');
  const repository = {
    async register(body) { if (users.some(u => u.username.toLowerCase() === body.username.toLowerCase() || u.email === body.email)) throw new HttpError(409, 'Username or email is already registered'); const user = { id: users.length + 1, username: body.username, email: body.email }; const testSalt = randomBytes(16).toString('hex'); users.push({ ...user, testSalt, testVerifier: deriveAccountPassword(body.password, testSalt) }); return user; },
    async login(identifier, password) { const user = users.find(u => u.username.toLowerCase() === identifier.toLowerCase() || u.email === identifier.toLowerCase()); const supplied = Buffer.from(deriveAccountPassword(password, user?.testSalt || 'unknown-account'), 'hex'); if (!user || !timingSafeEqual(supplied, Buffer.from(user.testVerifier, 'hex'))) throw new HttpError(401, 'Invalid credentials'); const token = randomBytes(32).toString('base64url'); const safe = { id: user.id, username: user.username, email: user.email }; sessions.set(digest(token), safe); return { token, expiresIn: 3600, user: safe }; },
    async authorize(token) { const user = sessions.get(digest(token)); if (!user) throw new HttpError(401, 'Invalid or expired session'); return { token, user }; },
    async logout(context) { sessions.delete(digest(context.token)); },
    async listFriends(context) { return [...(lists.get(context.user.id)?.values() || [])]; },
    async addFriend(context, username) { const friend = users.find(u => u.username.toLowerCase() === username.toLowerCase()); if (!friend) throw new HttpError(404, 'Username not found'); if (friend.id === context.user.id) throw new HttpError(400, 'You cannot add yourself'); const list = lists.get(context.user.id) || new Map(); if (list.has(friend.id)) throw new HttpError(409, 'This friend is already saved'); const safe = { id: friend.id, username: friend.username }; list.set(friend.id, safe); lists.set(context.user.id, list); return safe; },
    async removeFriend(context, id) { if (!lists.get(context.user.id)?.delete(id)) throw new HttpError(404, 'Friend not found'); }
  };
  const groupRepo = { async create(group) { groups.set(group.id, group); return group; }, async get(id) { if (!groups.has(id)) throw new HttpError(404, 'Group not found'); return groups.get(id); }, async change(id, mutate) { return mutate(await this.get(id)); } };
  return request(createApp(groupRepo, createAccountService(repository)));
}
const account = (username = 'Asha', email = 'asha@example.test') => ({ username, email, password: 'GoodPassword2026' });
async function register(api, username = 'Asha', email = 'asha@example.test') { return (await api.post('/api/auth/register').send(account(username, email)).expect(201)).body; }
async function login(api, identifier = 'Asha') { return (await api.post('/api/auth/login').send({ identifier, password: 'GoodPassword2026' }).expect(200)).body; }
test('optional accounts: registration validates every field and never returns passwords', async () => {
  const api = setup();
  const invalid = await api.post('/api/auth/register').send({ username: 'x!', email: 'invalid', password: 'onlyletters' }).expect(400); assert.deepEqual(Object.keys(invalid.body.errors).sort(), ['email', 'password', 'username']);
  for (const username of ['', 'ab', 'x'.repeat(31), 'has space', 'bad-name']) await api.post('/api/auth/register').send({ ...account(), username }).expect(400);
  for (const password of ['', 'short1', 'lettersOnly', '12345678', 'x'.repeat(129) + '1']) await api.post('/api/auth/register').send({ ...account(), password }).expect(400);
  for (const email of ['', 'a@b', 'x'.repeat(116) + '@a.co']) await api.post('/api/auth/register').send({ ...account(), email }).expect(400);
  const user = (await api.post('/api/auth/register').send({ ...account(), username: ' Asha ', email: ' ASHA@EXAMPLE.TEST ' }).expect(201)).body;
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'username']); assert.equal(user.email, 'asha@example.test'); assert.equal(user.username, 'Asha');
});
test('optional accounts: accepts inclusive username, email and password boundaries', async () => {
  const api = setup();
  await api.post('/api/auth/register').send({ username: 'X'.repeat(30), email: 'a'.repeat(115) + '@b.co', password: '1234567A' }).expect(201);
  await api.post('/api/auth/register').send({ username: 'abc', email: 'another@example.test', password: 'A' + '1'.repeat(127) }).expect(201);
});
test('scrypt derivation is deterministic per random user salt and distinct across accounts', () => {
  const saltA = randomBytes(16).toString('hex'), saltB = randomBytes(16).toString('hex'), password = 'A' + '1'.repeat(127);
  const a = deriveAccountPassword(password, saltA), b = deriveAccountPassword(password, saltB);
  assert.match(a, /^[a-f0-9]{64}$/); assert.notEqual(a, password); assert.notEqual(a, b); assert.equal(a, deriveAccountPassword(password, saltA));
});
test('opaque sessions use 32 random bytes, hash-only bearer storage and authenticated encryption', () => {
  const native = 'provider.header.signature', expires = new Date(Date.now() + 172800000).toISOString();
  const a = sealAccountSession(native, 'random-user-id', expires), b = sealAccountSession(native, 'random-user-id', expires);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/); assert.equal(Buffer.from(a.token, 'base64url').length, 32); assert.notEqual(a.token, b.token);
  assert.equal(a.row.token_hash, sessionHash(a.token)); assert.equal(a.row.token, undefined);
  assert.ok(!JSON.stringify(a.row).includes(native)); assert.ok(!JSON.stringify(a.row).includes(a.token));
  assert.ok(Date.parse(a.row.expires_at) <= Date.now() + 86400000); assert.equal(openAccountSession(a.token, a.row), native);
});
test('opaque sessions reject different bearers, corrupt ciphertext and expired rows with safe 401', () => {
  const a = sealAccountSession('sensitive-provider-token', 'owner', new Date(Date.now() + 3600000).toISOString());
  const corrupt = Buffer.from(a.row.encrypted_token, 'base64url'); corrupt[corrupt.length - 1] ^= 1;
  for (const [token, row] of [[randomBytes(32).toString('base64url'), a.row], [a.token, { ...a.row, encrypted_token: corrupt.toString('base64url') }], [a.token, { ...a.row, expires_at: new Date(0).toISOString() }], [a.token, null]]) assert.throws(() => openAccountSession(token, row), error => error.status === 401 && error.message === 'Invalid or expired session');
});
test('optional accounts: case-insensitive duplicate username/email are 409', async () => {
  const api = setup(); await register(api);
  await api.post('/api/auth/register').send(account(' ASHA ', 'different@example.test')).expect(409);
  await api.post('/api/auth/register').send(account('Different', ' ASHA@EXAMPLE.TEST ')).expect(409);
});
test('optional accounts: username/email login, missing fields 400, identical wrong-login 401', async () => {
  const api = setup(); await register(api);
  await login(api, 'ASHA'); const email = await login(api, 'ASHA@EXAMPLE.TEST'); assert.ok(email.expiresIn <= 86400);
  await api.post('/api/auth/login').send({}).expect(400);
  const unknown = await api.post('/api/auth/login').send({ identifier: 'missing', password: 'GoodPassword2026' }).expect(401);
  const wrong = await api.post('/api/auth/login').send({ identifier: 'Asha', password: 'wrong' }).expect(401);
  assert.deepEqual(unknown.body, { error: 'Invalid credentials' }); assert.deepEqual(wrong.body, unknown.body);
});
test('optional accounts: logout invalidates only the current bearer session', async () => {
  const api = setup(); const user = await register(api); const a = await login(api), b = await login(api);
  assert.notEqual(a.token, b.token);
  assert.deepEqual((await api.get('/api/auth/me').set('Authorization', `Bearer ${a.token}`).expect(200)).body, user);
  const result = await api.post('/api/auth/logout').set('Authorization', `Bearer ${a.token}`).expect(204); assert.equal(result.text, '');
  await api.get('/api/auth/me').set('Authorization', `Bearer ${a.token}`).expect(401);
  await api.get('/api/auth/me').set('Authorization', `Bearer ${b.token}`).expect(200);
  for (const path of ['/api/auth/me', '/api/friends']) await api.get(path).expect(401);
  await api.post('/api/auth/logout').expect(401);
});
test('saved friends: add/list/remove, self 400, unknown 404, duplicate 409, isolated lists', async () => {
  const api = setup(); await register(api); const friend = await register(api, 'Ben', 'ben@example.test'); const a = await login(api), b = await login(api, 'Ben');
  const header = `Bearer ${a.token}`;
  await api.post('/api/friends').set('Authorization', header).send({ username: '@Asha' }).expect(400);
  await api.post('/api/friends').set('Authorization', header).send({ username: '@Missing' }).expect(404);
  await api.post('/api/friends').set('Authorization', header).send({}).expect(400);
  const added = await api.post('/api/friends').set('Authorization', header).send({ username: '@bEn' }).expect(201); assert.deepEqual(added.body, { id: friend.id, username: 'Ben' });
  await api.post('/api/friends').set('Authorization', header).send({ username: 'Ben' }).expect(409);
  assert.equal((await api.get('/api/friends').set('Authorization', header)).body.length, 1);
  assert.deepEqual((await api.get('/api/friends').set('Authorization', `Bearer ${b.token}`)).body, []);
  await api.delete(`/api/friends/${friend.id}`).set('Authorization', header).expect(204);
  await api.delete(`/api/friends/${friend.id}`).set('Authorization', header).expect(404);
});
test('C4 endpoints remain fully anonymous when account routes are enabled', async () => {
  const api = setup();
  const group = (await api.post('/api/groups').send({ name: 'Guest trip', members: ['A', 'B'] }).expect(201)).body;
  const root = `/api/groups/${group.id}`;
  await api.get(root).expect(200); await api.post(`${root}/members`).send({ name: 'C' }).expect(201);
  const expense = (await api.post(`${root}/expenses`).send({ description: 'Tea', amount: 100, paidBy: 1, split: { type: 'equal' } }).expect(201)).body;
  await api.get(`${root}/expenses`).expect(200); await api.get(`${root}/balances`).expect(200); await api.get(`${root}/settlements`).expect(200);
  await api.post(`${root}/payments`).send({ from: 2, to: 1, amount: 1 }).expect(201); await api.delete(`${root}/expenses/${expense.id}`).expect(204);
});

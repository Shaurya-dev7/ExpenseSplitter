process.env.AUTH_REQUIRED = 'false';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createRepository } from '../src/database/repository.js';
import { extractGroupCode } from '../src/utils/group-code.js';

// Isolated Supabase-query test double, NOT SQLite. Uses the production repository's
// compare-and-swap/retry implementation so concurrent member mutations are exercised.
function setup() {
  const rows = new Map();
  const client = { from() {
    let action = 'read', values, filters = {};
    const query = {
      select() { return this; },
      eq(key, value) { filters[key] = value; return this; },
      insert(value) { action = 'insert'; values = structuredClone(value); return this; },
      update(value) { action = 'update'; values = structuredClone(value); return this; },
      async run() {
        await Promise.resolve();
        if (action === 'insert') { rows.set(values.id, { next_expense: 1, next_payment: 1, ...values }); return { data: structuredClone(rows.get(values.id)), error: null }; }
        const row = rows.get(filters.id);
        if (!row || Object.entries(filters).some(([key, value]) => row[key] !== value)) return { data: null, error: null };
        if (action === 'update') rows.set(row.id, values);
        return { data: structuredClone(rows.get(row.id)), error: null };
      },
      single() { return this.run(); }, maybeSingle() { return this.run(); }
    };
    return query;
  } };
  return request(createApp(createRepository(client)));
}
async function create(api, members = ['Asha', 'Ben']) {
  return (await api.post('/api/groups').send({ name: ' Trip ', members }).expect(201)).body;
}
test('group slice: exact response, 12 random bytes, URL-safe independent IDs, per-group member sequence', async () => {
  const api = setup(), a = await create(api, [' Asha ', 'Ben']), b = await create(api);
  assert.match(a.id, /^[A-Za-z0-9_-]{16}$/); assert.notEqual(a.id, b.id);
  assert.deepEqual(Object.keys(a).sort(), ['id', 'members', 'name']);
  assert.equal(a.name, 'Trip'); assert.deepEqual(a.members, [{ id: 1, name: 'Asha' }, { id: 2, name: 'Ben' }]);
  assert.deepEqual(b.members.map(m => m.id), [1, 2]);
  assert.deepEqual((await api.get(`/api/groups/${a.id}`).expect(200)).body, a);
});
test('group slice: all invalid creation fields returned together, duplicates are 400', async () => {
  const api = setup();
  const result = await api.post('/api/groups').send({ name: ' ', members: ['', 'x'.repeat(41), 'Ben', ' ben '] }).expect(400);
  assert.deepEqual(Object.keys(result.body.errors).sort(), ['members.0', 'members.1', 'members.3', 'name']);
  for (const name of [null, 1, '', 'x'.repeat(61)]) await api.post('/api/groups').send({ name, members: ['A', 'B'] }).expect(400);
  for (const members of [null, {}, [], ['A'], Array.from({ length: 21 }, (_, i) => `M${i}`), ['A', null], ['A', ' a ']]) await api.post('/api/groups').send({ name: 'Trip', members }).expect(400);
});
test('group slice: inclusive valid name and member-count boundaries', async () => {
  const api = setup();
  await api.post('/api/groups').send({ name: 'x', members: ['A', 'B'] }).expect(201);
  const group = (await api.post('/api/groups').send({ name: 'x'.repeat(60), members: Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(40, 'x')) }).expect(201)).body;
  assert.equal(group.members.length, 20); assert.equal(group.members[19].id, 20);
});
test('group slice: member validation, duplicates, unknown resources and capacity', async () => {
  const api = setup(), group = await create(api), url = `/api/groups/${group.id}/members`;
  await api.get('/api/groups/not-a-real-code').expect(404);
  await api.post('/api/groups/not-a-real-code/members').send({ name: 'C' }).expect(404);
  for (const name of [null, 3, '', ' ', 'x'.repeat(41)]) { const r = await api.post(url).send({ name }).expect(400); assert.ok(r.body.errors.name); }
  const duplicate = await api.post(url).send({ name: ' ASHA ' }).expect(409); assert.equal(typeof duplicate.body.error, 'string');
  const added = await api.post(url).send({ name: ' Charlie ' }).expect(201); assert.deepEqual(added.body, { id: 3, name: 'Charlie' });
  for (let i = 4; i <= 20; i++) await api.post(url).send({ name: `M${i}` }).expect(201);
  const full = await api.post(url).send({ name: 'Extra' }).expect(400); assert.ok(full.body.errors.members);
});
test('group slice: malformed JSON returns safe JSON error', async () => {
  const api = setup();
  const result = await api.post('/api/groups').set('Content-Type', 'application/json').send('{"name":').expect(400);
  assert.equal(typeof result.body.error, 'string'); assert.equal(result.body.stack, undefined);
});
test('group slice: concurrent POST members preserves every name with unique ordered IDs', async () => {
  const api = setup(), group = await create(api), url = `/api/groups/${group.id}`;
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => api.post(`${url}/members`).send({ name: `Concurrent ${i}` })));
  assert.ok(results.every(result => result.status === 201));
  const stored = (await api.get(url).expect(200)).body;
  assert.equal(stored.members.length, 10); assert.equal(new Set(stored.members.map(m => m.name)).size, 10);
  assert.deepEqual(stored.members.map(m => m.id), Array.from({ length: 10 }, (_, i) => i + 1));
});
test('group slice: concurrent case-insensitive duplicate requests create only one member', async () => {
  const api = setup(), group = await create(api), url = `/api/groups/${group.id}`;
  const results = await Promise.all(['Charlie', ' charlie '].map(name => api.post(`${url}/members`).send({ name })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal((await api.get(url)).body.members.length, 3);
});
test('extractGroupCode accepts codes and invite links, rejects unsafe/ambiguous inputs', () => {
  const code = 'Abcdefghij_-1234';
  for (const value of [code, ` ${code} `, `/?group=${code}`, `https://example.test/?group=${code}`]) assert.equal(extractGroupCode(value), code);
  for (const value of ['', 'short', 'javascript:alert(1)', 'https://example.test/', `https://example.test/other?group=${code}`, '/?group=bad', `/?group=${code}&group=${code}`, '<script>alert(1)</script>']) assert.throws(() => extractGroupCode(value));
});

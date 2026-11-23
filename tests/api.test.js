process.env.AUTH_REQUIRED = 'false';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/utils/errors.js';
// Isolated repository test double; production always uses the persistent Supabase repository.
function setup() {
  const rows = new Map();
  const repo = { async get(id) { if (!rows.has(id)) throw new HttpError(404, 'Group not found.'); return structuredClone(rows.get(id)); }, async create(g) { rows.set(g.id, structuredClone(g)); return g; }, async change(id, mutate) { const g = await this.get(id); const result = mutate(g); rows.set(id, g); return result; } };
  return request(createApp(repo));
}
async function create(client, members = ['Asha', 'Ben', 'Charlie']) { const r = await client.post('/api/groups').send({ name: 'Trip', members }).expect(201); assert.match(r.body.id, /^[\w-]{10,}$/); return r.body.id; }
test('all nine endpoint contracts, historical split, payment, deletion', async () => {
  const c = setup(), id = await create(c), root = `/api/groups/${id}`;
  const group = await c.get(root).expect(200); assert.deepEqual(group.body.members.map(m => m.id), [1, 2, 3]);
  const expense = await c.post(`${root}/expenses`).send({ description: 'Dinner', amount: 100, paidBy: 1, split: { type: 'equal' } }).expect(201);
  assert.deepEqual(expense.body.splits, { 1: 34, 2: 33, 3: 33 }); assert.ok(expense.body.createdAt);
  await c.post(`${root}/members`).send({ name: 'Dara' }).expect(201);
  const list = await c.get(`${root}/expenses`).expect(200); assert.deepEqual(list.body[0].splits, expense.body.splits);
  const b = await c.get(`${root}/balances`).expect(200); assert.deepEqual(b.body.balances.map(b => b.balance), [66, -33, -33, 0]);
  const s = await c.get(`${root}/settlements`).expect(200); assert.equal(s.body.transfers.length, 2);
  for (const t of s.body.transfers) await c.post(`${root}/payments`).send(t).expect(201);
  assert.deepEqual((await c.get(`${root}/settlements`)).body, { transfers: [] });
  const deletion = await c.delete(`${root}/expenses/${expense.body.id}`).expect(204); assert.equal(deletion.text, '');
  await c.delete(`${root}/expenses/${expense.body.id}`).expect(404);
});
test('validation, duplicate case/whitespace, unknown resources, malformed JSON', async () => {
  const c = setup(), id = await create(c), root = `/api/groups/${id}`;
  await c.post('/api/groups').send({ name: '', members: ['A', 'B'] }).expect(400);
  await c.post('/api/groups').send({ name: 'x'.repeat(61), members: ['A', 'B'] }).expect(400);
  await c.post('/api/groups').send({ name: 'x', members: ['A'] }).expect(400);
  await c.post('/api/groups').send({ name: 'x', members: ['A', ' a '] }).expect(400);
  await c.post(`${root}/members`).send({ name: ' ASHA ' }).expect(409);
  await c.post(`${root}/members`).send({ name: 'x'.repeat(41) }).expect(400);
  await c.get('/api/groups/unknown').expect(404);
  await c.post('/api/groups/unknown/members').send({ name: 'x' }).expect(404);
  await c.delete(`${root}/expenses/999`).expect(404);
  await c.post('/api/groups').set('Content-Type', 'application/json').send('{bad').expect(400);
  const invalid = await c.post(`${root}/expenses`).send({ description: '', amount: 0 }).expect(400); assert.ok(invalid.body.errors);
  for (const body of [{ from: 1, to: 1, amount: 1 }, { from: 1, to: 99, amount: 1 }, { from: 1, to: 2, amount: 0 }, { from: 1, to: 2, amount: 1.5 }]) await c.post(`${root}/payments`).send(body).expect(400);
});
test('member limits, max boundaries, payer outside split, oldest-first', async () => {
  const c = setup();
  await c.post('/api/groups').send({ name: 'x', members: Array.from({ length: 21 }, (_, i) => `M${i}`) }).expect(400);
  const id = await create(c, Array.from({ length: 19 }, (_, i) => `M${i}`)), root = `/api/groups/${id}`;
  const m = await c.post(`${root}/members`).send({ name: 'Final' }).expect(201); assert.equal(m.body.id, 20);
  await c.post(`${root}/members`).send({ name: 'Extra' }).expect(400);
  for (const amount of [1, 1000000000]) await c.post(`${root}/expenses`).send({ description: 'x'.repeat(100), amount, paidBy: 1, split: { type: 'equal', participants: [2] } }).expect(201);
  await c.post(`${root}/expenses`).send({ description: 'x', amount: 1000000001, paidBy: 1, split: { type: 'equal' } }).expect(400);
  const list = await c.get(`${root}/expenses`).expect(200); assert.ok(list.body[0].id < list.body[1].id);
  const balances = await c.get(`${root}/balances`).expect(200); assert.equal(balances.body.balances.reduce((s, b) => s + b.balance, 0), 0);
});
test('equal, shares and exact contracts reject malformed or unknown split members', async () => {
  const c = setup(), id = await create(c), root = `/api/groups/${id}`;
  for (const split of [{ type: 'equal', participants: [] }, { type: 'equal', participants: [1, 1] }, { type: 'shares', shares: { 99: 1 } }, { type: 'shares', shares: { 1: 1001 } }, { type: 'exact', amounts: { 1: 99 } }, { type: 'exact', amounts: { 1: -1, 2: 101 } }, { type: 'percentage' }]) {
    const r = await c.post(`${root}/expenses`).send({ description: 'Dinner', amount: 100, paidBy: 1, split }).expect(400);
    assert.equal(typeof r.body.errors, 'object');
  }
  const shares = await c.post(`${root}/expenses`).send({ description: 'Shares', amount: 101, paidBy: 3, split: { type: 'shares', shares: { 1: 2, 2: 1 } } }).expect(201);
  assert.deepEqual(shares.body.splits, { 1: 67, 2: 34 });
  const exact = await c.post(`${root}/expenses`).send({ description: 'Exact', amount: 101, paidBy: 3, split: { type: 'exact', amounts: { 1: 0, 2: 101 } } }).expect(201);
  assert.deepEqual(exact.body.splits, { 1: 0, 2: 101 });
});
test('unknown group returns safe 404 consistently on all group endpoints', async () => {
  const c = setup();
  for (const [method, suffix, body] of [['get', ''], ['post', '/members', { name: 'X' }], ['post', '/expenses', {}], ['get', '/expenses'], ['delete', '/expenses/1'], ['post', '/payments', {}], ['get', '/balances'], ['get', '/settlements']]) {
    const r = await c[method](`/api/groups/missing${suffix}`).send(body).expect(404);
    assert.equal(typeof r.body.error, 'string'); assert.equal(r.body.stack, undefined);
  }
});
test('deleted IDs are never reused and invalid payer is rejected', async () => {
  const c = setup(), id = await create(c), root = `/api/groups/${id}`;
  const payload = { description: 'Tea', amount: 1, paidBy: 1, split: { type: 'equal' } };
  const a = await c.post(`${root}/expenses`).send(payload).expect(201);
  await c.delete(`${root}/expenses/${a.body.id}`).expect(204);
  const b = await c.post(`${root}/expenses`).send(payload).expect(201);
  assert.ok(b.body.id > a.body.id);
  await c.post(`${root}/expenses`).send({ ...payload, paidBy: 99 }).expect(400);
  await c.post(`${root}/expenses`).send({ ...payload, description: 'x'.repeat(101) }).expect(400);
});
test('creation accepts boundary-length names and trims input', async () => {
  const c = setup();
  const r = await c.post('/api/groups').send({ name: ' ' + 'g'.repeat(60) + ' ', members: ['  ' + 'a'.repeat(40) + ' ', 'B'] }).expect(201);
  assert.equal(r.body.name.length, 60); assert.equal(r.body.members[0].name.length, 40);
  const same = await c.get(`/api/groups/${r.body.id}`).expect(200); assert.deepEqual(same.body, r.body);
});

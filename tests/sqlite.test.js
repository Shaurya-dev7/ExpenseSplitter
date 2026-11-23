process.env.AUTH_REQUIRED = 'false';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLocalRepository } from '../src/database/repository.js';

test('SQLite persistence: fresh empty DB, 9 endpoints, payments, bounds & invariants', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // 1. Fresh checkout starts with empty DB (unknown group returns 404)
  await client.get('/api/groups/non-existent-group').expect(404);

  // 2. Create group: returns random URL-safe ID >= 10 chars, sequential member IDs 1..N
  const createRes = await client.post('/api/groups').send({
    name: 'Weekend Camping Trip',
    members: ['Asha', 'Ben', 'Charlie', 'Divya']
  }).expect(201);

  assert.match(createRes.body.id, /^[A-Za-z0-9_-]{10,}$/);
  assert.equal(createRes.body.name, 'Weekend Camping Trip');
  assert.deepEqual(createRes.body.members, [
    { id: 1, name: 'Asha' },
    { id: 2, name: 'Ben' },
    { id: 3, name: 'Charlie' },
    { id: 4, name: 'Divya' }
  ]);

  const gid = createRes.body.id;
  const root = `/api/groups/${gid}`;

  // 3. Add expense: 12000 paise (₹120.00) paid by Asha, split equally among all 4
  const exp1 = await client.post(`${root}/expenses`).send({
    description: 'Campground Pass',
    amount: 12000,
    paidBy: 1,
    split: { type: 'equal' }
  }).expect(201);

  assert.equal(exp1.body.amount, 12000);
  assert.equal(exp1.body.paidBy, 1);
  assert.deepEqual(exp1.body.splits, { 1: 3000, 2: 3000, 3: 3000, 4: 3000 });
  assert.ok(exp1.body.createdAt);

  // 4. Balances: Asha is +9000, Ben is -3000, Charlie is -3000, Divya is -3000
  const bal1 = await client.get(`${root}/balances`).expect(200);
  assert.deepEqual(bal1.body.balances.map(b => b.balance), [9000, -3000, -3000, -3000]);
  assert.equal(bal1.body.balances.reduce((s, b) => s + b.balance, 0), 0);

  // 5. Settlements: at most k - 1 transfers (k = 4, so <= 3 transfers)
  const set1 = await client.get(`${root}/settlements`).expect(200);
  assert.ok(set1.body.transfers.length <= 3);
  assert.deepEqual(set1.body.transfers, [
    { from: 2, to: 1, amount: 3000 },
    { from: 3, to: 1, amount: 3000 },
    { from: 4, to: 1, amount: 3000 }
  ]);

  // 6. Record payment via POST /api/groups/:gid/payments: Ben pays Asha 3000
  // Ben was -3000; after paying 3000, Ben's balance moves to 0!
  const payRes = await client.post(`${root}/payments`).send({
    from: 2,
    to: 1,
    amount: 3000
  }).expect(201);

  assert.equal(payRes.body.from, 2);
  assert.equal(payRes.body.to, 1);
  assert.equal(payRes.body.amount, 3000);

  // Balances after Ben paid Asha: Asha is +6000, Ben is 0, Charlie is -3000, Divya is -3000
  const bal2 = await client.get(`${root}/balances`).expect(200);
  assert.deepEqual(bal2.body.balances.map(b => b.balance), [6000, 0, -3000, -3000]);

  // 7. Settlements now has k = 3 non-zero members; transfers <= 2
  const set2 = await client.get(`${root}/settlements`).expect(200);
  assert.equal(set2.body.transfers.length, 2);
  assert.deepEqual(set2.body.transfers, [
    { from: 3, to: 1, amount: 3000 },
    { from: 4, to: 1, amount: 3000 }
  ]);

  // 8. Reject invalid amount boundaries: > 1,000,000,000
  const overMax = await client.post(`${root}/expenses`).send({
    description: 'Billionaire Party',
    amount: 1000000001,
    paidBy: 1,
    split: { type: 'equal' }
  }).expect(400);
  assert.ok(overMax.body.errors.amount);

  // 9. Add member dynamically (member #5)
  const newMember = await client.post(`${root}/members`).send({ name: 'Eva' }).expect(201);
  assert.equal(newMember.body.id, 5);
  assert.equal(newMember.body.name, 'Eva');

  // 10. Remove zero-balance member (bonus feature)
  await client.delete(`${root}/members/5`).expect(204);
  const checkMembers = await client.get(root).expect(200);
  assert.equal(checkMembers.body.members.length, 4);

  // Cannot remove member with non-zero balance
  await client.delete(`${root}/members/3`).expect(400);
});

import 'dotenv/config';
import '../src/database/environment.js';
import assert from 'node:assert/strict';
import request from 'supertest';
import supabase from '../api/db-client.js';
import { createApp } from '../src/app.js';
import { createRepository } from '../src/database/repository.js';
const api = request(createApp(createRepository(supabase)));
let id;
try {
  const created = await api.post('/api/groups').send({ name: 'Isolated release verification', members: ['A', 'B', 'C'] }).expect(201);
  id = created.body.id;
  assert.match(id, /^[A-Za-z0-9_-]{16}$/);
  const root = `/api/groups/${id}`;
  const writes = await Promise.all(Array.from({ length: 8 }, (_, i) => api.post(`${root}/expenses`).send({ description: `Concurrent expense ${i}`, amount: 100 + i, paidBy: i % 3 + 1, split: { type: 'equal' } })));
  assert.ok(writes.every(r => r.status === 201), JSON.stringify(writes.map(r => [r.status, r.body])));
  let expenses = (await api.get(`${root}/expenses`).expect(200)).body;
  assert.equal(expenses.length, 8);
  assert.equal(new Set(expenses.map(e => e.id)).size, 8);
  const original = structuredClone(expenses[0].splits);
  await api.post(`${root}/members`).send({ name: 'D' }).expect(201);
  const additions = await Promise.all(Array.from({ length: 8 }, (_, i) => api.post(`${root}/members`).send({ name: `Concurrent member ${i}` })));
  assert.ok(additions.every(r => r.status === 201));
  const members = (await api.get(root).expect(200)).body.members;
  assert.equal(members.length, 12);
  assert.deepEqual(members.map(m => m.id), Array.from({ length: 12 }, (_, i) => i + 1));
  const duplicates = await Promise.all(['Extra friend', ' EXTRA FRIEND '].map(name => api.post(`${root}/members`).send({ name })));
  assert.deepEqual(duplicates.map(r => r.status).sort(), [201, 409]);
  expenses = (await api.get(`${root}/expenses`).expect(200)).body;
  assert.deepEqual(expenses[0].splits, original);
  const transfers = (await api.get(`${root}/settlements`).expect(200)).body.transfers;
  for (const transfer of transfers) await api.post(`${root}/payments`).send(transfer).expect(201);
  const balances = (await api.get(`${root}/balances`).expect(200)).body.balances;
  assert.ok(balances.every(b => b.balance === 0));
  assert.deepEqual((await api.get(`${root}/settlements`).expect(200)).body.transfers, []);
  await api.delete(`${root}/expenses/${expenses[0].id}`).expect(204);
  assert.equal((await api.get(`${root}/expenses`).expect(200)).body.length, 7);
  const final = await supabase.from('c4_groups').select('*').eq('id', id).single();
  assert.equal(final.error, null);
  assert.equal(final.data.expenses.length, 7);
  assert.ok(final.data.version >= 10);
  console.log('PASS: real persistent CRUD, eight concurrent expense writes, eight concurrent member additions, unique ordered member IDs, concurrent duplicate rejection, no lost updates, historical split preservation, zero-sum balances, settlement payments, and deletion.');
} finally {
  if (id) {
    const { error } = await supabase.from('c4_groups').delete().eq('id', id);
    if (error) throw error;
    console.log('PASS: isolated release-verification group cleaned up.');
  }
}

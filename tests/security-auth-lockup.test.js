import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLocalRepository } from '../src/database/repository.js';
import { resetRateLimiter } from '../src/middleware/security.middleware.js';

test('Security & Auth Lockup: Strict route protection returns 401 when unauthenticated', async () => {
  // Ensure strict lockdown is active
  delete process.env.AUTH_REQUIRED;

  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // 1. GET /api/dashboard without token -> 401
  const dashNoAuth = await client.get('/api/dashboard').expect(401);
  assert.equal(dashNoAuth.body.error, 'Authentication required');

  // 2. POST /api/groups without token -> 401
  const groupCreateNoAuth = await client.post('/api/groups').send({
    name: 'Secret Trip',
    members: ['Alex', 'Sam']
  }).expect(401);
  assert.equal(groupCreateNoAuth.body.error, 'Authentication required');

  // 3. GET /api/groups without token -> 401
  const groupListNoAuth = await client.get('/api/groups').expect(401);
  assert.equal(groupListNoAuth.body.error, 'Authentication required');

  // 4. Invalid Bearer token -> 401
  await client.get('/api/dashboard')
    .set('Authorization', 'Bearer invalid-token-sample')
    .expect(401);

  await client.post('/api/groups')
    .set('Authorization', 'Bearer invalid-token-sample')
    .send({ name: 'Trip', members: ['A', 'B'] })
    .expect(401);
});

test('Security Headers & Sliding-Window Rate Limiting', async () => {
  delete process.env.AUTH_REQUIRED;
  resetRateLimiter();

  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // 1. Check security headers on response
  const res = await client.get('/api/ai/status');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.ok(res.headers['content-security-policy'], 'CSP must be set');

  // 2. Test rate limiting: 10 failed login attempts allowed, 11th triggers 429
  for (let i = 0; i < 10; i++) {
    await client.post('/api/auth/login').send({
      email: 'nonexistent@example.com',
      password: 'WrongPassword123'
    }).expect(401);
  }

  // 11th attempt must be blocked by rate limiter
  const blockedRes = await client.post('/api/auth/login').send({
    email: 'nonexistent@example.com',
    password: 'WrongPassword123'
  }).expect(429);

  assert.equal(blockedRes.body.error, 'Too many attempts. Please wait and try again.');

  resetRateLimiter();
});

test('Personal Dashboard Math & User Isolation (GET /api/dashboard)', async () => {
  delete process.env.AUTH_REQUIRED;
  resetRateLimiter();

  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // 1. Register User A
  const regA = await client.post('/api/auth/register').send({
    name: 'Shaurya Rai',
    username: 'shauryarai',
    email: 'shaurya@example.com',
    password: 'Password123'
  }).expect(201);

  const loginA = await client.post('/api/auth/login').send({
    email: 'shaurya@example.com',
    password: 'Password123'
  }).expect(200);

  const tokenA = loginA.body.token;

  // 2. User A creates Group 1 ("Manali Trip") with Shaurya Rai and Rohan
  const g1Res = await client.post('/api/groups')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      name: 'Manali Trip',
      members: ['Shaurya Rai', 'Rohan']
    })
    .expect(201);
  const g1Id = g1Res.body.id;

  // Add expense in Group 1: 300000 paise (₹3,000.00) paid by Shaurya Rai (id 1)
  await client.post(`/api/groups/${g1Id}/expenses`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      description: 'Cottage Stay',
      amount: 300000,
      paidBy: 1,
      split: { type: 'equal' }
    })
    .expect(201);

  // 3. User A creates Group 2 ("Goa Villa") with Shaurya Rai and Priya
  const g2Res = await client.post('/api/groups')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      name: 'Goa Villa',
      members: ['Shaurya Rai', 'Priya']
    })
    .expect(201);
  const g2Id = g2Res.body.id;

  // Add expense in Group 2: 100000 paise (₹1,000.00) paid by Priya (id 2)
  await client.post(`/api/groups/${g2Id}/expenses`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      description: 'Scooter Rental',
      amount: 100000,
      paidBy: 2,
      split: { type: 'equal' }
    })
    .expect(201);

  // 4. Assert User A's dashboard calculations
  const dashA = await client.get('/api/dashboard')
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);

  assert.equal(dashA.body.user.username, 'shauryarai');
  assert.equal(dashA.body.summary.totalGroups, 2);
  assert.equal(dashA.body.summary.unsettledGroups, 2);

  // Exact paise arithmetic checks:
  // Group 1: Shaurya paid 300000, share is 150000, balance is +150000 (gets back)
  // Group 2: Shaurya paid 0, share is 50000, balance is -50000 (owes)
  assert.equal(dashA.body.summary.totalYouPaid, 300000);
  assert.equal(dashA.body.summary.totalYourShare, 200000);
  assert.equal(dashA.body.summary.netBalance, 100000); // 150000 - 50000
  assert.equal(dashA.body.summary.totalToReceive, 150000);
  assert.equal(dashA.body.summary.totalToPay, 50000);

  const card1 = dashA.body.groups.find((g) => g.id === g1Id);
  assert.ok(card1);
  assert.equal(card1.totalGroupSpend, 300000);
  assert.equal(card1.mySpent, 300000);
  assert.equal(card1.myBalance, 150000);
  assert.equal(card1.myStatus, 'owed');

  const card2 = dashA.body.groups.find((g) => g.id === g2Id);
  assert.ok(card2);
  assert.equal(card2.totalGroupSpend, 100000);
  assert.equal(card2.mySpent, 0);
  assert.equal(card2.myBalance, -50000);
  assert.equal(card2.myStatus, 'owes');

  // 5. User Isolation: Register User B
  await client.post('/api/auth/register').send({
    name: 'Vikram Joshi',
    username: 'vikram_j',
    email: 'vikram@example.com',
    password: 'Password456'
  }).expect(201);

  const loginB = await client.post('/api/auth/login').send({
    email: 'vikram@example.com',
    password: 'Password456'
  }).expect(200);

  const tokenB = loginB.body.token;

  // User B's dashboard must NOT contain User A's private groups
  const dashB = await client.get('/api/dashboard')
    .set('Authorization', `Bearer ${tokenB}`)
    .expect(200);

  assert.equal(dashB.body.summary.totalGroups, 0);
  assert.deepEqual(dashB.body.groups, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLocalRepository } from '../src/database/repository.js';
import { generateUniqueUsername } from '../src/utils/username.js';

test('Auth: POST /api/auth/register validation, compulsory name & username, and no password leak', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // 1. Missing name & username return 400 naming both bad fields
  const badRes = await client.post('/api/auth/register').send({
    email: 'not-an-email',
    password: 'short'
  }).expect(400);

  assert.ok(badRes.body.errors, 'Must contain errors object');
  assert.ok(badRes.body.errors.name, 'Name must be compulsory');
  assert.ok(badRes.body.errors.username, 'Username must be compulsory');
  assert.ok(badRes.body.errors.email, 'Must flag invalid email');
  assert.ok(badRes.body.errors.password, 'Must flag weak password');

  // Username format validation (too short)
  const shortUser = await client.post('/api/auth/register').send({
    name: 'Alex',
    username: 'al',
    email: 'alex@example.com',
    password: 'Password123'
  }).expect(400);
  assert.ok(shortUser.body.errors.username);

  // Username format validation (illegal characters)
  const illegalUser = await client.post('/api/auth/register').send({
    name: 'Alex',
    username: 'alex@bad!',
    email: 'alex@example.com',
    password: 'Password123'
  }).expect(400);
  assert.ok(illegalUser.body.errors.username);

  // Password missing digit
  const noDigit = await client.post('/api/auth/register').send({
    name: 'Alex Rivera',
    username: 'alex_rivera',
    email: 'alex@example.com',
    password: 'passwordonly'
  }).expect(400);
  assert.ok(noDigit.body.errors.password);

  // Password missing letter
  const noLetter = await client.post('/api/auth/register').send({
    name: 'Alex Rivera',
    username: 'alex_rivera',
    email: 'alex@example.com',
    password: '1234567890'
  }).expect(400);
  assert.ok(noLetter.body.errors.password);

  // 2. Successful registration creates user with user-chosen username
  const regRes = await client.post('/api/auth/register').send({
    name: 'Alex Rivera',
    username: 'alex_rivera',
    email: 'alex@example.com',
    password: 'Password123'
  }).expect(201);

  assert.ok(regRes.body.id, 'User ID must exist');
  assert.equal(regRes.body.email, 'alex@example.com');
  assert.equal(regRes.body.name, 'Alex Rivera');
  assert.equal(regRes.body.username, 'alex_rivera');
  assert.equal(regRes.body.password, undefined, 'Password must never be returned');
  assert.equal(regRes.body.password_hash, undefined, 'Password hash must never be returned');
});

test('Auth: real-time GET /api/auth/check-username and duplicate username rejection', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // 1. Check an available username
  const checkFree = await client.get('/api/auth/check-username?username=cool_dev').expect(200);
  assert.equal(checkFree.body.available, true);
  assert.equal(checkFree.body.username, 'cool_dev');

  // 2. Register user with cool_dev
  await client.post('/api/auth/register').send({
    name: 'Cool Developer',
    username: 'cool_dev',
    email: 'cool@dev.test',
    password: 'Password123'
  }).expect(201);

  // 3. Check now returns available: false
  const checkTaken = await client.get('/api/auth/check-username?username=cool_dev').expect(200);
  assert.equal(checkTaken.body.available, false);
  assert.ok(checkTaken.body.error);

  // Check with leading @ also checks correctly
  const checkAt = await client.get('/api/auth/check-username?username=@cool_dev').expect(200);
  assert.equal(checkAt.body.available, false);

  // Invalid formats return available: false with descriptive message
  const checkShort = await client.get('/api/auth/check-username?username=ab').expect(200);
  assert.equal(checkShort.body.available, false);

  // 4. Register duplicate username returns 409 conflict
  const dupRes = await client.post('/api/auth/register').send({
    name: 'Imposter',
    username: 'cool_dev',
    email: 'imposter@dev.test',
    password: 'Password123'
  }).expect(409);
  assert.ok(dupRes.body.error || dupRes.body.errors);
});

test('Auth: duplicate email (ignoring case) returns 409', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  await client.post('/api/auth/register').send({
    name: 'Clara',
    username: 'clara_o',
    email: 'clara@fairshare.test',
    password: 'Password123'
  }).expect(201);

  // Same email with different case
  const dupRes = await client.post('/api/auth/register').send({
    name: 'Clara Second',
    username: 'clara_two',
    email: 'CLARA@FAIRSHARE.TEST',
    password: 'Password123'
  }).expect(409);

  assert.equal(dupRes.body.error, 'Email already registered');
});

test('Auth: POST /api/auth/login works with email and @username, anti-enumeration verified', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  const reg = await client.post('/api/auth/register').send({
    name: 'Devin',
    username: 'devin_ops',
    email: 'devin@fairshare.test',
    password: 'SecretPass1'
  }).expect(201);

  const username = reg.body.username;

  // 1. Login with email
  const loginEmail = await client.post('/api/auth/login').send({
    email: 'devin@fairshare.test',
    password: 'SecretPass1'
  }).expect(200);

  assert.ok(loginEmail.body.token, 'Must return session token');
  assert.equal(loginEmail.body.expiresIn, 86400);
  assert.equal(loginEmail.body.user.email, 'devin@fairshare.test');
  assert.equal(loginEmail.body.user.username, username);

  // 2. Login with assigned username (both bare and with @)
  const loginUserBare = await client.post('/api/auth/login').send({
    email: username,
    password: 'SecretPass1'
  }).expect(200);
  assert.ok(loginUserBare.body.token);

  const loginUserAt = await client.post('/api/auth/login').send({
    email: `@${username}`,
    password: 'SecretPass1'
  }).expect(200);
  assert.ok(loginUserAt.body.token);

  // 3. Anti-enumeration: exact same 401 message for unknown account and wrong password
  const unknownAcc = await client.post('/api/auth/login').send({
    email: 'ghost@fairshare.test',
    password: 'SecretPass1'
  }).expect(401);

  const wrongPass = await client.post('/api/auth/login').send({
    email: 'devin@fairshare.test',
    password: 'WrongPassword99'
  }).expect(401);

  assert.equal(unknownAcc.body.error, 'Invalid email/username or password');
  assert.equal(wrongPass.body.error, 'Invalid email/username or password');
  assert.deepEqual(unknownAcc.body, wrongPass.body, 'Error responses must be indistinguishable');

  // Missing fields
  await client.post('/api/auth/login').send({ email: '' }).expect(400);
});

test('Auth: GET /api/auth/me returns 200 with Bearer token and 401 without one', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  const reg = await client.post('/api/auth/register').send({
    name: 'Maya',
    username: 'maya_lin',
    email: 'maya@fairshare.test',
    password: 'Password99'
  }).expect(201);

  const login = await client.post('/api/auth/login').send({
    email: 'maya@fairshare.test',
    password: 'Password99'
  }).expect(200);

  const token = login.body.token;

  // Valid token
  const meRes = await client.get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(meRes.body.id, reg.body.id);
  assert.equal(meRes.body.email, 'maya@fairshare.test');
  assert.equal(meRes.body.username, reg.body.username);
  assert.equal(meRes.body.name, 'Maya');

  // Missing token
  await client.get('/api/auth/me').expect(401);

  // Invalid token
  await client.get('/api/auth/me')
    .set('Authorization', 'Bearer invalid-token-string')
    .expect(401);
});

test('Auth: Per-session logout invalidates only the logged-out session token', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  await client.post('/api/auth/register').send({
    name: 'Tara',
    username: 'tara_star',
    email: 'tara@fairshare.test',
    password: 'Password123'
  }).expect(201);

  // Login twice to simulate two devices
  const sessionA = await client.post('/api/auth/login').send({
    email: 'tara@fairshare.test',
    password: 'Password123'
  }).expect(200);

  const sessionB = await client.post('/api/auth/login').send({
    email: 'tara@fairshare.test',
    password: 'Password123'
  }).expect(200);

  const tokenA = sessionA.body.token;
  const tokenB = sessionB.body.token;
  assert.notEqual(tokenA, tokenB);

  // Both tokens work
  await client.get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(200);
  await client.get('/api/auth/me').set('Authorization', `Bearer ${tokenB}`).expect(200);

  // Logout session A: 204 no body
  const logoutRes = await client.post('/api/auth/logout')
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(204);
  assert.equal(logoutRes.text, '');

  // Session A is now invalidated (401)
  await client.get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(401);

  // Session B remains completely valid (200)
  const meB = await client.get('/api/auth/me').set('Authorization', `Bearer ${tokenB}`).expect(200);
  assert.equal(meB.body.email, 'tara@fairshare.test');
});

test('Regression: POST /api/groups and all C4 features remain 100% accessible with zero auth headers', async () => {
  const origAuth = process.env.AUTH_REQUIRED;
  try {
    process.env.AUTH_REQUIRED = 'false';
    const repo = createLocalRepository(':memory:');
    const app = createApp(repo);
    const client = request(app);

    // Unauthenticated client creates group
    const createRes = await client.post('/api/groups').send({
      name: 'Road Trip Unauthenticated',
      members: ['Asha', 'Ben']
    }).expect(201);

    assert.ok(createRes.body.id);
    const gid = createRes.body.id;

    // Unauthenticated client adds expense
    await client.post(`/api/groups/${gid}/expenses`).send({
      description: 'Fuel',
      amount: 5000,
      paidBy: 1,
      split: { type: 'equal' }
    }).expect(201);

    // Unauthenticated balances and settlements
    const bal = await client.get(`/api/groups/${gid}/balances`).expect(200);
    assert.deepEqual(bal.body.balances.map(b => b.balance), [2500, -2500]);
  } finally {
    if (origAuth !== undefined) process.env.AUTH_REQUIRED = origAuth;
    else delete process.env.AUTH_REQUIRED;
  }
});

test('Auth: POST /api/ai/chat requires login when auth is enabled', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  const originalKey = process.env.NVIDIA_API_KEY;
  try {
    process.env.NVIDIA_API_KEY = 'nvapi-test-api-key-for-auth-testing';

    // 1. Without auth header -> 401
    const resNoAuth = await client.post('/api/ai/chat').send({
      groupId: null,
      messages: [{ role: 'user', content: 'What are my groups?' }]
    }).expect(401);

    assert.equal(resNoAuth.body.requireLogin, true);

    // 2. With invalid token -> 401
    await client.post('/api/ai/chat')
      .set('Authorization', 'Bearer invalid-token')
      .send({ groupId: null, messages: [{ role: 'user', content: 'Hello' }] })
      .expect(401);

    // 3. Register & login -> valid token
    await client.post('/api/auth/register').send({
      name: 'Sam User',
      username: 'sam_user',
      email: 'sam@fairshare.test',
      password: 'Password123'
    }).expect(201);

    const loginRes = await client.post('/api/auth/login').send({
      email: 'sam@fairshare.test',
      password: 'Password123'
    }).expect(200);

    const token = loginRes.body.token;

    // With valid token, request passes auth check (may fail at LLM network level or succeed)
    // We verify it does NOT return 401 Unauthorized
    const resAuth = await client.post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: null, messages: [{ role: 'user', content: 'Hello' }] });

    assert.notEqual(resAuth.status, 401, 'Authenticated user must pass auth check');
  } finally {
    if (originalKey !== undefined) process.env.NVIDIA_API_KEY = originalKey;
    else delete process.env.NVIDIA_API_KEY;
  }
});

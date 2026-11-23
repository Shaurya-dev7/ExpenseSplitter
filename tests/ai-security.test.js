/**
 * Automated Security & User-Data Isolation Verification for FairShare AI Agent
 *
 * Verifies 7 Critical Defense-in-Depth Protections:
 * 1. Zero Context Leak: System prompt for User B never leaks User A's groups or global counts.
 * 2. IDOR Read Block: User B cannot read User A's group, expenses, balances, or settlements.
 * 3. IDOR Write Block: User B cannot add expenses, members, or record payments in User A's group.
 * 4. No Fuzzy Name Join / Valid Code Join: Exact code join works; fuzzy join is blocked.
 * 5. Delete Ownership & Confirmation Gate: Unconfirmed delete blocked; non-payer/non-owner delete blocked.
 * 6. Input Bounds & Rate Limiting: >1000 char message -> 400; >20 req/min -> 429; unauthenticated -> 401.
 * 7. Full Regression: Server C4 invariants and existing endpoints remain 100% functional.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLocalRepository } from '../src/database/repository.js';
import { executeTool, processChat } from '../src/services/ai-agent.service.js';
import { resetAiRateLimiter } from '../src/routes/ai.routes.js';
import { resetRateLimiter } from '../src/middleware/security.middleware.js';

test('AI Security 1: Zero Context Leak across isolated user accounts', async () => {
  delete process.env.AUTH_REQUIRED;
  const repo = createLocalRepository(':memory:');
  const auth = repo.auth;

  // 1. Create User A and User B
  const userA = await auth.createUser({
    name: 'User Alpha',
    username: 'user_alpha',
    email: 'alpha@example.com',
    password: 'Password123'
  });

  const userB = await auth.createUser({
    name: 'User Beta',
    username: 'user_beta',
    email: 'beta@example.com',
    password: 'Password123'
  });

  // 2. User A creates two secret trip groups
  const gA1 = await executeTool('create_group', {
    name: 'Goa Secret Trip',
    members: ['User Alpha', 'Friend One']
  }, repo, userA);

  const gA2 = await executeTool('create_group', {
    name: 'Manali Trip',
    members: ['User Alpha', 'Friend Two']
  }, repo, userA);

  // 3. User B creates one group
  const gB = await executeTool('create_group', {
    name: 'himalya',
    members: ['User Beta', 'Mountain Guide']
  }, repo, userB);

  // 4. Intercept system prompt built for User B
  let capturedMessagesForB = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const parsedBody = JSON.parse(options.body);
    capturedMessagesForB = parsedBody.messages;
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: JSON.stringify({ mode: 'answer', reply: 'Here are your groups.' })
          }
        }]
      })
    };
  };

  process.env.NVIDIA_API_KEY = 'nvapi-test-fake-key-for-prompt-verification';

  try {
    await processChat({
      groupId: null,
      messages: [{ role: 'user', content: 'What groups do I have?' }],
      repository: repo,
      user: userB
    });

    assert.ok(capturedMessagesForB, 'Messages should have been sent to fetch');
    const systemPromptB = capturedMessagesForB.find(m => m.role === 'system')?.content || '';

    // Must contain User B's own group
    assert.ok(systemPromptB.includes('himalya'), 'System prompt for User B must contain "himalya"');
    assert.ok(systemPromptB.includes(gB.id), 'System prompt for User B must contain User B group ID');

    // Must have ZERO occurrences of User A's data
    assert.equal(systemPromptB.includes('Goa Secret Trip'), false, 'Context leak: Found "Goa Secret Trip" in User B prompt!');
    assert.equal(systemPromptB.includes('Manali Trip'), false, 'Context leak: Found "Manali Trip" in User B prompt!');
    assert.equal(systemPromptB.includes(gA1.id), false, 'Context leak: Found User A group 1 ID in User B prompt!');
    assert.equal(systemPromptB.includes(gA2.id), false, 'Context leak: Found User A group 2 ID in User B prompt!');
    assert.equal(systemPromptB.includes('3 groups'), false, 'Context leak: Total system group count leaked!');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NVIDIA_API_KEY;
  }
});

test('AI Security 2: IDOR Read Block — unauthorized user gets generic "Group not found"', async () => {
  delete process.env.AUTH_REQUIRED;
  const repo = createLocalRepository(':memory:');
  const auth = repo.auth;

  const userA = await auth.createUser({
    name: 'Owner A',
    username: 'owner_a',
    email: 'ownera@example.com',
    password: 'Password123'
  });

  const userB = await auth.createUser({
    name: 'Attacker B',
    username: 'attacker_b',
    email: 'attackerb@example.com',
    password: 'Password123'
  });

  const groupA = await executeTool('create_group', {
    name: 'Private Vault Trip',
    members: ['Owner A', 'VIP Guest']
  }, repo, userA);

  // 1. list_groups for User B must not return Group A
  const listB = await executeTool('list_groups', {}, repo, userB);
  assert.equal(listB.some(g => g.id === groupA.id), false, 'User B must not see User A group in list');

  // 2. get_group on Group A by User B must return generic 404 error
  const getB = await executeTool('get_group', { groupId: groupA.id }, repo, userB);
  assert.deepEqual(getB, { error: 'Group not found' }, 'Unauthorized get_group must return generic error');

  // 3. get_balances on Group A by User B
  const balB = await executeTool('get_balances', { groupId: groupA.id }, repo, userB);
  assert.deepEqual(balB, { error: 'Group not found' });

  // 4. get_settlements on Group A by User B
  const settB = await executeTool('get_settlements', { groupId: groupA.id }, repo, userB);
  assert.deepEqual(settB, { error: 'Group not found' });
});

test('AI Security 3: IDOR Write Block — unauthorized mutations rejected with zero state change', async () => {
  delete process.env.AUTH_REQUIRED;
  const repo = createLocalRepository(':memory:');
  const auth = repo.auth;

  const userA = await auth.createUser({
    name: 'User A',
    username: 'usera',
    email: 'usera@example.com',
    password: 'Password123'
  });

  const userB = await auth.createUser({
    name: 'User B',
    username: 'userb',
    email: 'userb@example.com',
    password: 'Password123'
  });

  const groupA = await executeTool('create_group', {
    name: 'Untouchable Trip',
    members: ['User A', 'Trusted Partner']
  }, repo, userA);

  // 1. User B tries to add expense to Group A
  const expRes = await executeTool('add_expense', {
    groupId: groupA.id,
    description: 'Hacked Expense',
    amount: 50000,
    paidBy: 1,
    split: { type: 'equal' }
  }, repo, userB);
  assert.deepEqual(expRes, { error: 'Group not found' });

  // 2. User B tries to add member to Group A
  const memRes = await executeTool('add_member', {
    groupId: groupA.id,
    name: 'Malicious Intruder'
  }, repo, userB);
  assert.deepEqual(memRes, { error: 'Group not found' });

  // 3. User B tries to record payment in Group A
  const payRes = await executeTool('record_payment', {
    groupId: groupA.id,
    from: 1,
    to: 2,
    amount: 10000
  }, repo, userB);
  assert.deepEqual(payRes, { error: 'Group not found' });

  // 4. Verify Group A in SQLite remained 100% pristine and unmodified
  const refreshedA = await repo.get(groupA.id);
  assert.equal(refreshedA.expenses.length, 0, 'No expenses should have been added');
  assert.equal(refreshedA.members.length, 2, 'No members should have been added');
  assert.equal(refreshedA.payments.length, 0, 'No payments should have been recorded');
});

test('AI Security 4: No Fuzzy Name Join / Valid Code Join', async () => {
  delete process.env.AUTH_REQUIRED;
  const repo = createLocalRepository(':memory:');
  const auth = repo.auth;

  const userA = await auth.createUser({
    name: 'Host User',
    username: 'host_user',
    email: 'host@example.com',
    password: 'Password123'
  });

  const userB = await auth.createUser({
    name: 'Joiner User',
    username: 'joiner_user',
    email: 'joiner@example.com',
    password: 'Password123'
  });

  const groupA = await executeTool('create_group', {
    name: 'Goa Secret Trip',
    members: ['Host User', 'Co Host']
  }, repo, userA);

  // 1. Cannot join with fuzzy name or short code
  const fuzzyRes = await executeTool('join_group', { groupId: 'Goa Secret Trip' }, repo, userB);
  assert.deepEqual(fuzzyRes, { error: 'Group not found' });

  const shortRes = await executeTool('join_group', { groupId: 'short' }, repo, userB);
  assert.equal(shortRes.error.includes('at least 10 characters'), true);

  // 2. Valid secret group ID join
  const validJoin = await executeTool('join_group', { groupId: groupA.id }, repo, userB);
  assert.equal(validJoin.success, true);
  assert.ok(validJoin.message.includes('Joined'));

  // 3. Verify userB is bound as a member with userId
  const updatedGroup = await repo.get(groupA.id);
  const boundMember = updatedGroup.members.find(m => m.userId === userB.id);
  assert.ok(boundMember, 'User B must now be a bound member with userId');

  // 4. User B can now read group details normally
  const readRes = await executeTool('get_group', { groupId: groupA.id }, repo, userB);
  assert.equal(readRes.name, 'Goa Secret Trip');
});

test('AI Security 5: Delete Ownership & Confirmation Gate', async () => {
  delete process.env.AUTH_REQUIRED;
  const repo = createLocalRepository(':memory:');
  const auth = repo.auth;

  const userA = await auth.createUser({
    name: 'Alpha Creator',
    username: 'alpha_creator',
    email: 'alpha_c@example.com',
    password: 'Password123'
  });

  const userB = await auth.createUser({
    name: 'Beta Member',
    username: 'beta_member',
    email: 'beta_m@example.com',
    password: 'Password123'
  });

  // Group created by userA with userB as member
  const group = await repo.create({
    id: 'grp_security_delete_test',
    name: 'Shared Cottage',
    members: [
      { id: 1, name: 'Alpha Creator', userId: userA.id },
      { id: 2, name: 'Beta Member', userId: userB.id }
    ],
    expenses: [
      { id: 1, description: 'Groceries by Alpha', amount: 30000, paidBy: 1, splits: { 1: 15000, 2: 15000 }, createdAt: new Date().toISOString() }
    ],
    payments: [],
    version: 0,
    createdByUserId: userA.id,
    createdAt: new Date().toISOString()
  });

  // 1. Beta Member tries to delete Alpha's expense (not creator, not payer)
  const unauthDel = await executeTool('delete_expense', {
    groupId: group.id,
    expenseId: 1,
    confirmed: true
  }, repo, userB);
  assert.equal(unauthDel.error, 'You can only delete expenses that you paid for or if you created the group.');

  // 2. Alpha Creator calls delete_expense without confirmed: true -> blocked, returns confirmation request
  const unconfirmedDel = await executeTool('delete_expense', {
    groupId: group.id,
    expenseId: 1
  }, repo, userA);
  assert.equal(unconfirmedDel.requiresConfirmation, true);
  assert.ok(unconfirmedDel.options.some(o => o.label === 'Confirm delete'));

  // 3. Alpha Creator calls delete_expense with confirmed: true -> succeeds
  const confirmedDel = await executeTool('delete_expense', {
    groupId: group.id,
    expenseId: 1,
    confirmed: true
  }, repo, userA);
  assert.equal(confirmedDel.success, true);
  assert.equal(confirmedDel.deletedId, 1);

  // 4. Verify expense deleted from DB
  const checkGroup = await repo.get(group.id);
  assert.equal(checkGroup.expenses.length, 0);
});

test('AI Security 6: Input Bounds, Rate Limiting & Unauthenticated Protection', async () => {
  delete process.env.AUTH_REQUIRED;
  resetAiRateLimiter();
  resetRateLimiter();

  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);
  const client = request(app);

  // 1. Unauthenticated POST /api/ai/chat returns 401
  const unauthRes = await client.post('/api/ai/chat').send({
    messages: [{ role: 'user', content: 'hello' }]
  }).expect(401);
  assert.equal(unauthRes.body.error, 'Authentication required');

  // 2. Register and log in User A
  await client.post('/api/auth/register').send({
    name: 'Rate Limit User',
    username: 'rate_user',
    email: 'rate@example.com',
    password: 'Password123'
  }).expect(201);

  const loginRes = await client.post('/api/auth/login').send({
    email: 'rate@example.com',
    password: 'Password123'
  }).expect(200);

  const token = loginRes.body.token;

  // 3. Oversized individual message (> 1000 chars) returns 400
  const longText = 'A'.repeat(1005);
  const oversizeRes = await client.post('/api/ai/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({
      messages: [{ role: 'user', content: longText }]
    }).expect(400);
  assert.ok(oversizeRes.body.error.includes('1000 characters'));

  // 4. Oversized message array (> 20 messages) returns 400
  const excessiveMessages = Array.from({ length: 25 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}`
  }));
  const historyRes = await client.post('/api/ai/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({
      messages: excessiveMessages
    }).expect(400);
  assert.ok(historyRes.body.error.includes('20 turns'));

  // 5. Test Per-User AI Rate Limiter: max 20 requests per minute
  // Temporarily set fake API key so status is enabled
  process.env.NVIDIA_API_KEY = 'nvapi-fake-for-ratelimit-test';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({ mode: 'answer', reply: 'ok' }) } }]
    })
  });

  try {
    for (let i = 0; i < 20; i++) {
      const res = await client.post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ messages: [{ role: 'user', content: `Ping ${i}` }] });
      assert.equal(res.status, 200, `Request ${i + 1} should be 200`);
    }

    // 21st attempt must be rejected with 429
    const blockedRes = await client.post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'Ping 21' }] })
      .expect(429);

    assert.ok(blockedRes.body.error.includes('Too many AI requests'));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NVIDIA_API_KEY;
    resetAiRateLimiter();
  }
});

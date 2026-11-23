import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { createLocalRepository } from '../src/database/repository.js';
import { executeTool } from '../src/services/ai-agent.service.js';

function createTestEnv() {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);

  return { repo, app };
}

async function registerTestUser(app, username, email = `${username}@example.com`) {
  const res = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      username,
      name: `${username.toUpperCase()} Test`,
      password: 'Password123!@#'
    })
  });
  assert.equal(res.status, 201, `Failed to register ${username}`);
  return res.json();
}

test('Group Status: Newly created group defaults to isActive: true and includes it in responses', async () => {
  const repo = createLocalRepository(':memory:');
  const group = await repo.create({
    id: 'grp_active_test_1',
    name: 'Active Default Test',
    members: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    expenses: [],
    payments: []
  });

  assert.equal(group.isActive, true);
  const fetched = await repo.get('grp_active_test_1');
  assert.equal(fetched.isActive, true);
});

test('Group Status API: PATCH /api/groups/:gid/status toggles status and enforces validation and auth', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);

  // Start test server on dynamic port
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Create two test users
    const user1 = await repo.auth.createUser({
      email: 'owner@example.com',
      username: 'owner_user',
      name: 'Owner User',
      password: 'Password123!'
    });
    const session1 = await repo.auth.createSession(user1.id);
    const token1 = session1.token;

    const user2 = await repo.auth.createUser({
      email: 'stranger@example.com',
      username: 'stranger_user',
      name: 'Stranger User',
      password: 'Password123!'
    });
    const session2 = await repo.auth.createSession(user2.id);
    const token2 = session2.token;

    // 2. User 1 creates a group
    const grp = await repo.create({
      id: 'grp_toggle_test_123',
      name: 'Toggle Test Group',
      members: [{ id: 1, name: 'Owner User', userId: user1.id }, { id: 2, name: 'Alice' }],
      expenses: [],
      payments: [],
      createdByUserId: user1.id
    });
    assert.equal(grp.isActive, true);

    // 3. User 2 (unauthorized) tries to toggle status -> 404 Group not found
    const resStranger = await fetch(`${baseUrl}/api/groups/${grp.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`
      },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(resStranger.status, 404);

    // 4. Invalid payload (non-boolean) -> 400
    const resBad = await fetch(`${baseUrl}/api/groups/${grp.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({ isActive: 'no' })
    });
    assert.equal(resBad.status, 400);

    // 5. User 1 (authorized) toggles to inactive -> 200
    const resToggleOff = await fetch(`${baseUrl}/api/groups/${grp.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(resToggleOff.status, 200);
    const offData = await resToggleOff.json();
    assert.equal(offData.isActive, false);

    const reloaded = await repo.get(grp.id);
    assert.equal(reloaded.isActive, false);

    // 6. User 1 toggles back to active -> 200
    const resToggleOn = await fetch(`${baseUrl}/api/groups/${grp.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({ isActive: true })
    });
    assert.equal(resToggleOn.status, 200);
    const onData = await resToggleOn.json();
    assert.equal(onData.isActive, true);
  } finally {
    server.close();
  }
});

test('Inactive Group Write Lock: Read operations succeed, mutating endpoints return 409', async () => {
  const repo = createLocalRepository(':memory:');
  const app = createApp(repo);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const user = await repo.auth.createUser({
      email: 'lockuser@example.com',
      username: 'lock_user',
      name: 'Lock User',
      password: 'Password123!'
    });
    const session = await repo.auth.createSession(user.id);
    const token = session.token;

    const grp = await repo.create({
      id: 'grp_locked_group_999',
      name: 'Locked Group',
      members: [{ id: 1, name: 'Lock User', userId: user.id }, { id: 2, name: 'Bob' }],
      expenses: [{ id: 1, description: 'Snacks', amount: 2000, paidBy: 1, splits: { 1: 1000, 2: 1000 }, createdAt: new Date().toISOString() }],
      payments: [],
      createdByUserId: user.id,
      isActive: false
    });

    // 1. Read operations work normally (200)
    const resGet = await fetch(`${baseUrl}/api/groups/${grp.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(resGet.status, 200);

    const resExp = await fetch(`${baseUrl}/api/groups/${grp.id}/expenses`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(resExp.status, 200);

    const resBal = await fetch(`${baseUrl}/api/groups/${grp.id}/balances`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(resBal.status, 200);

    // 2. POST /expenses returns 409
    const resAddExp = await fetch(`${baseUrl}/api/groups/${grp.id}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        description: 'Dinner',
        amount: 5000,
        paidBy: 1,
        split: { type: 'equal' }
      })
    });
    assert.equal(resAddExp.status, 409);
    const errExp = await resAddExp.json();
    assert.match(errExp.error, /inactive/i);

    // 3. POST /members returns 409
    const resAddMem = await fetch(`${baseUrl}/api/groups/${grp.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: 'Charlie' })
    });
    assert.equal(resAddMem.status, 409);

    // 4. DELETE /expenses/:eid returns 409
    const resDelExp = await fetch(`${baseUrl}/api/groups/${grp.id}/expenses/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(resDelExp.status, 409);

    // 5. POST /payments returns 409
    const resPay = await fetch(`${baseUrl}/api/groups/${grp.id}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ from: 2, to: 1, amount: 1000 })
    });
    assert.equal(resPay.status, 409);

    // Verify database had 0 changes
    const unmodified = await repo.get(grp.id);
    assert.equal(unmodified.expenses.length, 1);
    assert.equal(unmodified.members.length, 2);
    assert.equal(unmodified.payments.length, 0);
  } finally {
    server.close();
  }
});

test('AI Agent: Strict Group Guardrail blocks default-to-latest and asks user to choose group', async () => {
  const repo = createLocalRepository(':memory:');
  const user = await repo.auth.createUser({
    email: 'aiuser@example.com',
    username: 'ai_guard_user',
    name: 'AI User',
    password: 'Password123!'
  });

  // Create 2 active groups for this user
  const g1 = await repo.create({
    id: 'grp_goa_trip_12345',
    name: 'Goa Trip',
    members: [{ id: 1, name: 'AI User', userId: user.id }, { id: 2, name: 'Friend' }],
    expenses: [],
    payments: [],
    createdByUserId: user.id,
    isActive: true
  });

  const g2 = await repo.create({
    id: 'grp_manali_trip_67890',
    name: 'Manali Trip',
    members: [{ id: 1, name: 'AI User', userId: user.id }, { id: 2, name: 'Friend' }],
    expenses: [],
    payments: [],
    createdByUserId: user.id,
    isActive: true
  });

  // Scenario 1: User does NOT name a group ("add 100 for cab split equally")
  const resultClarify = await executeTool(
    'add_expense',
    {
      description: 'cab',
      amountRupees: 100,
      paidByName: 'AI User',
      splitType: 'equal'
    },
    repo,
    user,
    {
      messages: [{ role: 'user', content: 'add 100 for cab split equally' }]
    }
  );

  // Must return needsGroupClarification with options and ZERO writes
  assert.equal(resultClarify.needsGroupClarification, true);
  assert.ok(Array.isArray(resultClarify.options));
  assert.ok(resultClarify.options.some((o) => o.message.includes('Goa Trip')));
  assert.ok(resultClarify.options.some((o) => o.message.includes('Manali Trip')));

  const checkG1 = await repo.get(g1.id);
  const checkG2 = await repo.get(g2.id);
  assert.equal(checkG1.expenses.length, 0);
  assert.equal(checkG2.expenses.length, 0);

  // Scenario 2: User explicitly mentions Goa Trip
  const resultGoa = await executeTool(
    'add_expense',
    {
      groupId: g1.id,
      groupName: 'Goa Trip',
      description: 'cab',
      amount: 10000,
      paidBy: 1,
      split: { type: 'equal' }
    },
    repo,
    user,
    {
      messages: [{ role: 'user', content: 'add 100 for cab in Goa Trip split equally' }]
    }
  );

  assert.equal(resultGoa.needsGroupClarification, undefined);
  assert.equal(resultGoa.description, 'cab');
  assert.equal(resultGoa.amount, 10000);

  const updatedG1 = await repo.get(g1.id);
  assert.equal(updatedG1.expenses.length, 1);
  assert.equal(updatedG1.expenses[0].description, 'cab');
});

test('AI Agent: Inactive group blocks writes and asks to reactivate', async () => {
  const repo = createLocalRepository(':memory:');
  const user = await repo.auth.createUser({
    email: 'inactive_ai@example.com',
    username: 'ai_inactive_user',
    name: 'Inactive AI User',
    password: 'Password123!'
  });

  const inactiveGroup = await repo.create({
    id: 'grp_inactive_trip_111',
    name: 'Old Archived Trip',
    members: [{ id: 1, name: 'Inactive AI User', userId: user.id }, { id: 2, name: 'Friend' }],
    expenses: [],
    payments: [],
    createdByUserId: user.id,
    isActive: false
  });

  const resultBlocked = await executeTool(
    'add_expense',
    {
      groupId: inactiveGroup.id,
      description: 'Coffee',
      amountRupees: 50,
      paidByName: 'Inactive AI User',
      splitType: 'equal'
    },
    repo,
    user,
    {
      messages: [{ role: 'user', content: 'Add 50 for Coffee in Old Archived Trip' }]
    }
  );

  assert.equal(resultBlocked.isInactiveGroup, true);
  assert.ok(resultBlocked.options.some((o) => o.message.toLowerCase().includes('reactivate')));

  // Test set_group_status tool
  const resultReactivate = await executeTool(
    'set_group_status',
    {
      groupId: inactiveGroup.id,
      isActive: true
    },
    repo,
    user,
    {
      messages: [{ role: 'user', content: 'Reactivate Old Archived Trip' }]
    }
  );

  assert.equal(resultReactivate.isActive, true);
  const reactivated = await repo.get(inactiveGroup.id);
  assert.equal(reactivated.isActive, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/database/db');

test('Environment setup verification: health check returns 200 and ok', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
});

test('Database auto-initialization verification: tables exist on startup', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name);
  assert.ok(tables.includes('groups'), 'groups table exists');
  assert.ok(tables.includes('members'), 'members table exists');
  assert.ok(tables.includes('expenses'), 'expenses table exists');
  assert.ok(tables.includes('payments'), 'payments table exists');
});

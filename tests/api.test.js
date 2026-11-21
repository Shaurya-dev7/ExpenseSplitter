const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

// ===================================================================
// 1. POST /api/groups
// ===================================================================

test("API: POST /api/groups creates a new group and returns 201", async () => {
  const res = await request(app)
    .post("/api/groups")
    .send({
      name: "Hostel Room 204",
      members: ["Asha", "Ben"],
    });

  assert.equal(res.status, 201);
  assert.equal(typeof res.body.id, "string");
  assert.ok(res.body.id.length >= 10);
  assert.equal(res.body.name, "Hostel Room 204");
  assert.equal(res.body.members.length, 2);
  assert.deepEqual(res.body.members, [
    { id: 1, name: "Asha" },
    { id: 2, name: "Ben" },
  ]);
});

test("API: POST /api/groups validation errors return 400 with { errors: {...} }", async () => {
  // Empty name, too few members
  const res1 = await request(app).post("/api/groups").send({
    name: "",
    members: ["Asha"],
  });
  assert.equal(res1.status, 400);
  assert.ok("name" in res1.body.errors);
  assert.ok("members" in res1.body.errors);

  // Case-insensitive duplicate members in creation array
  const res2 = await request(app).post("/api/groups").send({
    name: "Duplicate Room",
    members: ["Asha", "asha"],
  });
  assert.equal(res2.status, 400);
  assert.ok("members" in res2.body.errors);

  // Exceeding 20 members limit
  const tooMany = Array.from({ length: 21 }, (_, i) => `User${i + 1}`);
  const res3 = await request(app).post("/api/groups").send({
    name: "Too Big",
    members: tooMany,
  });
  assert.equal(res3.status, 400);
  assert.ok("members" in res3.body.errors);
});

// ===================================================================
// 2. GET /api/groups/:gid
// ===================================================================

test("API: GET /api/groups/:gid returns 200 with group and members", async () => {
  const created = await request(app)
    .post("/api/groups")
    .send({ name: "Trip to Goa", members: ["Alice", "Bob", "Charlie"] });

  const gid = created.body.id;

  const res = await request(app).get(`/api/groups/${gid}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, gid);
  assert.equal(res.body.name, "Trip to Goa");
  assert.equal(res.body.members.length, 3);
  assert.equal(res.body.members[0].id, 1);
});

test("API: GET /api/groups/:gid returns 404 for unknown group", async () => {
  const res = await request(app).get("/api/groups/nonexistent_gid_1234");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Group not found");
});

// ===================================================================
// 3. POST /api/groups/:gid/members
// ===================================================================

test("API: POST /api/groups/:gid/members adds a member and returns 201", async () => {
  const created = await request(app)
    .post("/api/groups")
    .send({ name: "Project Team", members: ["Asha", "Ben"] });
  const gid = created.body.id;

  const res = await request(app)
    .post(`/api/groups/${gid}/members`)
    .send({ name: "Charlie" });

  assert.equal(res.status, 201);
  assert.equal(res.body.id, 3);
  assert.equal(res.body.name, "Charlie");

  // Verify group reflects 3 members
  const check = await request(app).get(`/api/groups/${gid}`);
  assert.equal(check.body.members.length, 3);
});

test("API: POST /api/groups/:gid/members returns 409 for duplicate member name", async () => {
  const created = await request(app)
    .post("/api/groups")
    .send({ name: "Dupes Team", members: ["Asha", "Ben"] });
  const gid = created.body.id;

  const res = await request(app)
    .post(`/api/groups/${gid}/members`)
    .send({ name: "asha" }); // case-insensitive duplicate

  assert.equal(res.status, 409);
  assert.equal(res.body.error, "Member name already exists in this group");
});

test("API: POST /api/groups/:gid/members returns 404 for unknown group", async () => {
  const res = await request(app)
    .post("/api/groups/unknown_group_9999/members")
    .send({ name: "David" });

  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Group not found");
});

test("API: POST /api/groups/:gid/members returns 400 when exceeding 20 members", async () => {
  const initial = Array.from({ length: 20 }, (_, i) => `Member_${i + 1}`);
  const created = await request(app)
    .post("/api/groups")
    .send({ name: "Max 20 Team", members: initial });
  const gid = created.body.id;

  const res = await request(app)
    .post(`/api/groups/${gid}/members`)
    .send({ name: "Member_21" });

  assert.equal(res.status, 400);
  assert.ok("members" in res.body.errors);
});

// ===================================================================
// 4. POST & GET & DELETE /api/groups/:gid/expenses
// ===================================================================

test("API: POST /api/groups/:gid/expenses adds an expense and returns 201", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Dinner Group", members: ["Asha", "Ben", "Charlie"] });
  const gid = group.body.id;

  const res = await request(app)
    .post(`/api/groups/${gid}/expenses`)
    .send({
      description: "Dinner",
      amount: 9000,
      paidBy: 1,
      split: {
        type: "equal",
        participants: [1, 2, 3],
      },
    });

  assert.equal(res.status, 201);
  assert.equal(typeof res.body.id, "number");
  assert.equal(res.body.description, "Dinner");
  assert.equal(res.body.amount, 9000);
  assert.equal(res.body.paidBy, 1);
  assert.deepEqual(res.body.splits, {
    "1": 3000,
    "2": 3000,
    "3": 3000,
  });
  assert.ok("createdAt" in res.body);
});

test("API: POST /api/groups/:gid/expenses validates split errors with 400 { errors: {...} }", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Validation Expense Group", members: ["Asha", "Ben"] });
  const gid = group.body.id;

  // Invalid amount and unknown paidBy
  const res = await request(app)
    .post(`/api/groups/${gid}/expenses`)
    .send({
      description: "Coffee",
      amount: -50,
      paidBy: 99,
      split: { type: "equal" },
    });

  assert.equal(res.status, 400);
  assert.ok("amount" in res.body.errors);
  assert.ok("paidBy" in res.body.errors);
});

test("API: GET /api/groups/:gid/expenses lists expenses oldest first", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Expense Order Group", members: ["Asha", "Ben"] });
  const gid = group.body.id;

  const e1 = await request(app)
    .post(`/api/groups/${gid}/expenses`)
    .send({
      description: "First",
      amount: 1000,
      paidBy: 1,
      split: { type: "equal" },
    });

  const e2 = await request(app)
    .post(`/api/groups/${gid}/expenses`)
    .send({
      description: "Second",
      amount: 2000,
      paidBy: 2,
      split: { type: "equal" },
    });

  const res = await request(app).get(`/api/groups/${gid}/expenses`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].id, e1.body.id); // oldest first
  assert.equal(res.body[1].id, e2.body.id);
});

test("API: DELETE /api/groups/:gid/expenses/:eid returns 204 with no body", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Delete Expense Group", members: ["Asha", "Ben"] });
  const gid = group.body.id;

  const created = await request(app)
    .post(`/api/groups/${gid}/expenses`)
    .send({
      description: "To Delete",
      amount: 1500,
      paidBy: 1,
      split: { type: "equal" },
    });

  const eid = created.body.id;

  const res = await request(app).delete(`/api/groups/${gid}/expenses/${eid}`);
  assert.equal(res.status, 204);
  assert.equal(res.text, "");

  // Verify deletion from list
  const list = await request(app).get(`/api/groups/${gid}/expenses`);
  assert.equal(list.body.length, 0);

  // Deleting again returns 404
  const resNotFound = await request(app).delete(`/api/groups/${gid}/expenses/${eid}`);
  assert.equal(resNotFound.status, 404);
  assert.equal(resNotFound.body.error, "Expense not found");
});

// ===================================================================
// 5. POST /api/groups/:gid/payments
// ===================================================================

test("API: POST /api/groups/:gid/payments records payment and returns 201", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Payment Group", members: ["Asha", "Ben"] });
  const gid = group.body.id;

  const res = await request(app)
    .post(`/api/groups/${gid}/payments`)
    .send({
      from: 2,
      to: 1,
      amount: 35000,
    });

  assert.equal(res.status, 201);
  assert.equal(typeof res.body.id, "number");
  assert.equal(res.body.from, 2);
  assert.equal(res.body.to, 1);
  assert.equal(res.body.amount, 35000);
  assert.ok("createdAt" in res.body);
});

test("API: POST /api/groups/:gid/payments validates from === to with 400", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Self Payment Group", members: ["Asha", "Ben"] });
  const gid = group.body.id;

  const res = await request(app)
    .post(`/api/groups/${gid}/payments`)
    .send({
      from: 1,
      to: 1,
      amount: 1000,
    });

  assert.equal(res.status, 400);
  assert.ok("to" in res.body.errors);
});

// ===================================================================
// 6. GET /api/groups/:gid/balances & /api/groups/:gid/settlements
// ===================================================================

test("API: GET /api/groups/:gid/balances computes correct balances", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Balances Group", members: ["Asha", "Ben"] });
  const gid = group.body.id;

  // Asha pays 7000 split equally (3500 each)
  await request(app)
    .post(`/api/groups/${gid}/expenses`)
    .send({
      description: "Cab",
      amount: 7000,
      paidBy: 1,
      split: { type: "equal" },
    });

  const res = await request(app).get(`/api/groups/${gid}/balances`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    balances: [
      { memberId: 1, name: "Asha", balance: 3500 },
      { memberId: 2, name: "Ben", balance: -3500 },
    ],
  });
});

test("API: GET /api/groups/:gid/settlements suggests greedy transfers", async () => {
  const group = await request(app)
    .post("/api/groups")
    .send({ name: "Settlements Group", members: ["Asha", "Ben"] });
  const gid = group.body.id;

  await request(app)
    .post(`/api/groups/${gid}/expenses`)
    .send({
      description: "Cab",
      amount: 7000,
      paidBy: 1,
      split: { type: "equal" },
    });

  const res = await request(app).get(`/api/groups/${gid}/settlements`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    transfers: [{ from: 2, to: 1, amount: 3500 }],
  });

  // Recording the payment settles the group
  await request(app)
    .post(`/api/groups/${gid}/payments`)
    .send({ from: 2, to: 1, amount: 3500 });

  const settled = await request(app).get(`/api/groups/${gid}/settlements`);
  assert.deepEqual(settled.body, { transfers: [] });
});

// ===================================================================
// 7. Global Middleware: Malformed JSON & 404 Routing
// ===================================================================

test("API: Malformed JSON in request body returns 400 { error: 'Invalid JSON in request body' }", async () => {
  const res = await request(app)
    .post("/api/groups")
    .set("Content-Type", "application/json")
    .send('{"name": "broken,');

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "Invalid JSON in request body");
});

test("API: Unmatched /api/* route returns 404 { error: 'Endpoint not found' }", async () => {
  const res = await request(app).get("/api/nonexistent-endpoint-test");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Endpoint not found");
});

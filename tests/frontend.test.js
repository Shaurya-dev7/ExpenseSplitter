const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

test("Frontend: GET / serves index.html with valid HTML structure", async () => {
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /html/);
  assert.ok(res.text.includes("<!DOCTYPE html>"));
  assert.ok(res.text.includes("SplitFair"));
  assert.ok(res.text.includes("view-home"));
  assert.ok(res.text.includes("view-group"));
  assert.ok(res.text.includes("/css/style.css"));
  assert.ok(res.text.includes("/js/money.js"));
  assert.ok(res.text.includes("/js/api.js"));
  assert.ok(res.text.includes("/js/app.js"));
});

test("Frontend: GET /css/style.css serves responsive CSS", async () => {
  const res = await request(app).get("/css/style.css");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /css/);
  assert.ok(res.text.includes(":root"));
  assert.ok(res.text.includes("--touch-target: 44px"));
  assert.ok(res.text.includes(".group-nav-tabs"));
});

test("Frontend: GET /js/money.js serves exact integer math utilities", async () => {
  const res = await request(app).get("/js/money.js");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /javascript/);
  assert.ok(res.text.includes("parseRupeesToPaise"));
  assert.ok(res.text.includes("formatPaiseToRupees"));
  assert.ok(res.text.includes("calculatePreviewSplits"));
});

test("Frontend: GET /js/api.js serves REST API client wrapper", async () => {
  const res = await request(app).get("/js/api.js");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /javascript/);
  assert.ok(res.text.includes("createGroup"));
  assert.ok(res.text.includes("addExpense"));
  assert.ok(res.text.includes("recordPayment"));
});

test("Frontend: GET /js/app.js serves vanilla SPA client", async () => {
  const res = await request(app).get("/js/app.js");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /javascript/);
  assert.ok(res.text.includes("loadGroupData"));
  assert.ok(res.text.includes("startPolling"));
  assert.ok(res.text.includes("renderExpensesTab"));
});

const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../src/shared/core.js");

test("buildMetrics computes rates and risk states", () => {
  const now = Date.UTC(2026, 3, 3);
  const dayMs = 24 * 60 * 60 * 1000;

  const orderDates = [
    now - 5 * dayMs,
    now - 20 * dayMs,
    now - 35 * dayMs,
    now - 70 * dayMs
  ];

  const reviewDates = [
    now - 4 * dayMs,
    now - 10 * dayMs
  ];

  const metrics = core.buildMetrics(orderDates, reviewDates, now);

  assert.equal(metrics.periods[90].orders, 4);
  assert.equal(metrics.periods[90].reviews, 2);
  assert.equal(metrics.periods[90].rate, 50);
  assert.equal(metrics.periods[90].status, "at-risk");

  assert.equal(metrics.periods[30].orders, 2);
  assert.equal(metrics.periods[30].reviews, 2);
  assert.equal(metrics.periods[30].rate, 100);
  assert.equal(metrics.periods[30].status, "ok");
});

test("zero orders returns N/A semantics via null rate", () => {
  const now = Date.UTC(2026, 3, 3);
  const metrics = core.buildMetrics([], [now], now);

  assert.equal(metrics.periods[90].orders, 0);
  assert.equal(metrics.periods[90].reviews, 1);
  assert.equal(metrics.periods[90].rate, null);
  assert.equal(metrics.periods[90].status, "ok");
});

test("extractDateFromText parses localized date formats", () => {
  const a = core.extractDateFromText("Ordered on 03/15/2026", "en-US");
  const b = core.extractDateFromText("Ordine del 15/03/2026", "it-IT");

  assert.ok(a instanceof Date);
  assert.ok(b instanceof Date);
  assert.equal(a.getUTCFullYear(), 2026);
  assert.equal(b.getUTCMonth() + 1, 3);
});

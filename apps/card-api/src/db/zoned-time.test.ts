import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zonedMonthStart } from "./zoned-time.js";

const TZ = "Europe/Stockholm";

describe("zonedMonthStart", () => {
  it("is local midnight on the 1st in summer time", () => {
    assert.equal(zonedMonthStart(new Date("2026-09-15T12:00:00Z"), TZ).toISOString(), "2026-08-31T22:00:00.000Z");
  });

  it("is local midnight on the 1st in winter time", () => {
    assert.equal(zonedMonthStart(new Date("2026-11-10T12:00:00Z"), TZ).toISOString(), "2026-10-31T23:00:00.000Z");
  });

  it("crosses a daylight saving change between now and the month start", () => {
    assert.equal(zonedMonthStart(new Date("2026-03-31T12:00:00Z"), TZ).toISOString(), "2026-02-28T23:00:00.000Z");
    assert.equal(zonedMonthStart(new Date("2026-03-31T12:00:00Z"), TZ, 1).toISOString(), "2026-03-31T22:00:00.000Z");
  });

  it("uses the local month, not the UTC month, near midnight", () => {
    assert.equal(zonedMonthStart(new Date("2026-09-30T22:30:00Z"), TZ).toISOString(), "2026-09-30T22:00:00.000Z");
  });

  it("goes back across a year boundary", () => {
    assert.equal(zonedMonthStart(new Date("2026-01-10T12:00:00Z"), TZ, -1).toISOString(), "2025-11-30T23:00:00.000Z");
  });
});

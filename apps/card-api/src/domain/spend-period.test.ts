import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spendPeriodOf } from "./spend-period.js";

const iso = ({ start, end }: { start: Date; end: Date }) => [start.toISOString(), end.toISOString()];

describe("spendPeriodOf", () => {
  it("is the UTC calendar month", () => {
    assert.deepEqual(iso(spendPeriodOf(new Date("2026-09-15T12:00:00Z"))), [
      "2026-09-01T00:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
    ]);
  });

  it("starts exactly at UTC midnight on the 1st", () => {
    assert.equal(spendPeriodOf(new Date("2026-10-01T00:00:00Z")).start.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(spendPeriodOf(new Date("2026-09-30T23:59:59.999Z")).start.toISOString(), "2026-09-01T00:00:00.000Z");
  });

  it("crosses year boundaries in both directions", () => {
    assert.deepEqual(iso(spendPeriodOf(new Date("2026-12-10T00:00:00Z"))), [
      "2026-12-01T00:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
    ]);
    assert.equal(spendPeriodOf(new Date("2026-01-10T00:00:00Z"), -1).start.toISOString(), "2025-12-01T00:00:00.000Z");
  });
});

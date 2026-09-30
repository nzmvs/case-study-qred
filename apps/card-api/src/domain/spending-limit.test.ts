import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkSpendingLimit, remainingSpend, SpendingLimitExceeded } from "./spending-limit.js";

const exceeded = (remaining: number) => (error: unknown) =>
  error instanceof SpendingLimitExceeded && error.remaining === remaining;

describe("remainingSpend", () => {
  it("is the Spending limit minus what was spent", () => {
    assert.equal(remainingSpend(1_000_000, 460_000), 540_000);
  });

  it("is never below zero, even after the limit was lowered", () => {
    assert.equal(remainingSpend(300_000, 460_000), 0);
  });
});

describe("checkSpendingLimit", () => {
  it("accepts a Transaction of exactly the Remaining spend", () => {
    assert.doesNotThrow(() => checkSpendingLimit(540_000, 1_000_000, 460_000));
  });

  it("refuses one öre more and reports the Remaining spend", () => {
    assert.throws(() => checkSpendingLimit(540_001, 1_000_000, 460_000), exceeded(540_000));
  });

  it("refuses any amount once the limit is used up", () => {
    assert.throws(() => checkSpendingLimit(1, 300_000, 460_000), exceeded(0));
  });
});

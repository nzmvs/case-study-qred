import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedTransitions,
  CardStatus,
  CardTransition,
  checkClosedReason,
  ClosedReasonChange,
  effectiveStatus,
  IllegalTransition,
  resolveTransition,
} from "./card-lifecycle.js";

const { Inactive, Active, Frozen, Closed, Expired } = CardStatus;
const { Activate, Freeze, Unfreeze, Close } = CardTransition;
const NONE = null;
const ILLEGAL = IllegalTransition;

// Every (current, requested) pair: the transition it resolves to, NONE for no change, ILLEGAL otherwise.
const EXPECTED: Record<CardStatus, Record<CardStatus, CardTransition | typeof NONE | typeof ILLEGAL>> = {
  [Inactive]: { [Inactive]: NONE, [Active]: Activate, [Frozen]: ILLEGAL, [Closed]: Close, [Expired]: ILLEGAL },
  [Active]: { [Inactive]: ILLEGAL, [Active]: NONE, [Frozen]: Freeze, [Closed]: Close, [Expired]: ILLEGAL },
  [Frozen]: { [Inactive]: ILLEGAL, [Active]: Unfreeze, [Frozen]: NONE, [Closed]: Close, [Expired]: ILLEGAL },
  [Closed]: { [Inactive]: ILLEGAL, [Active]: ILLEGAL, [Frozen]: ILLEGAL, [Closed]: NONE, [Expired]: ILLEGAL },
  [Expired]: { [Inactive]: ILLEGAL, [Active]: ILLEGAL, [Frozen]: ILLEGAL, [Closed]: ILLEGAL, [Expired]: NONE },
};

describe("resolveTransition", () => {
  for (const current of Object.values(CardStatus)) {
    for (const requested of Object.values(CardStatus)) {
      const expected = EXPECTED[current][requested];
      const label = expected === ILLEGAL ? "illegal" : (expected ?? "no change");
      it(`${current} -> ${requested}: ${label}`, () => {
        if (expected === ILLEGAL) {
          assert.throws(() => resolveTransition(current, requested), IllegalTransition);
        } else {
          assert.equal(resolveTransition(current, requested), expected);
        }
      });
    }
  }

  it("reports what is allowed from the current status", () => {
    try {
      resolveTransition(Active, Inactive);
      assert.fail("expected IllegalTransition");
    } catch (error) {
      assert.ok(error instanceof IllegalTransition);
      assert.deepEqual(error.allowed, [
        { transition: Freeze, status: Frozen },
        { transition: Close, status: Closed },
      ]);
    }
  });
});

describe("allowedTransitions", () => {
  it("pairs each allowed transition with the status that makes it", () => {
    assert.deepEqual(allowedTransitions(Inactive), [
      { transition: Activate, status: Active },
      { transition: Close, status: Closed },
    ]);
    assert.deepEqual(allowedTransitions(Active), [
      { transition: Freeze, status: Frozen },
      { transition: Close, status: Closed },
    ]);
    assert.deepEqual(allowedTransitions(Frozen), [
      { transition: Unfreeze, status: Active },
      { transition: Close, status: Closed },
    ]);
    assert.deepEqual(allowedTransitions(Closed), []);
    assert.deepEqual(allowedTransitions(Expired), []);
  });
});

describe("checkClosedReason", () => {
  it("accepts a closed Card's own reason", () => {
    assert.doesNotThrow(() => checkClosedReason({ status: Closed, closedReason: "lost" }, "lost"));
  });

  it("refuses a different reason for a closed Card", () => {
    assert.throws(() => checkClosedReason({ status: Closed, closedReason: "lost" }, "stolen"), ClosedReasonChange);
  });

  it("lets a Card that is not closed take a reason as it closes", () => {
    assert.doesNotThrow(() => checkClosedReason({ status: Active, closedReason: null }, "stolen"));
  });
});

describe("effectiveStatus", () => {
  const expiresAt = new Date("2029-09-30T22:00:00Z");
  const before = new Date("2029-09-30T21:59:59.999Z");

  it("keeps the stored status before expiry", () => {
    assert.equal(effectiveStatus(Active, expiresAt, before), Active);
  });

  it("is expired from the expiry instant on", () => {
    for (const stored of [Inactive, Active, Frozen]) {
      assert.equal(effectiveStatus(stored, expiresAt, expiresAt), Expired);
    }
  });

  it("never turns a closed card into an expired one", () => {
    assert.equal(effectiveStatus(Closed, expiresAt, expiresAt), Closed);
  });
});

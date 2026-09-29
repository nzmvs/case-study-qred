import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveStatus, InvoiceStatus } from "./invoice-status.js";

const dueAt = new Date("2026-10-15T22:00:00Z");

describe("effectiveStatus", () => {
  it("is open until the due instant", () => {
    assert.equal(effectiveStatus(InvoiceStatus.Open, dueAt, new Date("2026-10-15T21:59:59.999Z")), InvoiceStatus.Open);
  });

  it("is overdue from the due instant on", () => {
    assert.equal(effectiveStatus(InvoiceStatus.Open, dueAt, dueAt), InvoiceStatus.Overdue);
  });

  it("never turns a paid invoice overdue", () => {
    assert.equal(effectiveStatus(InvoiceStatus.Paid, dueAt, new Date("2027-01-01T00:00:00Z")), InvoiceStatus.Paid);
  });
});

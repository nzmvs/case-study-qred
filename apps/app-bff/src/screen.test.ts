import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleCardOverview, type CardOverviewInputs } from "./screen.js";

const COMPANY_AB = "00000000-0000-4000-a000-000000000101";

function inputs(overrides: Partial<CardOverviewInputs> = {}): CardOverviewInputs {
  return {
    me: {
      id: "u1",
      name: "Anna Lindqvist",
      companies: [
        { id: COMPANY_AB, name: "Company AB" },
        { id: "c2", name: "Nordic Trading AB" },
      ],
    },
    selectedCompanyId: COMPANY_AB,
    card: {
      etag: '"abc"',
      data: {
        id: "card1",
        createdAt: "2026-01-12T09:00:00.000Z",
        updatedAt: "2026-01-14T07:30:00.000Z",
        details: { companyId: COMPANY_AB, holderUserId: "u1", last4: "4821", expiry: { month: 9, year: 2029 }, currency: "SEK" },
        settings: { spendingLimit: 1_000_000 },
        state: {
          status: "active",
          closedReason: null,
          allowedTransitions: [
            { transition: "freeze", status: "frozen" },
            { transition: "close", status: "closed" },
          ],
        },
      },
    },
    spend: {
      ok: true,
      value: {
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-10-01T00:00:00.000Z",
        spendingLimit: { amount: 1_000_000, currency: "SEK" },
        spent: { amount: 460_000, currency: "SEK" },
        remaining: { amount: 540_000, currency: "SEK" },
      },
    },
    transactions: {
      ok: true,
      value: {
        totalCount: 57,
        nextCursor: "next",
        items: [1, 2, 3].map((n) => ({
          id: `t${n}`,
          cardId: "card1",
          amount: { amount: n * 100, currency: "SEK" },
          merchantName: `M${n}`,
          occurredAt: "2026-09-28T10:00:00.000Z",
          status: "settled" as const,
        })),
      },
    },
    invoices: {
      ok: true,
      value: { items: [
        {
          id: "i1",
          companyId: COMPANY_AB,
          amount: { amount: 1_249_000, currency: "SEK" },
          dueDate: "2026-10-15",
          status: "open",
          issuedAt: "2026-09-14T22:00:00.000Z",
        },
      ] },
    },
    ...overrides,
  };
}

describe("assembleCardOverview", () => {
  it("shapes the mock's Screen", () => {
    const screen = assembleCardOverview(inputs());
    assert.deepEqual(screen.card, {
      id: "card1",
      status: "active",
      last4: "4821",
      expiry: "09/29",
      holderName: "Anna Lindqvist",
      etag: '"abc"',
      actions: [{ action: "freeze", status: "frozen" }],
    });
    assert.deepEqual(screen.spend, {
      remaining: { amount: 540_000, currency: "SEK" },
      spendingLimit: { amount: 1_000_000, currency: "SEK" },
      spent: { amount: 460_000, currency: "SEK" },
      periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(screen.latestTransactions?.moreCount, 54);
    assert.equal(screen.invoiceDue?.dueDate, "2026-10-15");
    assert.deepEqual(screen.unavailable, []);
  });

  it("offers activate for an inactive Card, with the status to send, and never close", () => {
    const base = inputs().card!;
    const allowedTransitions = [
      { transition: "activate" as const, status: "active" as const },
      { transition: "close" as const, status: "closed" as const },
    ];
    const card = { ...base, data: { ...base.data, state: { status: "inactive" as const, closedReason: null, allowedTransitions } } };
    assert.deepEqual(assembleCardOverview(inputs({ card })).card?.actions, [{ action: "activate", status: "active" }]);
  });

  it("lists failed optional sections as unavailable, distinct from empty", () => {
    const screen = assembleCardOverview(inputs({ invoices: { ok: false }, spend: { ok: false } }));
    assert.equal(screen.invoiceDue, null);
    assert.equal(screen.spend, null);
    assert.deepEqual(screen.unavailable, ["spend", "invoiceDue"]);

    const empty = assembleCardOverview(inputs({ invoices: { ok: true, value: { items: [] } } }));
    assert.equal(empty.invoiceDue, null);
    assert.deepEqual(empty.unavailable, []);
  });

  it("has no card sections without a Card, and they are not unavailable", () => {
    const screen = assembleCardOverview(inputs({ card: null, spend: null, transactions: null }));
    assert.equal(screen.card, null);
    assert.equal(screen.spend, null);
    assert.equal(screen.latestTransactions, null);
    assert.deepEqual(screen.unavailable, []);
  });
});

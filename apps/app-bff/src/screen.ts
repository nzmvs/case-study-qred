import type { components as Bff } from "./generated/app-bff.js";
import type { components as Billing } from "./generated/billing-api.js";
import type { components as CardApi } from "./generated/card-api.js";
import type { components as Identity } from "./generated/identity-api.js";

export type CardOverviewScreen = Bff["schemas"]["CardOverviewScreen"];
type CardSummary = Bff["schemas"]["CardSummary"];
type UnavailableSection = CardOverviewScreen["unavailable"][number];

export type Section<T> = { ok: true; value: T } | { ok: false };

export type CardOverviewInputs = {
  me: Identity["schemas"]["Me"];
  selectedCompanyId: string;
  card: { data: CardApi["schemas"]["Card"]; etag: string } | null;
  spend: Section<CardApi["schemas"]["Spend"]> | null;
  transactions: Section<CardApi["schemas"]["TransactionPage"]> | null;
  invoices: Section<{ items: Billing["schemas"]["Invoice"][] }>;
};

export const LATEST_TRANSACTIONS = 3;
const SCREEN_ACTIONS: readonly string[] = ["activate", "freeze", "unfreeze"] satisfies CardSummary["actions"][number]["action"][];

function toCardSummary({ data: card, etag }: NonNullable<CardOverviewInputs["card"]>, holderName: string): CardSummary {
  const { month, year } = card.details.expiry;
  return {
    id: card.id,
    status: card.state.status as CardSummary["status"],
    last4: card.details.last4,
    expiry: `${String(month).padStart(2, "0")}/${String(year % 100).padStart(2, "0")}`,
    holderName,
    etag,
    actions: card.state.allowedTransitions
      .filter(({ transition }) => SCREEN_ACTIONS.includes(transition))
      .map(({ transition, status }) => ({ action: transition, status })) as CardSummary["actions"],
  };
}

export function assembleCardOverview(inputs: CardOverviewInputs): CardOverviewScreen {
  const { me, selectedCompanyId, card, spend, transactions, invoices } = inputs;
  const unavailable: UnavailableSection[] = [];
  const section = <T, R>(name: UnavailableSection, result: Section<T> | null, shape: (value: T) => R): R | null => {
    if (result === null) return null;
    if (!result.ok) {
      unavailable.push(name);
      return null;
    }
    return shape(result.value);
  };

  return {
    companySwitcher: {
      selectedCompanyId,
      companies: me.companies.map(({ id, name }) => ({ id, name })),
    },
    card: card ? toCardSummary(card, me.name) : null,
    spend: section("spend", spend, ({ remaining, spendingLimit, spent, periodStart, periodEnd }) => ({
      remaining,
      spendingLimit,
      spent,
      periodStart,
      periodEnd,
    })),
    latestTransactions: section("latestTransactions", transactions, (page) => {
      const items = page.items.slice(0, LATEST_TRANSACTIONS);
      return {
        items: items.map(({ id, merchantName, amount, occurredAt, status }) => ({ id, merchantName, amount, occurredAt, status })),
        totalCount: page.totalCount,
        moreCount: Math.max(0, page.totalCount - items.length),
      };
    }),
    invoiceDue: section("invoiceDue", invoices, ({ items }) => {
      const next = items[0];
      return next ? { id: next.id, amount: next.amount, dueDate: next.dueDate, status: next.status as "open" | "overdue" } : null;
    }),
    unavailable,
  };
}

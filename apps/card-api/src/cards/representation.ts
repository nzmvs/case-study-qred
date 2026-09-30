import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { Selectable } from "kysely";
import type { Cards } from "../db/types.js";
import { allowedTransitions, type CardStatus, effectiveStatus } from "../domain/card-lifecycle.js";
import type { components } from "../generated/card-api.js";

export type Card = components["schemas"]["Card"];
export type CardRow = Selectable<Cards>;

export function toCard(row: CardRow, now: Date): Card {
  const status = effectiveStatus(row.status as CardStatus, row.expiresAt, now);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    details: {
      companyId: row.companyId,
      holderUserId: row.holderUserId,
      last4: row.last4,
      expiry: { month: row.expiryMonth, year: row.expiryYear },
      currency: row.currency,
    },
    settings: { spendingLimit: row.spendingLimit },
    state: {
      status,
      closedReason: row.closedReason as Card["state"]["closedReason"],
      allowedTransitions: allowedTransitions(status),
    },
  };
}

export function etagOf(card: Card): string {
  return `"${createHash("sha256").update(canonicalize(card)!).digest("base64url").slice(0, 16)}"`;
}

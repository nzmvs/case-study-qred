import { TransactionStatus } from "./transaction-status.js";

export const COUNTED_STATUSES = [TransactionStatus.Pending, TransactionStatus.Settled];

export class SpendingLimitExceeded extends Error {
  constructor(readonly remaining: number) {
    super(`The Transaction exceeds the Remaining spend of ${remaining} for this Spend period.`);
  }
}

export function remainingSpend(spendingLimit: number, spent: number): number {
  return Math.max(0, spendingLimit - spent);
}

export function checkSpendingLimit(amount: number, spendingLimit: number, spent: number): void {
  const remaining = remainingSpend(spendingLimit, spent);
  if (amount > remaining) throw new SpendingLimitExceeded(remaining);
}

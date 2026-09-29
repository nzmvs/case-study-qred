export const TransactionStatus = {
  Pending: "pending",
  Settled: "settled",
  Reversed: "reversed",
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

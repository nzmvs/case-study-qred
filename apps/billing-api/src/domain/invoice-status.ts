export const InvoiceStatus = {
  Open: "open",
  Overdue: "overdue",
  Paid: "paid",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export type StoredInvoiceStatus = typeof InvoiceStatus.Open | typeof InvoiceStatus.Paid;

export function effectiveStatus(stored: StoredInvoiceStatus, dueAt: Date, now: Date): InvoiceStatus {
  return stored === InvoiceStatus.Open && now >= dueAt ? InvoiceStatus.Overdue : stored;
}

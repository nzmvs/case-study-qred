export function spendPeriodOf(instant: Date, monthOffset = 0): { start: Date; end: Date } {
  const year = instant.getUTCFullYear();
  const month = instant.getUTCMonth() + monthOffset;
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
}

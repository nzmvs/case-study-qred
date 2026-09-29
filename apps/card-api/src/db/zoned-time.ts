function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant of local midnight on the 1st, `monthOffset` months from the month containing `instant`. */
export function zonedMonthStart(instant: Date, timeZone: string, monthOffset = 0): Date {
  const local = new Date(instant.getTime() + offsetMs(instant, timeZone));
  const wallClock = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + monthOffset, 1);
  // Solve t + offset(t) = wallClock; a second pass settles DST changes between the guess and the answer.
  const first = wallClock - offsetMs(new Date(wallClock), timeZone);
  return new Date(wallClock - offsetMs(new Date(first), timeZone));
}

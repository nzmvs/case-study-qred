export const CardStatus = {
  Inactive: "inactive",
  Active: "active",
  Frozen: "frozen",
  Closed: "closed",
  Expired: "expired",
} as const;
export type CardStatus = (typeof CardStatus)[keyof typeof CardStatus];

export const CardTransition = {
  Activate: "activate",
  Freeze: "freeze",
  Unfreeze: "unfreeze",
  Close: "close",
} as const;
export type CardTransition = (typeof CardTransition)[keyof typeof CardTransition];

const TRANSITIONS = {
  [CardTransition.Activate]: { from: [CardStatus.Inactive], to: CardStatus.Active },
  [CardTransition.Freeze]: { from: [CardStatus.Active], to: CardStatus.Frozen },
  [CardTransition.Unfreeze]: { from: [CardStatus.Frozen], to: CardStatus.Active },
  [CardTransition.Close]: {
    from: [CardStatus.Inactive, CardStatus.Active, CardStatus.Frozen],
    to: CardStatus.Closed,
  },
} as const satisfies Record<CardTransition, { from: readonly CardStatus[]; to: CardStatus }>;

const TERMINAL: readonly CardStatus[] = [CardStatus.Closed, CardStatus.Expired];

export type AllowedTransition = { transition: CardTransition; status: CardStatus };

export class IllegalTransition extends Error {
  constructor(
    readonly from: CardStatus,
    readonly to: CardStatus,
    readonly allowed: AllowedTransition[],
  ) {
    super(`A card cannot go from ${from} to ${to}.`);
  }
}

export class ClosedReasonChange extends Error {
  constructor() {
    super("A closed card's closedReason cannot change.");
  }
}

export function checkClosedReason(current: { status: CardStatus; closedReason: string | null }, requestedReason: string | null): void {
  if (current.status === CardStatus.Closed && requestedReason !== current.closedReason) throw new ClosedReasonChange();
}

export function effectiveStatus(stored: CardStatus, expiresAt: Date, now: Date): CardStatus {
  if (TERMINAL.includes(stored)) return stored;
  return now >= expiresAt ? CardStatus.Expired : stored;
}

export function allowedTransitions(status: CardStatus): AllowedTransition[] {
  return Object.values(CardTransition)
    .filter((t) => (TRANSITIONS[t].from as readonly CardStatus[]).includes(status))
    .map((t) => ({ transition: t, status: TRANSITIONS[t].to }));
}

export function resolveTransition(current: CardStatus, requested: CardStatus): CardTransition | null {
  if (current === requested) return null;
  const allowed = allowedTransitions(current);
  const match = allowed.find((t) => t.status === requested);
  if (!match) throw new IllegalTransition(current, requested, allowed);
  return match.transition;
}

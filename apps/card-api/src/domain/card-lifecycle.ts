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

export class IllegalTransition extends Error {
  constructor(
    readonly from: CardStatus,
    readonly to: CardStatus,
    readonly allowed: CardTransition[],
  ) {
    super(`A card cannot go from ${from} to ${to}.`);
  }
}

export function effectiveStatus(stored: CardStatus, expiresAt: Date, now: Date): CardStatus {
  if (TERMINAL.includes(stored)) return stored;
  return now >= expiresAt ? CardStatus.Expired : stored;
}

export function allowedTransitions(status: CardStatus): CardTransition[] {
  return Object.values(CardTransition).filter((t) =>
    (TRANSITIONS[t].from as readonly CardStatus[]).includes(status),
  );
}

export function resolveTransition(current: CardStatus, requested: CardStatus): CardTransition | null {
  if (current === requested) return null;
  const match = allowedTransitions(current).find((t) => TRANSITIONS[t].to === requested);
  if (!match) throw new IllegalTransition(current, requested, allowedTransitions(current));
  return match;
}

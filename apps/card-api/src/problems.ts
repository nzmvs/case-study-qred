import { type ErrorMapper, httpErrors, type ProblemFields } from "@qred/service-kit";
import { type CardStatus, ClosedReasonChange, IllegalTransition } from "./domain/card-lifecycle.js";
import { SpendingLimitExceeded } from "./domain/spending-limit.js";

export const cardNotFound = () => httpErrors.notFound("The Card does not exist or is not visible to the caller.");
export const staleCard = () => httpErrors.preconditionFailed("The Card changed since its ETag was read.");
export const cardNotActive = (status: CardStatus) =>
  httpErrors.createError(409, `A card that is ${status} cannot be charged.`, {
    problemType: "card-not-active",
    title: "Card not active",
  } satisfies ProblemFields);

export const mapCardError: ErrorMapper = (error) => {
  if (error instanceof IllegalTransition) {
    return httpErrors.createError(409, error.message, {
      problemType: "illegal-transition",
      title: "Illegal card status transition",
      allowedTransitions: error.allowed,
    } satisfies ProblemFields);
  }
  if (error instanceof ClosedReasonChange || error instanceof SpendingLimitExceeded) return httpErrors.unprocessableEntity(error.message);
  return undefined;
};

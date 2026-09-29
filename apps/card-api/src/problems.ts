import { type ErrorMapper, httpErrors, type ProblemFields } from "@qred/service-kit";
import { IllegalTransition } from "./domain/card-lifecycle.js";

export const cardNotFound = () => httpErrors.notFound("The Card does not exist or is not visible to the caller.");
export const staleCard = () => httpErrors.preconditionFailed("The Card changed since its ETag was read.");
export const cardNotActive = (status: string) =>
  httpErrors.createError(409, `A card that is ${status} cannot be charged.`, {
    problemType: "card-not-active",
    title: "Card not active",
  } satisfies ProblemFields);

export const mapCardError: ErrorMapper = (error) =>
  error instanceof IllegalTransition
    ? httpErrors.createError(409, error.message, {
        problemType: "illegal-transition",
        title: "Illegal card status transition",
        allowedTransitions: error.allowed,
      } satisfies ProblemFields)
    : undefined;

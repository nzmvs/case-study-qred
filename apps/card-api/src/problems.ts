import { type ErrorMapper, notFound, Problem, preconditionFailed } from "@qred/service-kit";
import { IllegalTransition } from "./domain/card-lifecycle.js";

export const cardNotFound = () => notFound("The Card does not exist or is not visible to the caller.");
export const staleCard = () => preconditionFailed("The Card changed since its ETag was read.");
export const cardNotActive = (status: string) =>
  new Problem(409, "card-not-active", "Card not active", `A card that is ${status} cannot be charged.`);

export const mapCardError: ErrorMapper = (error) =>
  error instanceof IllegalTransition
    ? new Problem(409, "illegal-transition", "Illegal card status transition", error.message, {
        allowedTransitions: error.allowed,
      })
    : undefined;

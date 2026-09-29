import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { IllegalTransition } from "./domain/card-lifecycle.js";

const PROBLEM_BASE = "https://api.qred.example/problems";

export class Problem extends Error {
  constructor(
    readonly status: number,
    readonly slug: string,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title);
  }
}

export const notFound = () => new Problem(404, "not-found", "Not found", "The Card does not exist or is not visible to the caller.");
export const preconditionFailed = () => new Problem(412, "stale-etag", "Precondition failed", "The Card changed since its ETag was read.");
export const forbidden = (detail: string) => new Problem(403, "forbidden", "Forbidden", detail);
export const badRequest = (detail: string) => new Problem(400, "bad-request", "Bad request", detail);
export const unprocessable = (detail: string) => new Problem(422, "domain-rule", "Unprocessable", detail);
export const cardNotActive = (status: string) =>
  new Problem(409, "card-not-active", "Card not active", `A card that is ${status} cannot be charged.`);

function send(reply: FastifyReply, status: number, { slug, ...rest }: { slug: string; title: string; [key: string]: unknown }) {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: `${PROBLEM_BASE}/${slug}`, status, ...rest });
}

function isMissingIfMatch(error: FastifyError): boolean {
  return (
    error.validationContext === "headers" &&
    (error.validation ?? []).some((v) => v.keyword === "required" && v.params.missingProperty === "if-match")
  );
}

export function problemHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof Problem) {
    return send(reply, error.status, { slug: error.slug, title: error.title, detail: error.detail });
  }
  if (error instanceof IllegalTransition) {
    return send(reply, 409, {
      slug: "illegal-transition",
      title: "Illegal card status transition",
      detail: error.message,
      allowedTransitions: error.allowed,
    });
  }
  if (error.validation) {
    // The contract marks If-Match as required; RFC 6585 names its absence 428, not 400.
    if (isMissingIfMatch(error)) {
      return send(reply, 428, { slug: "if-match-required", title: "Precondition required", detail: "Send the Card's ETag as If-Match." });
    }
    return send(reply, 400, { slug: "bad-request", title: "Bad request", detail: error.message });
  }
  if (error.statusCode === 401) {
    return send(reply, 401, { slug: "unauthenticated", title: "Unauthenticated", detail: "Missing or unknown principal." });
  }
  request.log.error(error);
  return send(reply, 500, { slug: "internal", title: "Internal server error" });
}

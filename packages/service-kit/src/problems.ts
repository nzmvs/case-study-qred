import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

const PROBLEM_BASE = "https://api.qred.example/problems";

/** An RFC 9457 problem. `extensions` become extra members of the problem object. */
export class Problem extends Error {
  readonly status: number;
  readonly slug: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly extensions: Record<string, unknown>;

  constructor(status: number, slug: string, title: string, detail?: string, extensions: Record<string, unknown> = {}) {
    super(detail ?? title);
    this.status = status;
    this.slug = slug;
    this.title = title;
    this.detail = detail;
    this.extensions = extensions;
  }
}

export const badRequest = (detail: string) => new Problem(400, "bad-request", "Bad request", detail);
export const forbidden = (detail: string) => new Problem(403, "forbidden", "Forbidden", detail);
export const notFound = (detail: string) => new Problem(404, "not-found", "Not found", detail);
export const preconditionFailed = (detail: string) => new Problem(412, "stale-etag", "Precondition failed", detail);
export const unprocessable = (detail: string) => new Problem(422, "domain-rule", "Unprocessable", detail);

/** Maps a service's own error types (e.g. domain errors) to problems; `undefined` falls through. */
export type ErrorMapper = (error: unknown) => Problem | undefined;

function send(reply: FastifyReply, problem: Problem) {
  return reply
    .code(problem.status)
    .type("application/problem+json")
    .send({
      type: `${PROBLEM_BASE}/${problem.slug}`,
      title: problem.title,
      status: problem.status,
      ...(problem.detail ? { detail: problem.detail } : {}),
      ...problem.extensions,
    });
}

function isMissingIfMatch(error: FastifyError): boolean {
  return (
    error.validationContext === "headers" &&
    (error.validation ?? []).some((v) => v.keyword === "required" && v.params.missingProperty === "if-match")
  );
}

export function problemHandler(mapError: ErrorMapper = () => undefined) {
  return (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof Problem) return send(reply, error);
    const mapped = mapError(error);
    if (mapped) return send(reply, mapped);
    if (error.validation) {
      // Contracts mark If-Match as required; RFC 6585 names its absence 428, not 400.
      if (isMissingIfMatch(error)) {
        return send(reply, new Problem(428, "if-match-required", "Precondition required", "Send the resource's ETag as If-Match."));
      }
      return send(reply, badRequest(error.message));
    }
    if (error.statusCode === 401) {
      return send(reply, new Problem(401, "unauthenticated", "Unauthenticated", "Missing or unknown principal."));
    }
    request.log.error(error);
    return send(reply, new Problem(500, "internal", "Internal server error"));
  };
}

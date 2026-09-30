import { STATUS_CODES } from "node:http";
import { HttpError, httpErrors } from "@fastify/sensible";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

const PROBLEM_BASE = "https://api.qred.example/problems";

/**
 * Properties an HttpError may carry beyond http-errors' own: `problemType` and `title` override the
 * status-derived defaults; any other own property becomes an RFC 9457 extension member.
 */
export type ProblemFields = { problemType?: string; title?: string; headers?: Record<string, string>; [extension: string]: unknown };

const NOT_EXTENSIONS = new Set(["status", "statusCode", "expose", "headers", "message", "problemType", "title"]);

/** Maps a service's own error types (e.g. domain errors) to HttpErrors; `undefined` falls through. */
export type ErrorMapper = (error: unknown) => HttpError | undefined;

const slug = (status: number) => (STATUS_CODES[status] ?? "error").toLowerCase().replace(/[^a-z]+/g, "-");

function isMissingIfMatch(error: FastifyError): boolean {
  return (
    error.validationContext === "headers" &&
    (error.validation ?? []).some((v) => v.keyword === "required" && v.params.missingProperty === "if-match")
  );
}

function fromFastify(error: FastifyError, request: FastifyRequest): HttpError {
  if (error.validation) {
    // Contracts mark If-Match as required; RFC 6585 names its absence 428, not 400.
    return isMissingIfMatch(error)
      ? httpErrors.preconditionRequired("Send the resource's ETag as If-Match.")
      : httpErrors.badRequest(error.message);
  }
  // Fastify's own client errors (malformed JSON, a forbidden __proto__ key, a bad Content-Length...).
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return httpErrors.createError(error.statusCode, error.message);
  }
  request.log.error(error);
  return httpErrors.internalServerError();
}

export function problemHandler(mapError: ErrorMapper = () => undefined) {
  return (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const problem = error instanceof HttpError ? error : (mapError(error) ?? fromFastify(error, request));
    const status = problem.statusCode;
    const extensions = Object.fromEntries(Object.entries(problem).filter(([key]) => !NOT_EXTENSIONS.has(key)));
    return reply
      .code(status)
      .headers(problem.headers ?? {})
      .type("application/problem+json")
      .send({
        type: `${PROBLEM_BASE}/${problem.problemType ?? slug(status)}`,
        title: problem.title ?? STATUS_CODES[status],
        status,
        ...(problem.expose && problem.message ? { detail: problem.message } : {}),
        ...extensions,
      });
  };
}

export const problemJson = fp<{ mapError?: ErrorMapper }>(async (app, { mapError }) => {
  app.setErrorHandler(problemHandler(mapError));
});

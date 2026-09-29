import Fastify, { type FastifyServerOptions, type HTTPMethods, type preValidationHookHandler, type RouteOptions } from "fastify";
import { Ajv, type Options as AjvOptions } from "ajv";
import addFormats from "ajv-formats";
import openapiGlue from "fastify-openapi-glue";
import { bearerAuth, type Principals } from "./auth.js";
import { httpErrors } from "@fastify/sensible";
import { type ErrorMapper, problemHandler } from "./problems.js";

type ServiceOptions = {
  /** The service's OpenAPI contract: routes, validation and serialisation all come from it. */
  contractPath: string;
  /** One handler per `operationId` in the contract. */
  serviceHandlers: object;
  principals: Principals;
  mapError?: ErrorMapper;
  logger?: FastifyServerOptions["logger"];
};

/** The contracts' array query parameters use `style: form, explode: false`: `?status=a,b`. */
function splitCommaSeparatedArrays(route: RouteOptions) {
  const properties = (route.schema?.querystring as { properties?: Record<string, { type?: string }> } | undefined)?.properties;
  const arrays = Object.entries(properties ?? {})
    .filter(([, schema]) => schema.type === "array")
    .map(([name]) => name);
  if (arrays.length === 0) return;

  const split: preValidationHookHandler = async (request) => {
    const query = request.query as Record<string, unknown>;
    for (const name of arrays) {
      if (typeof query[name] === "string") query[name] = query[name] === "" ? [] : query[name].split(",");
    }
  };
  route.preValidation = [split, ...[route.preValidation ?? []].flat()];
}

/**
 * Query, path and header values arrive as strings and are coerced to the contract's types; bodies are
 * JSON and are validated exactly, so `false` is never accepted as a string nor `null` as a number.
 */
function contractValidators() {
  const base: AjvOptions = { useDefaults: true, removeAdditional: false, allErrors: false, strict: false };
  const coercing = addFormats.default(new Ajv({ ...base, coerceTypes: "array" }));
  const exact = addFormats.default(new Ajv({ ...base, coerceTypes: false }));
  return ({ schema, httpPart }: { schema: object; httpPart?: string }) =>
    httpPart === "body" ? exact.compile(schema) : coercing.compile(httpPart === "headers" ? lowercaseHeaders(schema) : schema);
}

/** Node lowercases incoming header names, so the header schema must name them in lowercase too. */
function lowercaseHeaders(schema: { properties?: Record<string, unknown>; required?: string[] }) {
  return {
    ...schema,
    ...(schema.properties
      ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k.toLowerCase(), v])) }
      : {}),
    ...(schema.required ? { required: schema.required.map((name) => name.toLowerCase()) } : {}),
  };
}

/** Unknown query parameters are rejected like unknown body properties. */
function rejectUnknownQuery(route: RouteOptions) {
  const querystring = route.schema?.querystring as { type?: string; additionalProperties?: unknown } | undefined;
  if (querystring?.type === "object" && querystring.additionalProperties === undefined) querystring.additionalProperties = false;
}

const METHODS: HTTPMethods[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "QUERY"];

/** Fastify skips body validation when there is no body; the contracts' request bodies are required. */
function requireBody(route: RouteOptions) {
  if (!route.schema?.body) return;
  const check: preValidationHookHandler = async (request) => {
    if (request.body === undefined) throw httpErrors.badRequest("A request body is required.");
  };
  route.preValidation = [check, ...[route.preValidation ?? []].flat()];
}

export async function buildService({ contractPath, serviceHandlers, principals, mapError, logger = false }: ServiceOptions) {
  const app = Fastify({ logger });
  app.setValidatorCompiler(contractValidators());
  // The contracts accept JSON bodies only; Fastify's built-in text/plain parser would hand handlers a
  // string that no body schema validates. Without it, other media types are 415.
  app.removeContentTypeParser("text/plain");

  const declared = new Map<string, Set<string>>();
  app.setErrorHandler(problemHandler(mapError));
  app.addHook("onRoute", splitCommaSeparatedArrays);
  app.addHook("onRoute", requireBody);
  app.addHook("onRoute", rejectUnknownQuery);
  app.addHook("onRoute", (route) => {
    const methods = declared.get(route.url) ?? new Set<string>();
    for (const method of [route.method].flat()) methods.add(method);
    declared.set(route.url, methods);
  });
  app.get("/health", async () => ({ status: "ok" }));

  // Every contract operation requires a principal. Authenticating before validation means an
  // unauthenticated caller gets 401 and learns nothing about what a valid request looks like.
  const authenticate = bearerAuth(principals);
  app.addHook("onRequest", async (request) => {
    if (request.routeOptions.url !== "/health") await authenticate(request);
  });

  await app.register(openapiGlue, {
    specification: contractPath,
    serviceHandlers,
    securityHandlers: { bearerAuth: authenticate },
  });

  // A known path with an undeclared method is 405 with Allow (RFC 9110), not 404.
  for (const [url, methods] of [...declared]) {
    const missing = METHODS.filter((m) => !methods.has(m));
    const allow = [...methods].join(", ");
    const reject = async () => {
      throw httpErrors.createError(405, `Allowed: ${allow}.`, { headers: { Allow: allow } });
    };
    // onRequest runs before body parsing, which would otherwise reject e.g. QUERY without a Content-Type first.
    app.route({ method: missing, url, onRequest: reject, handler: reject });
  }
  return app;
}

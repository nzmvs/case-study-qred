import path from "node:path";
import { fileURLToPath } from "node:url";
import { httpErrors } from "@fastify/sensible";
import type { HTTPMethods, preValidationHookHandler, RouteOptions } from "fastify";
import fp from "fastify-plugin";
import openapiGlue from "fastify-openapi-glue";

const CONTRACTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../contracts");
export const contractPath = (name: string) => path.join(CONTRACTS, `${name}.yaml`);

const METHODS: HTTPMethods[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "QUERY"];

function rejectUnknownQuery(route: RouteOptions) {
  const querystring = route.schema?.querystring as { type?: string; additionalProperties?: unknown } | undefined;
  if (querystring?.type === "object" && querystring.additionalProperties === undefined) querystring.additionalProperties = false;
}

function requireBody(route: RouteOptions) {
  if (!route.schema?.body) return;
  const check: preValidationHookHandler = async (request) => {
    if (request.body === undefined) throw httpErrors.badRequest("A request body is required.");
  };
  route.preValidation = [check, ...[route.preValidation ?? []].flat()];
}

export const contract = fp<{ path: string; handlers: object }>(async (app, { path: specification, handlers }) => {
  const declared = new Map<string, Set<string>>();
  app.addHook("onRoute", requireBody);
  app.addHook("onRoute", rejectUnknownQuery);
  app.addHook("onRoute", (route) => {
    const methods = declared.get(route.url) ?? new Set<string>();
    for (const method of [route.method].flat()) methods.add(method);
    declared.set(route.url, methods);
  });

  await app.register(openapiGlue, { specification, serviceHandlers: handlers });

  for (const [url, methods] of [...declared]) {
    if (url === "/health") continue;
    const missing = METHODS.filter((m) => !methods.has(m));
    const allow = [...methods].join(", ");
    const reject = async () => {
      throw httpErrors.createError(405, `Allowed: ${allow}.`, { headers: { Allow: allow } });
    };
    app.route({ method: missing, url, onRequest: reject, handler: reject });
  }
});

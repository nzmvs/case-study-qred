import { Ajv, type Options as AjvOptions } from "ajv";
import addFormats from "ajv-formats";
import Fastify from "fastify";
import qs from "qs";

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

/** A Fastify instance with the settings that cannot live in a plugin: query parsing, validation, body parsers. */
export function createService() {
  const app = Fastify({
    logger: true,
    // The contracts' array query parameters use `style: form, explode: false`: `?status=a,b`.
    routerOptions: { querystringParser: (query) => qs.parse(query, { comma: true }) },
  });
  app.setValidatorCompiler(contractValidators());
  // The contracts accept JSON bodies only; Fastify's built-in text/plain parser would hand handlers a
  // string that no body schema validates. Without it, other media types are 415.
  app.removeContentTypeParser("text/plain");
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}

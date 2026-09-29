import { Problem } from "@qred/service-kit";
import createClient, { type Client } from "openapi-fetch";
import type { paths as BillingPaths } from "./generated/billing-api.js";
import type { paths as CardPaths } from "./generated/card-api.js";
import type { paths as IdentityPaths } from "./generated/identity-api.js";
import type { Section } from "./screen.js";

export type Upstreams = {
  identity: Client<IdentityPaths>;
  card: Client<CardPaths>;
  billing: Client<BillingPaths>;
};

export type UpstreamUrls = { identity: string; card: string; billing: string };

// The contracts' array query parameters are comma-separated: ?status=a,b
const querySerializer = { array: { style: "form", explode: false } } as const;

export function createUpstreams(urls: UpstreamUrls): Upstreams {
  return {
    identity: createClient<IdentityPaths>({ baseUrl: urls.identity, querySerializer }),
    card: createClient<CardPaths>({ baseUrl: urls.card, querySerializer }),
    billing: createClient<BillingPaths>({ baseUrl: urls.billing, querySerializer }),
  };
}

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

export const badGateway = (detail: string) => new Problem(502, "upstream-unavailable", "Bad gateway", detail);

/** A required upstream call: its data, or the Screen fails with 502. */
export async function required<T>(name: string, request: Promise<FetchResult<T>>): Promise<{ data: T; response: Response }> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch {
    throw badGateway(`${name} could not be reached or timed out.`);
  }
  if (!result.response.ok || result.data === undefined) throw badGateway(`${name} answered ${result.response.status}.`);
  return { data: result.data, response: result.response };
}

/** An optional upstream call: its data, or a Section the Screen lists as unavailable. */
export async function optional<T>(request: Promise<FetchResult<T>>): Promise<Section<T>> {
  try {
    const result = await request;
    return result.response.ok && result.data !== undefined ? { ok: true, value: result.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Re-raise an upstream RFC 9457 problem unchanged, e.g. the Card API's 409 with allowedTransitions. */
export function forwardProblem(status: number, body: unknown): Problem {
  const { type, title, detail, status: _status, ...extensions } = (body ?? {}) as Record<string, unknown>;
  const slug = typeof type === "string" ? type.split("/").pop()! : "upstream";
  return new Problem(status, slug, typeof title === "string" ? title : "Upstream error", typeof detail === "string" ? detail : undefined, extensions);
}

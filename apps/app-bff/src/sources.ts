import type { Unleash } from "unleash-client";
import type { Upstreams } from "./upstreams.js";

export type UpstreamName = keyof Upstreams;
export type Source = "real" | "mock";
export type Sources = Record<UpstreamName, Source>;

export type SourceFlags = { isReal(upstream: UpstreamName, userId: string): boolean };

const UPSTREAMS: UpstreamName[] = ["identity", "card", "billing"];

export const flagName = (upstream: UpstreamName) => `bff-${upstream}-api-real`;

export function unleashFlags(unleash: Pick<Unleash, "isEnabled">): SourceFlags {
  return { isReal: (upstream, userId) => unleash.isEnabled(flagName(upstream), { userId }, () => true) };
}

export type Routing = {
  real: Upstreams;
  mock: Upstreams | null;
  flags: SourceFlags | null;
};

export function route({ real, mock, flags }: Routing, userId: string): { upstreams: Upstreams; sources: Sources } {
  const sources = Object.fromEntries(
    UPSTREAMS.map((name) => [name, mock && flags && !flags.isReal(name, userId) ? "mock" : "real"]),
  ) as Sources;
  const pick = <K extends UpstreamName>(name: K): Upstreams[K] => (sources[name] === "mock" ? mock![name] : real[name]);
  return { upstreams: { identity: pick("identity"), card: pick("card"), billing: pick("billing") }, sources };
}

export const describeSources = (sources: Sources) => UPSTREAMS.map((name) => `${name}=${sources[name]}`).join(", ");

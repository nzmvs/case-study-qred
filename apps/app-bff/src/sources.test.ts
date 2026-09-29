import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeSources, flagName, route, type SourceFlags, unleashFlags } from "./sources.js";
import type { Upstreams } from "./upstreams.js";

const upstreams = (tag: string) => ({ identity: `${tag}-identity`, card: `${tag}-card`, billing: `${tag}-billing` }) as unknown as Upstreams;
const real = upstreams("real");
const mock = upstreams("mock");
const cardMockedFor = (users: string[]): SourceFlags => ({ isReal: (u, userId) => !(u === "card" && users.includes(userId)) });

describe("route", () => {
  it("uses the mock only where the flag says so", () => {
    const { upstreams, sources } = route({ real, mock, flags: cardMockedFor(["anna"]) }, "anna");
    assert.equal(upstreams.card as unknown, "mock-card");
    assert.equal(upstreams.identity as unknown, "real-identity");
    assert.equal(describeSources(sources), "identity=real, card=mock, billing=real");
  });

  it("evaluates per User", () => {
    assert.equal(route({ real, mock, flags: cardMockedFor(["anna"]) }, "erik").sources.card, "real");
  });

  it("is always real where mocks are not allowed, whatever the flags say", () => {
    const { upstreams, sources } = route({ real, mock: null, flags: { isReal: () => false } }, "anna");
    assert.equal(upstreams.card as unknown, "real-card");
    assert.deepEqual(sources, { identity: "real", card: "real", billing: "real" });
  });

  it("is always real without a flag service", () => {
    assert.equal(route({ real, mock, flags: null }, "anna").sources.card, "real");
  });
});

describe("unleashFlags", () => {
  it("asks for the upstream's flag with the User as context and falls back to real", () => {
    const calls: unknown[] = [];
    const flags = unleashFlags({
      isEnabled: (name, context, fallback) => {
        calls.push([name, context]);
        return typeof fallback === "function" ? fallback(name, context!) : Boolean(fallback);
      },
    });
    assert.equal(flags.isReal("card", "anna"), true);
    assert.deepEqual(calls, [[flagName("card"), { userId: "anna" }]]);
  });
});

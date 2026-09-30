# Switch App BFF upstreams between mock and real with feature flags

Mobile releases are slow to ship, so the app always talks to the real App BFF, and the App BFF decides per upstream (Identity, Card, Billing API) whether to call the contract mock or the real service. The decision is an Unleash toggle per upstream, evaluated with the User as context so real data can roll out to testers before everyone. Not per Company: a Card change cannot know its Company before a source is chosen, and a Card's reads and writes must go to the same source. Mocks exist only where the environment allows them (`UPSTREAM_MOCKS_ALLOWED`), and an unknown or unreachable flag resolves to the real service, so no failure can show fake data to a User.

## Considered Options

- Flags in the mobile app per Screen: switches a whole Screen at once and puts routing logic in the client.
- flagd with OpenFeature: lighter and vendor neutral, but no toggle UI.
- A custom flag service: full control over a solved problem.

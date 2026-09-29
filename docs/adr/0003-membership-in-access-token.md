# Membership travels in the access token

The Identity API owns Memberships and issues signed JWTs whose claims list the Companies a User is a member of. The Card API and Billing API verify tokens with the Identity API's public key from configuration and authorise against the claims, never calling the Identity API at runtime. This keeps the Card API free of runtime dependencies at the cost of staleness: a revoked Membership stays valid until the token expires, bounded by a 5 minute token lifetime.

## Considered Options

- Synchronous Membership lookup against the Identity API: always fresh, but couples every request's availability to the Identity API.
- Local Membership replicas fed by Identity events: fresh and decoupled, but needs a message bus and consumers. The preferred next step beyond this case.

## In this case

Token issuance and verification are mocked: every service resolves the bearer token as a demo principal name (`anna`, `card-processor`) from shared configuration into the same `Principal` the JWT verification would produce. Membership and scope checks run against that `Principal` unchanged, so replacing the mock with JWT verification touches only each service's auth plugin.

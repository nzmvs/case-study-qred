# Change resources with PUT and If-Match, never PATCH

Card changes, including status transitions, are made with `PUT /cards/{id}` carrying the full mutable representation; the server derives the transition by comparing current and requested status and rejects illegal ones with `409`. We chose PUT over PATCH for its idempotency (safe retries on mobile networks) and a single, complete representation to validate. PUT's lost-update risk is closed by requiring `If-Match` with the resource's `ETag` (`428` when missing, `412` when stale).

## Considered Options

- `PATCH /cards/{id}`: partial updates, but not idempotent by definition and rejected as a house rule.
- Transition sub-resources (`POST /cards/{id}/activations`): richer per-transition payloads and audit, kept as the upgrade path if transitions need their own inputs.

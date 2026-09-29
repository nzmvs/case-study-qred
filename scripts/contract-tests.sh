#!/usr/bin/env bash
# Runs Schemathesis against each running service (docker compose up) and resets the seeds after,
# since generated PUT and POST requests change data. Usage: scripts/contract-tests.sh [service...]
set -uo pipefail
cd "$(dirname "$0")/.."

port_of() {
  case $1 in identity-api) echo 3001 ;; card-api) echo 3002 ;; billing-api) echo 3003 ;; app-bff) echo 3000 ;; esac
}
if (($#)); then services=("$@"); else services=(identity-api card-api billing-api app-bff); fi
failed=()

for service in "${services[@]}"; do
  echo "== $service"
  docker run --rm --network qred_default \
    -v "$PWD/contracts:/contracts:ro" -v "$PWD/tests/contract:/config:ro" \
    schemathesis/schemathesis:stable --config-file "/config/$service.toml" \
    run "/contracts/$service.yaml" --url "http://$service:$(port_of "$service")" --checks all \
    || failed+=("$service")
done

for service in identity-api card-api billing-api; do
  docker compose exec -T "$service" pnpm --filter "@qred/$service" db:reset >/dev/null
done
echo "seeds reset"

if [ ${#failed[@]} -gt 0 ]; then echo "contract failures: ${failed[*]}"; exit 1; fi
echo "all contracts hold"

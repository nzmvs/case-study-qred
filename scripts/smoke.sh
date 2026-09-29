#!/usr/bin/env bash
# Behaviour checks for the Card API against the running stack: the ETag flow, the state machine and
# the Spending limit. Prints ok/FAIL per check; exits non-zero on any failure. Resets the Card seed.
B=${B:-localhost:3002}; A='Authorization: Bearer anna'; P='Authorization: Bearer card-processor'; J='Content-Type: application/json'
C1=00000000-0000-4000-a000-000000000201; C2=00000000-0000-4000-a000-000000000202; CO=00000000-0000-4000-a000-000000000101
# Current UTC Spend period (ADR 0005), portable across BSD and GNU date.
Y=$(date -u +%Y); M=$((10#$(date -u +%m)))
FROM=$(printf '%04d-%02d-01T00:00:00Z' "$Y" "$M")
if [ "$M" -eq 12 ]; then TO=$(printf '%04d-01-01T00:00:00Z' $((Y + 1))); else TO=$(printf '%04d-%02d-01T00:00:00Z' "$Y" $((M + 1))); fi
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
fails=0
BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT
check() { local want=$1 name=$2; shift 2; local got; got=$(curl -s -o "$BODY" -w '%{http_code}' "$@"); if [ "$got" = "$want" ]; then echo "ok   $want $name"; else echo "FAIL $name: want $want got $got $(head -c 160 "$BODY")"; fails=$((fails+1)); fi; }
et() { curl -s -i -H "$A" $B/cards/$1 | awk 'tolower($1)=="etag:"{print $2}' | tr -d '\r'; }
body() { printf '{"settings":{"spendingLimit":2500000},"state":{"status":"%s","closedReason":%s}}' "$1" "$2"; }
tx() { printf '{"amount":{"amount":%s,"currency":"%s"},"merchantName":"Webhallen","occurredAt":"%s"}' "$1" "${2:-SEK}" "$NOW"; }
check 200 "list cards"            -H "$A" "$B/cards?companyId=$CO&holder=me&status=inactive,active,frozen"
check 200 "get card"              -H "$A" $B/cards/$C1
check 401 "no principal"          $B/cards/$C1
check 404 "processor cannot read" -H "$P" $B/cards/$C1
check 200 "spend"                 -H "$A" "$B/cards/$C1/spend?from=$FROM&to=$TO"
[ "$(jq .spent.amount "$BODY")" = 460000 ] && echo "ok       spent 460000" || { echo "FAIL spent $(cat "$BODY")"; fails=$((fails+1)); }
check 400 "spend bad range"       -H "$A" "$B/cards/$C1/spend?from=$TO&to=$FROM"
check 200 "transactions page"     -H "$A" "$B/cards/$C1/transactions?limit=3"
[ "$(jq .totalCount "$BODY")" = 57 ] && echo "ok       totalCount 57" || { echo "FAIL totalCount"; fails=$((fails+1)); }
E=$(et $C2)
check 428 "put without If-Match"  -X PUT -H "$A" -H "$J" $B/cards/$C2 -d "$(body active null)"
check 412 "put stale ETag"        -X PUT -H "$A" -H "$J" -H 'If-Match: "stale"' $B/cards/$C2 -d "$(body active null)"
check 400 "put with details"      -X PUT -H "$A" -H "$J" -H "If-Match: $E" $B/cards/$C2 -d '{"details":{},"settings":{"spendingLimit":1},"state":{"status":"active","closedReason":null}}'
check 409 "illegal transition"    -X PUT -H "$A" -H "$J" -H "If-Match: $E" $B/cards/$C2 -d "$(body frozen null)"
[ "$(jq -c .allowedTransitions "$BODY")" = '["activate","close"]' ] && echo "ok       allowedTransitions in 409" || { echo "FAIL 409 body $(cat "$BODY")"; fails=$((fails+1)); }
check 409 "charge inactive card"  -X POST -H "$P" -H "$J" $B/cards/$C2/transactions -d "$(tx 100)"
check 200 "activate"              -X PUT -H "$A" -H "$J" -H "If-Match: $E" $B/cards/$C2 -d "$(body active null)"
check 412 "old ETag after change" -X PUT -H "$A" -H "$J" -H "If-Match: $E" $B/cards/$C2 -d "$(body frozen null)"
E2=$(et $C2)
check 400 "close without reason"  -X PUT -H "$A" -H "$J" -H "If-Match: $E2" $B/cards/$C2 -d "$(body closed null)"
check 403 "user records tx"       -X POST -H "$A" -H "$J" $B/cards/$C1/transactions -d "$(tx 100)"
check 422 "wrong currency"        -X POST -H "$P" -H "$J" $B/cards/$C1/transactions -d "$(tx 100 EUR)"
check 422 "over the limit"        -X POST -H "$P" -H "$J" $B/cards/$C1/transactions -d "$(tx 540001)"
check 201 "exactly the limit"     -X POST -H "$P" -H "$J" $B/cards/$C1/transactions -d "$(tx 540000)"
cd "$(dirname "$0")/.." && docker compose exec -T card-api pnpm --filter @qred/card-api db:reset >/dev/null
echo "failures: $fails"
[ "$fails" -eq 0 ]

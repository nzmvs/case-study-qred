#!/bin/sh
# Creates the App BFF upstream-source flags (ADR 0004) on first start. Existing flags are left
# untouched, so changes made in the Unleash UI survive restarts. Enabled means "use the real service".
set -eu
U="${UNLEASH_URL:-http://unleash:4242}"
JAR=/tmp/unleash.jar
J='Content-Type: application/json'

curl -fsS -c "$JAR" -H "$J" -d "{\"username\":\"${UNLEASH_ADMIN_USER:-admin}\",\"password\":\"${UNLEASH_ADMIN_PASSWORD:-unleash4all}\"}" \
  "$U/auth/simple/login" >/dev/null

# name, initially on (real) or off (mock)
flag() {
  name=$1 initial=$2
  code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H "$J" -d "{\"name\":\"$name\",\"type\":\"release\"}" \
    "$U/api/admin/projects/default/features")
  if [ "$code" = 409 ]; then echo "$name: exists, left as is"; return; fi
  [ "$code" = 201 ] || { echo "$name: create failed ($code)"; exit 1; }
  curl -fsS -b "$JAR" -H "$J" -o /dev/null \
    -d "{\"name\":\"flexibleRollout\",\"parameters\":{\"rollout\":\"100\",\"stickiness\":\"default\",\"groupId\":\"$name\"},\"constraints\":[]}" \
    "$U/api/admin/projects/default/features/$name/environments/development/strategies"
  curl -fsS -b "$JAR" -o /dev/null -X POST "$U/api/admin/projects/default/features/$name/environments/development/$initial"
  echo "$name: created, $initial"
}

# Identity and Billing are delivered; the Card API is still served by its contract mock.
flag bff-identity-api-real on
flag bff-billing-api-real on
flag bff-card-api-real off

"""Card API behaviour against the running stack: the ETag flow, the card lifecycle and the Spending limit.

An ordered scenario from the seeded state: later checks depend on earlier ones. Reseeds the Card API
before and after, prints ok/FAIL per check, and exits non-zero on any failure. Runs on the host's python3 (3.9+), standard library only.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
CARD_API = os.environ.get("CARD_API_URL", "http://localhost:3002")
ACTIVE_CARD = "00000000-0000-4000-a000-000000000201"
INACTIVE_CARD = "00000000-0000-4000-a000-000000000202"
COMPANY_AB = "00000000-0000-4000-a000-000000000101"


class Response:
    def __init__(self, status: int, headers: dict[str, str], body: str) -> None:
        self.status = status
        self.headers = headers
        self.body = body

    def json(self) -> dict:
        return json.loads(self.body) if self.body else {}


def request(method: str, path: str, body: dict | None = None, if_match: str | None = None) -> Response:
    headers = {"Content-Type": "application/json"}
    if if_match:
        headers["If-Match"] = if_match
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlopen(Request(f"{CARD_API}{path}", data=data, method=method, headers=headers)) as response:
            return Response(response.status, {k.lower(): v for k, v in response.headers.items()}, response.read().decode())
    except HTTPError as error:
        return Response(error.code, {k.lower(): v for k, v in error.headers.items()}, error.read().decode())


failures = 0


def check(expected: int, name: str, response: Response) -> Response:
    global failures
    if response.status == expected:
        print(f"ok   {expected} {name}")
    else:
        failures += 1
        print(f"FAIL {name}: want {expected} got {response.status} {response.body[:160]}")
    return response


def expect(name: str, ok: bool, detail: object) -> None:
    global failures
    if ok:
        print(f"ok       {name}")
    else:
        failures += 1
        print(f"FAIL {name}: {detail}")


def etag(card_id: str) -> str:
    return request("GET", f"/cards/{card_id}").headers["etag"]


def card_input(status: str, closed_reason: str | None = None) -> dict:
    return {"settings": {"spendingLimit": 2_500_000}, "state": {"status": status, "closedReason": closed_reason}}


def purchase(amount: int, currency: str = "SEK") -> dict:
    return {"amount": {"amount": amount, "currency": currency}, "merchantName": "Webhallen", "occurredAt": now()}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def reseed() -> None:
    compose = ["docker", "compose", "-f", str(ROOT / "infra/docker-compose.yml")]
    subprocess.run([*compose, "exec", "-T", "card-api", "pnpm", "--filter", "@qred/card-api", "db:seed"], check=True, capture_output=True)


def main() -> int:
    reseed()

    check(200, "list cards", request("GET", f"/cards?companyId={COMPANY_AB}&holder=me&status=inactive,active,frozen"))
    check(200, "get card", request("GET", f"/cards/{ACTIVE_CARD}"))
    spend = check(200, "spend", request("GET", f"/cards/{ACTIVE_CARD}/spend"))
    expect("spent 460000", spend.json().get("spent", {}).get("amount") == 460_000, spend.body)
    expect("remaining 540000", spend.json().get("remaining", {}).get("amount") == 540_000, spend.body)
    page = check(200, "transactions page", request("GET", f"/cards/{ACTIVE_CARD}/transactions?limit=3"))
    expect("totalCount 57", page.json().get("totalCount") == 57, page.body)
    unknown = check(404, "unknown route", request("GET", "/nope"))
    content_type = unknown.headers.get("content-type", "")
    expect("unknown route is problem+json", content_type.startswith("application/problem+json"), content_type)

    stored = etag(INACTIVE_CARD)
    check(428, "put without If-Match", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("active")))
    check(412, "put stale ETag", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("active"), if_match='"stale"'))
    with_details = {"details": {}, **card_input("active")}
    check(400, "put with details", request("PUT", f"/cards/{INACTIVE_CARD}", body=with_details, if_match=stored))
    illegal = check(409, "illegal transition", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("frozen"), if_match=stored))
    allowed = illegal.json().get("allowedTransitions")
    expected = [{"transition": "activate", "status": "active"}, {"transition": "close", "status": "closed"}]
    expect("allowedTransitions in 409", allowed == expected, illegal.body)
    check(409, "charge inactive card", request("POST", f"/cards/{INACTIVE_CARD}/transactions", body=purchase(100)))
    check(200, "activate", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("active"), if_match=stored))
    check(412, "old ETag after change", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("frozen"), if_match=stored))
    fresh = etag(INACTIVE_CARD)
    check(400, "close without reason", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("closed"), if_match=fresh))
    check(200, "close", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("closed", "lost"), if_match=fresh))
    check(422, "change closedReason", request("PUT", f"/cards/{INACTIVE_CARD}", body=card_input("closed", "stolen"), if_match=etag(INACTIVE_CARD)))

    check(422, "wrong currency", request("POST", f"/cards/{ACTIVE_CARD}/transactions", body=purchase(100, "EUR")))
    check(422, "over the limit", request("POST", f"/cards/{ACTIVE_CARD}/transactions", body=purchase(540_001)))
    check(201, "exactly the limit", request("POST", f"/cards/{ACTIVE_CARD}/transactions", body=purchase(540_000)))

    reseed()
    print(f"failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

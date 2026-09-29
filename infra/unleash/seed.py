"""Create the App BFF upstream-source flags (ADR 0004) on first start.

Enabled means "use the real service". Existing flags are left untouched, so changes made in the
Unleash UI survive restarts.
"""

import json
import os
import sys
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

UNLEASH_URL = os.environ.get("UNLEASH_URL", "http://unleash:4242")
FEATURES = f"{UNLEASH_URL}/api/admin/projects/default/features"
ENVIRONMENT = "development"

# Identity and Billing are delivered; the Card API is still served by its contract mock.
FLAGS = {
    "bff-identity-api-real": True,
    "bff-billing-api-real": True,
    "bff-card-api-real": False,
}

# Unleash has no startup setting for an admin API token, so sign in as the default admin and let
# the opener carry the session cookie on every Admin API call.
session = build_opener(HTTPCookieProcessor(CookieJar()))


def post(url: str, body: dict | None = None) -> int:
    data = json.dumps(body).encode() if body is not None else None
    request = Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    try:
        with session.open(request) as response:
            return response.status
    except HTTPError as error:
        return error.code


def create_flag(name: str, enabled: bool) -> None:
    status = post(FEATURES, {"name": name, "type": "release"})
    if status == 409:
        print(f"{name}: exists, left as is")
        return
    if status != 201:
        sys.exit(f"{name}: create failed ({status})")

    environment = f"{FEATURES}/{name}/environments/{ENVIRONMENT}"
    rollout = {"rollout": "100", "stickiness": "default", "groupId": name}
    for url, body in [
        (f"{environment}/strategies", {"name": "flexibleRollout", "parameters": rollout, "constraints": []}),
        (f"{environment}/{'on' if enabled else 'off'}", None),
    ]:
        if (status := post(url, body)) >= 300:
            sys.exit(f"{name}: {url} failed ({status})")
    print(f"{name}: created, {'on' if enabled else 'off'}")


def main() -> None:
    credentials = {
        "username": os.environ.get("UNLEASH_ADMIN_USER", "admin"),
        "password": os.environ.get("UNLEASH_ADMIN_PASSWORD", "unleash4all"),
    }
    if (status := post(f"{UNLEASH_URL}/auth/simple/login", credentials)) != 200:
        sys.exit(f"admin sign-in failed ({status})")
    for name, enabled in FLAGS.items():
        create_flag(name, enabled)


if __name__ == "__main__":
    main()

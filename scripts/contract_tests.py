"""Contract tests: Schemathesis generates requests against each running service and checks every
response against its contract. Generated PUT and POST requests change data, so the seeds are reset
afterwards. Runs on the host's python3 (3.9+), standard library only.

Usage: python3 scripts/contract_tests.py [service ...]
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ["docker", "compose", "-f", str(ROOT / "infra/docker-compose.yml")]
PORTS = {"identity-api": 3001, "card-api": 3002, "billing-api": 3003, "app-bff": 3000}
SEEDED = ["identity-api", "card-api", "billing-api"]


def run_schemathesis(service: str) -> bool:
    print(f"== {service}", flush=True)
    command = [
        "docker", "run", "--rm", "--network", "qred_default",
        "-v", f"{ROOT / 'contracts'}:/contracts:ro",
        "-v", f"{ROOT / 'tests/contract'}:/config:ro",
        "schemathesis/schemathesis:stable",
        "--config-file", f"/config/{service}.toml",
        "run", f"/contracts/{service}.yaml",
        "--url", f"http://{service}:{PORTS[service]}",
        "--checks", "all",
    ]
    return subprocess.run(command).returncode == 0


def reseed() -> None:
    for service in SEEDED:
        subprocess.run([*COMPOSE, "exec", "-T", service, "pnpm", "--filter", f"@qred/{service}", "db:seed"], check=True, capture_output=True)
    print("seeds reset")


def main(services: list[str]) -> int:
    unknown = [s for s in services if s not in PORTS]
    if unknown:
        print(f"unknown service(s): {', '.join(unknown)}; choose from {', '.join(PORTS)}")
        return 2
    try:
        failed = [service for service in services or list(PORTS) if not run_schemathesis(service)]
    finally:
        reseed()
    if failed:
        print(f"contract failures: {' '.join(failed)}")
        return 1
    print("all contracts hold")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

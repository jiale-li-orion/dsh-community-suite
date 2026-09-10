"""Read-only E0 HTTP probes. Uses direct connections, verified TLS and no proxy.

Exit 0 means these probes passed, not that phone/lifecycle acceptance is complete.
Response bodies are inspected in memory and never included in the JSON report.
"""

import argparse
import base64
import http.client
import json
import math
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit


def options():
    """Validate the target before any request, without echoing credential values."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origin", help="HTTP(S) origin, without credentials or a path")
    parser.add_argument("--authority", help="Override Host for loopback trust-fence probes")
    parser.add_argument("--require-https", action="store_true")
    parser.add_argument("--privileged-status", type=int, choices=(200, 403), default=200)
    parser.add_argument("--timeout", type=float, default=8)
    parser.add_argument("--max-response-bytes", type=int, default=4 * 1024 * 1024)
    args = parser.parse_args()
    try:
        url = urlsplit(args.origin)
        valid = (url.scheme in ("http", "https") and url.hostname
                 and url.username is None and url.password is None
                 and url.path in ("", "/") and not url.query and not url.fragment)
        _ = url.port
        if not valid:
            raise ValueError()
        authority = args.authority or url.netloc
        parsed = urlsplit("http://" + authority)
        _ = parsed.port
        if (not parsed.hostname or parsed.netloc != authority or parsed.path
                or parsed.query or parsed.fragment or parsed.username is not None
                or any(ord(c) < 33 or ord(c) > 126 for c in authority)):
            raise ValueError()
    except ValueError:
        parser.error("target must be an HTTP(S) origin and authority must be host[:port]; credentials are forbidden")
    if not math.isfinite(args.timeout) or args.timeout <= 0 or args.max_response_bytes <= 0:
        parser.error("timeout and response limit must be positive finite values")
    return args, url, authority


def check(args, url, name, path, authority, expected, *, method=None, origin=None, cross_site=False):
    """Return status and validation only; never persist server response content."""
    conn_type = http.client.HTTPSConnection if url.scheme == "https" else http.client.HTTPConnection
    conn = conn_type(url.hostname, url.port, timeout=args.timeout)
    headers = {"Host": authority}
    if origin is not None:
        headers["Origin"] = origin
    if cross_site:
        headers["Sec-Fetch-Site"] = "cross-site"
    body = None
    if method:
        headers["Content-Type"] = "application/json"
        body = json.dumps({"type": "client-request", "rpcId": "e0-read-probe",
                           "method": method, "payload": {}})
    if path.startswith("/api/events."):
        headers.update({"Connection": "Upgrade", "Upgrade": "websocket",
                        "Sec-WebSocket-Version": "13",
                        "Sec-WebSocket-Key": base64.b64encode(os.urandom(16)).decode()})
    result = {"name": name, "expected_status": expected, "passed": False}
    try:
        conn.request("POST" if body else "GET", path, body, headers)
        response = conn.getresponse()
        result["status"] = response.status
        data = response.read(args.max_response_bytes + 1) if response.status != 101 else b""
        if len(data) > args.max_response_bytes:
            result["error"] = "response exceeds configured byte limit"
            return result
        passed = response.status == expected
        if expected == 200 and method:
            try:
                payload = json.loads(data)
                business = payload.get("result") if isinstance(payload, dict) else None
                passed = passed and isinstance(business, dict) and business.get("ok") is True
            except (ValueError, UnicodeError):
                passed = False
            result["business_ok"] = passed
        elif expected == 200 and path == "/":
            passed = passed and b"__DSH_BOOT__" in data
            result["boot_manifest_present"] = passed
        result["passed"] = passed
    except (OSError, http.client.HTTPException, ValueError) as error:
        result["error"] = type(error).__name__
    finally:
        conn.close()
    return result


def main():
    """Probe ordinary, privileged, byte and WebSocket routes without mutations."""
    args, url, authority = options()
    origin = f"{url.scheme}://{authority}"
    rows = []

    def add(name, path, status, **kwargs):
        rows.append(check(args, url, name, path, kwargs.pop("authority", authority), status, **kwargs))

    add("web-entry", "/", 200)
    add("session-list", "/api/session.list", 200, method="session.list", origin=origin)
    add("settings-describe", "/api/settings.describe", args.privileged_status,
        method="settings.describe", origin=origin)
    add("api-unknown-host", "/api/session.list", 403,
        method="session.list", authority="e0-untrusted.invalid")
    add("api-cross-origin", "/api/session.list", 403,
        method="session.list", origin="https://e0-untrusted.invalid")
    add("api-null-origin", "/api/session.list", 403, method="session.list", origin="null")
    add("api-cross-site", "/api/session.list", 403, method="session.list", cross_site=True)
    add("bytes-unknown-host", "/workbench/file", 403, authority="e0-untrusted.invalid")
    add("bytes-missing-parameters", "/workbench/file", 400)
    for channel in ("mux", "host"):
        add(f"websocket-{channel}", f"/api/events.{channel}", 101, origin=origin)
        add(f"websocket-{channel}-cross-origin", f"/api/events.{channel}", 403,
            origin="https://e0-untrusted.invalid")
    https = url.scheme == "https"
    passed = all(row["passed"] for row in rows) and (https or not args.require_https)
    report = {"checked_at": datetime.now(timezone.utc).isoformat(),
              "origin": args.origin, "authority": authority, "https": https,
              "require_https": args.require_https, "checks_passed": passed, "checks": rows,
              "remaining_acceptance": ["real phone over mobile network", "browser render and streaming",
                                       "approval and file preview", "network policy", "restart and reconnect"]}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

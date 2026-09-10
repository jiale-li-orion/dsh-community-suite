"""Fetch the DeepSeek account balance and publish one JSON snapshot.

The API key exists only inside WSL, so this script is the single place that
talks to the balance API: the desktop tile runs it through `wsl.exe`, reads the
snapshot file it writes, and an agent reads the same file. The snapshot is
written atomically and keeps the previous value when a fetch fails, so a reader
never sees a half-written file and a transient network error cannot silently
turn a known balance into zero.

Usage:
    python3 fetch_balance.py --out /mnt/c/Users/me/Desktop/dsh-web/balance.json

Exit status is 0 only when a fresh snapshot was written. The API key value is
never printed, logged, or written to the snapshot.
"""

import argparse
import json
import os
import pathlib
import re
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_KEY_ENV = "DEEPSEEK_API_KEY"
DEFAULT_OUT = "~/.dsh/balance.json"
BALANCE_PATH = "/user/balance"
MAX_RESPONSE_BYTES = 64 * 1024

# The deployment keeps the key in the shell profile rather than in the
# environment of the process that launches the tile, so a documented fallback
# reads that one export line. It reads the value; it never echoes it.
BASHRC_EXPORT = re.compile(r'^\s*export\s+([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\s]+)"?\s*$')


def resolve_key(name: str, profile: pathlib.Path) -> str:
    """Resolve the API key from the environment, then from the shell profile.

    @param name - environment variable holding the key.
    @param profile - shell profile read as the fallback source.
    @returns the key value.
    @raises SystemExit - with status 2 (misconfiguration, as distinct from a
    failed fetch) when neither source yields a non-empty key.
    """
    value = os.environ.get(name, "").strip()
    if value:
        return value
    try:
        lines = profile.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        lines = []
    for line in lines:
        match = BASHRC_EXPORT.match(line)
        if match is not None and match.group(1) == name:
            return match.group(2)
    print(f"balance: {name} is not set and {profile} has no export line for it", file=sys.stderr)
    raise SystemExit(2)


def fetch(base_url: str, key: str, timeout: float) -> dict:
    """Read the balance endpoint once.

    @param base_url - API root, without a trailing slash.
    @param key - bearer token.
    @param timeout - request timeout in seconds.
    @returns the decoded response body.
    @raises RuntimeError - on transport failure, a non-200 status, an oversized
    body, or a body that is not a JSON object.
    """
    request = urllib.request.Request(
        base_url.rstrip("/") + BALANCE_PATH,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise RuntimeError(f"balance endpoint returned HTTP {response.status}")
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        # The status is diagnostic; the body stays unread so an error page can
        # never be mistaken for a snapshot.
        raise RuntimeError(f"balance endpoint returned HTTP {error.code}") from error
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise RuntimeError(f"balance request failed: {type(error).__name__}") from error
    if len(body) > MAX_RESPONSE_BYTES:
        raise RuntimeError("balance response exceeds the configured byte limit")
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeError) as error:
        raise RuntimeError("balance response is not JSON") from error
    if not isinstance(payload, dict):
        raise RuntimeError("balance response is not a JSON object")
    return payload


def to_snapshot(payload: dict, currency: str) -> dict:
    """Project the API response onto the snapshot the tile and an agent read.

    @param payload - decoded balance response.
    @param currency - preferred currency; the first entry is used when absent.
    @returns the snapshot object.
    @raises RuntimeError - when the response carries no usable balance entry.
    """
    infos = payload.get("balance_infos")
    if not isinstance(infos, list) or not infos:
        raise RuntimeError("balance response carries no balance_infos entries")
    chosen = None
    for entry in infos:
        if isinstance(entry, dict) and entry.get("currency") == currency:
            chosen = entry
            break
    if chosen is None:
        chosen = next((entry for entry in infos if isinstance(entry, dict)), None)
    if chosen is None:
        raise RuntimeError("balance response carries no usable balance entry")
    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "currency": chosen.get("currency"),
        "total_balance": chosen.get("total_balance"),
        "granted_balance": chosen.get("granted_balance"),
        "topped_up_balance": chosen.get("topped_up_balance"),
        "is_available": payload.get("is_available"),
        "source": BALANCE_PATH,
    }


def write_atomic(path: pathlib.Path, snapshot: dict) -> None:
    """Replace the snapshot file in one step.

    @param path - destination file.
    @param snapshot - value to serialize.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(snapshot, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temp, path)
    except BaseException:
        pathlib.Path(temp).unlink(missing_ok=True)
        raise


def main() -> int:
    """Fetch one snapshot and publish it.

    @returns 0 after a successful publish, 1 when the fetch failed.
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=DEFAULT_OUT, help="snapshot file to replace")
    parser.add_argument("--key-env", default=DEFAULT_KEY_ENV, help="environment variable holding the API key")
    parser.add_argument("--profile", default="~/.bashrc", help="shell profile used as the key fallback")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API root")
    parser.add_argument("--currency", default="CNY", help="preferred balance currency")
    parser.add_argument("--timeout", type=float, default=10.0, help="request timeout in seconds")
    args = parser.parse_args()
    if not args.timeout > 0:
        parser.error("timeout must be positive")

    key = resolve_key(args.key_env, pathlib.Path(args.profile).expanduser())
    try:
        snapshot = to_snapshot(fetch(args.base_url, key, args.timeout), args.currency)
    except RuntimeError as error:
        # The previous snapshot stays in place: a reader shows the last known
        # balance with its own age instead of a fabricated zero.
        print(f"balance: {error}", file=sys.stderr)
        return 1
    write_atomic(pathlib.Path(args.out).expanduser(), snapshot)
    print(json.dumps(snapshot, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

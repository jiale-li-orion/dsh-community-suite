"""Regression tests for the deployment-only balance fetcher; run with unittest."""

import json
import os
import pathlib
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCRIPT = pathlib.Path(__file__).with_name("fetch_balance.py")
KEY = "sk-test-key-not-a-real-secret"


class Handler(BaseHTTPRequestHandler):
    """A local peer whose balance responses can model a broken endpoint."""

    mode = "healthy"
    seen_auth = None

    def log_message(self, *_args):
        pass

    def do_GET(self):
        type(self).seen_auth = self.headers.get("Authorization")
        if self.mode == "server-error":
            self.reply(500, b'{"error":"boom"}')
        elif self.mode == "not-json":
            self.reply(200, b"<html>maintenance</html>")
        elif self.mode == "no-infos":
            self.reply(200, b'{"is_available":true,"balance_infos":[]}')
        elif self.mode == "multi-currency":
            self.reply(200, json.dumps({
                "is_available": True,
                "balance_infos": [
                    {"currency": "USD", "total_balance": "1.00"},
                    {"currency": "CNY", "total_balance": "16.00", "granted_balance": "0.00",
                     "topped_up_balance": "16.00"},
                ],
            }).encode())
        else:
            self.reply(200, json.dumps({
                "is_available": True,
                "balance_infos": [{
                    "currency": "CNY", "total_balance": "16.00",
                    "granted_balance": "0.00", "topped_up_balance": "16.00",
                }],
            }).encode())

    def reply(self, status, body):
        """Answer one request with the given status and body."""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class BalanceTest(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(self._tempdir())
        self.out = self.dir / "balance.json"
        self.server = None

    def _tempdir(self):
        import tempfile
        handle = tempfile.TemporaryDirectory()
        self.addCleanup(handle.cleanup)
        return handle.name

    def run_script(self, mode="healthy", *args, env=None):
        """Serve one balance endpoint in the given mode and run the fetcher against it."""
        peer = type("Peer", (Handler,), {"mode": mode, "seen_auth": None})
        self.peer = peer
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), peer)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        environment = dict(os.environ)
        environment.pop("DEEPSEEK_API_KEY", None)
        environment["DEEPSEEK_API_KEY"] = KEY
        # The host proxy does not bypass loopback on its own, and a proxied
        # loopback request answers 502 from the proxy instead of reaching the
        # stub server below.
        environment["no_proxy"] = environment["NO_PROXY"] = "127.0.0.1,localhost"
        environment.update(env or {})
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--out", str(self.out),
             "--base-url", f"http://127.0.0.1:{self.server.server_port}", *args],
            capture_output=True, text=True, timeout=20, env=environment,
        )

    def test_publishes_one_snapshot_and_never_echoes_the_key(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        snapshot = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(snapshot["currency"], "CNY")
        self.assertEqual(snapshot["total_balance"], "16.00")
        self.assertTrue(snapshot["is_available"])
        self.assertIn("fetched_at", snapshot)
        self.assertNotIn(KEY, result.stdout)
        self.assertNotIn(KEY, result.stderr)

    def test_prefers_the_requested_currency(self):
        result = self.run_script("multi-currency")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(self.out.read_text(encoding="utf-8"))["total_balance"], "16.00")

    def test_keeps_the_previous_snapshot_when_the_endpoint_fails(self):
        self.run_script()
        before = self.out.read_text(encoding="utf-8")
        result = self.run_script("server-error")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.out.read_text(encoding="utf-8"), before)
        self.assertNotIn("Traceback", result.stderr)

    def test_rejects_a_body_that_is_not_json(self):
        result = self.run_script("not-json")
        self.assertEqual(result.returncode, 1)
        self.assertIn("not JSON", result.stderr)
        self.assertFalse(self.out.exists())

    def test_rejects_a_response_without_balance_entries(self):
        result = self.run_script("no-infos")
        self.assertEqual(result.returncode, 1)
        self.assertIn("balance_infos", result.stderr)

    def test_sends_the_key_as_a_bearer_token(self):
        self.run_script()
        self.assertEqual(self.peer.seen_auth, f"Bearer {KEY}")

    def test_resolves_the_key_from_the_shell_profile_when_the_environment_is_empty(self):
        profile = self.dir / "bashrc"
        profile.write_text('export OTHER=1\nexport DEEPSEEK_API_KEY="' + KEY + '"\n', encoding="utf-8")
        result = self.run_script("healthy", "--profile", str(profile), env={"DEEPSEEK_API_KEY": ""})
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_key_fails_without_touching_the_snapshot(self):
        profile = self.dir / "empty-bashrc"
        profile.write_text("# nothing here\n", encoding="utf-8")
        result = self.run_script("healthy", "--profile", str(profile), env={"DEEPSEEK_API_KEY": ""})
        self.assertEqual(result.returncode, 2)
        self.assertIn("DEEPSEEK_API_KEY", result.stderr)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()

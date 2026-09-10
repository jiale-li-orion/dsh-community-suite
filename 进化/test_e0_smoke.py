"""Regression tests for the deployment-only E0 probe; run with unittest."""

import json
import pathlib
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    """A local HTTP peer whose responses can model a broken deployment."""

    mode = "healthy"

    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.respond()

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.respond()

    def respond(self):
        refused = (self.headers.get("Host") == "e0-untrusted.invalid"
                   or self.headers.get("Origin") in ("https://e0-untrusted.invalid", "null")
                   or self.headers.get("Sec-Fetch-Site") == "cross-site")
        if refused and self.mode != "open-fence":
            status, body = 403, b"forbidden"
        elif self.path == "/workbench/file":
            status, body = 400, b"missing parameters"
        elif self.path.startswith("/api/events."):
            status, body = 101, b""
        elif self.path.startswith("/api/"):
            status = 200
            body = (b'<html>not an API</html>' if self.mode == "html-api" else
                    json.dumps({"result": {"ok": self.mode != "business-error"}}).encode())
        else:
            status, body = 200, b'<html><script>window.__DSH_BOOT__={}</script></html>'
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class SmokeTest(unittest.TestCase):
    def run_probe(self, mode="healthy", *args):
        peer = type("Peer", (Handler,), {"mode": mode})
        server = ThreadingHTTPServer(("127.0.0.1", 0), peer)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            return subprocess.run(
                [sys.executable, str(pathlib.Path(__file__).with_name("e0_smoke.py")),
                 f"http://127.0.0.1:{server.server_port}", *args],
                capture_output=True, text=True, timeout=15,
            )
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_records_transport_separately_from_probe_success(self):
        result = self.run_probe()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report["checks_passed"])
        self.assertFalse(report["https"])
        self.assertNotIn("phase_passed", report)

    def test_rejects_api_business_errors_even_with_http_200(self):
        result = self.run_probe("business-error")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertFalse(json.loads(result.stdout)["checks_passed"])

    def test_rejects_html_masquerading_as_api_success(self):
        result = self.run_probe("html-api")
        self.assertEqual(result.returncode, 1, result.stderr)

    def test_detects_a_missing_trust_fence(self):
        result = self.run_probe("open-fence")
        self.assertEqual(result.returncode, 1, result.stderr)
        failures = [row for row in json.loads(result.stdout)["checks"] if not row["passed"]]
        self.assertTrue(any("unknown-host" in row["name"] for row in failures))

    def test_requires_https_when_requested(self):
        result = self.run_probe("healthy", "--require-https")
        self.assertEqual(result.returncode, 1, result.stderr)

    def test_rejects_credentials_or_paths_in_target(self):
        script = str(pathlib.Path(__file__).with_name("e0_smoke.py"))
        for target in ("http://user:password@example.invalid", "http://localhost/api", "file:///tmp/x"):
            result = subprocess.run([sys.executable, script, target], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("password", result.stderr)


if __name__ == "__main__":
    unittest.main()

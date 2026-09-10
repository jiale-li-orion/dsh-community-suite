"""Report the TLS facts of one HTTPS endpoint; run from the host that owns the tailnet route.

Usage: python e0_tls_probe.py <host> [port]
"""

import json
import socket
import ssl
import sys


def main():
    """Print certificate subject/issuer/SAN/validity, negotiated TLS version and ALPN."""
    host = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 443
    context = ssl.create_default_context()
    context.set_alpn_protocols(["h2", "http/1.1"])
    with socket.create_connection((host, port), timeout=10) as raw:
        with context.wrap_socket(raw, server_hostname=host) as tls:
            cert = tls.getpeercert()
            print(json.dumps({
                "peer": f"{host}:{port}",
                "tls_version": tls.version(),
                "cipher": tls.cipher()[0],
                "alpn": tls.selected_alpn_protocol(),
                "subject": cert.get("subject"),
                "issuer": cert.get("issuer"),
                "san": [value for kind, value in cert.get("subjectAltName", []) if kind == "DNS"],
                "not_before": cert.get("notBefore"),
                "not_after": cert.get("notAfter"),
            }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

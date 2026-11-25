"""Zero-dependency local HTTP dev server wrapping the FinWise Lambda handler."""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.handler import lambda_handler


class DevHandler(BaseHTTPRequestHandler):
    def _dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        query_params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else ""

        event = {
            "rawPath": parsed.path,
            "queryStringParameters": query_params,
            "requestContext": {"http": {"method": method}},
            "body": raw_body,
            "isBase64Encoded": False,
        }
        result = lambda_handler(event)
        status = int(result.get("statusCode", 200))
        self.send_response(status)
        for k, v in (result.get("headers") or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(str(result.get("body", "{}")).encode("utf-8"))

    def do_GET(self) -> None:
        self._dispatch("GET")

    def do_POST(self) -> None:
        self._dispatch("POST")

    def do_DELETE(self) -> None:
        self._dispatch("DELETE")

    def do_OPTIONS(self) -> None:
        self._dispatch("OPTIONS")


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8000), DevHandler)
    print("FinWise local API running on http://127.0.0.1:8000")
    server.serve_forever()

"""Local service for live re optimisation. No extra packages.
Run:  python server.py          (listens on http://localhost:8036)
GET /status/oag[?date=YYYY-MM-DD]  today's CX departures from Hong Kong with OAG flight status (key from OAG_PRIMARY_KEY).
POST /solve  {"forced": {"160-...": "CX9102"}, "capScale": {"CX9102": 0.8}, "delays": {"CX9101": 9, "CX9104": 6}}
Returns the full result plus "diff" against the base plan. GET /base returns the base plan. GET /health."""
import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import run, status
from urllib.parse import parse_qs, urlparse

BASE = run.compute()
print("base plan ready:", BASE["summary"])


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, default=float).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/status/oag":
            date = (parse_qs(url.query).get("date") or [None])[0]
            return self._send(200, status.today(date))
        if self.path == "/health":
            self._send(200, dict(ok=True))
        elif self.path == "/base":
            self._send(200, BASE)
        else:
            self._send(404, dict(error="not found"))

    def do_POST(self):
        if self.path != "/solve":
            return self._send(404, dict(error="not found"))
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0) or b"{}")
            delays = {run.sc.TRIGGER: 9, **{k: float(v) for k, v in (req.get("delays") or {}).items()}}
            t0 = time.time()
            res = run.compute(forced=req.get("forced") or {}, cap_scale=req.get("capScale") or {}, delays=delays,
                              n_eval=300, with_compare=False)
            if res["feasible"]:
                res["diff"] = run.diff(BASE, res)
            res["totalSeconds"] = round(time.time() - t0, 2)
            self._send(200, res)
        except Exception as e:  # keep the demo alive
            self._send(400, dict(feasible=False, reason=f"Bad request: {e}"))

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8036), H).serve_forever()

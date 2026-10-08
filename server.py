#!/usr/bin/env python3
"""
Recruiting Agent Control Tower — local runtime (SW-06).

Serves the dashboard and exposes /api/agent/*, which proxies LLM calls to the
local OmniRoute gateway (OpenAI-compatible). The OmniRoute API key is read from
the opencode config at request time and injected server-side, so it never
reaches the browser and never lands in the git repo.

Run:   python3 server.py [port]     (default 8080)
Open:  http://127.0.0.1:8080/

Env overrides:
  OMNIROUTE_BASE      gateway base URL   (default http://127.0.0.1:20128/v1)
  CT_AGENT_MODEL      model to route to  (default auto/fast)
  OMNIROUTE_API_KEY   explicit key       (default: read from opencode.json)
  CT_AGENT_TIMEOUT    completion timeout (default 75s)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
OMNI_BASE = os.environ.get("OMNIROUTE_BASE", "http://127.0.0.1:20128/v1").rstrip("/")
AGENT_MODEL = os.environ.get("CT_AGENT_MODEL", "auto/fast")
AGENT_TIMEOUT = float(os.environ.get("CT_AGENT_TIMEOUT", "75"))
HEALTH_TTL = 30  # seconds

_health_cache = {"at": 0.0, "data": None}


def omni_key():
    """Locate the OmniRoute API key without ever exposing it to the client."""
    key = os.environ.get("OMNIROUTE_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    path = os.path.expanduser("~/.config/opencode/opencode.json")
    try:
        with open(path) as fh:
            cfg = json.load(fh)
        return cfg["provider"]["omniroute"]["options"]["apiKey"]
    except Exception:
        return None


def omni_chat(payload, timeout):
    key = omni_key()
    if not key:
        raise RuntimeError("no OmniRoute API key found (set OMNIROUTE_API_KEY)")
    req = urllib.request.Request(
        OMNI_BASE + "/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def agent_health():
    now = time.time()
    if _health_cache["data"] and now - _health_cache["at"] < HEALTH_TTL:
        return _health_cache["data"]
    data = {"ok": False, "model": AGENT_MODEL, "gateway": OMNI_BASE, "error": None, "ms": 0}
    t0 = time.time()
    try:
        key = omni_key()
        if not key:
            raise RuntimeError("no API key — set OMNIROUTE_API_KEY or run via opencode config")
        req = urllib.request.Request(OMNI_BASE + "/models", headers={"Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=6) as resp:
            json.load(resp)
        data["ok"] = True
    except Exception as exc:
        data["error"] = str(exc)[:200]
    data["ms"] = int((time.time() - t0) * 1000)
    _health_cache.update(at=now, data=data)
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/agent/health":
            self._json(agent_health())
        elif path == "/api/agent/model":
            self._json({"model": AGENT_MODEL, "gateway": OMNI_BASE})
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path != "/api/agent/generate":
            self._json({"ok": False, "error": "not found"}, 404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            self._json({"ok": False, "error": "invalid JSON body"}, 400)
            return

        system = str(req.get("system") or "You are a helpful recruiting copilot.").strip()
        prompt = str(req.get("prompt") or "").strip()
        if not prompt:
            self._json({"ok": False, "error": "prompt is required"}, 400)
            return

        payload = {
            "model": str(req.get("model") or AGENT_MODEL),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max(32, min(int(req.get("max_tokens") or 420), 1200)),
            "temperature": float(req.get("temperature", 0.4)),
        }
        t0 = time.time()
        try:
            data = omni_chat(payload, AGENT_TIMEOUT)
            text = data["choices"][0]["message"].get("content") or ""
            self._json({
                "ok": True,
                "text": text,
                "model": data.get("model", payload["model"]),
                "ms": int((time.time() - t0) * 1000),
            })
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            self._json({"ok": False, "error": "gateway HTTP %d: %s" % (exc.code, detail)}, 502)
        except Exception as exc:
            self._json({"ok": False, "error": str(exc)[:300]}, 502)


if __name__ == "__main__":
    health = agent_health()
    print("Recruiting Agent Control Tower  ->  http://127.0.0.1:%d/" % PORT)
    print("LLM gateway  ->  %s  (model: %s)" % (OMNI_BASE, AGENT_MODEL))
    print("agent status ->  %s" % ("LIVE" if health["ok"] else "OFFLINE — %s" % health.get("error")))
    sys.stdout.flush()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

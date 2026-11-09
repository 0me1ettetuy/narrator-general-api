"""OpenAI-compatible /v1/audio/speech in front of qwentts.cpp: same request, MP3 response."""

import json
import subprocess
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = "http://127.0.0.1:8080"
SPEECH_TIMEOUT_S = 600


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        self._send(status, json.dumps({"error": {"message": message}}).encode())

    def do_GET(self):
        if self.path != "/health":
            return self._error(404, "Not found")
        try:
            with urllib.request.urlopen(f"{UPSTREAM}/health", timeout=3) as upstream:
                healthy = json.load(upstream).get("status") == "ok"
        except (OSError, ValueError):
            healthy = False
        self._send(200 if healthy else 503, json.dumps({"status": "healthy" if healthy else "unhealthy"}).encode())

    def do_POST(self):
        if self.path != "/v1/audio/speech":
            return self._error(404, "Not found")
        try:
            payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except ValueError:
            return self._error(400, "Invalid JSON")
        if not str(payload.get("input", "")).strip():
            return self._error(400, "input must not be empty")
        if payload.get("response_format", "mp3") != "mp3":
            return self._error(400, "Only mp3 is supported")

        payload["response_format"] = "wav"
        request = urllib.request.Request(
            f"{UPSTREAM}/v1/audio/speech",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=SPEECH_TIMEOUT_S) as upstream:
                wav = upstream.read()
        except urllib.error.HTTPError as error:
            return self._error(502, f"Qwen3-TTS failed with status {error.code}")
        except OSError:
            return self._error(502, "Qwen3-TTS is unreachable")

        converted = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "mp3", "-b:a", "96k", "pipe:1"],
            input=wav, capture_output=True,
        )
        if converted.returncode != 0 or not converted.stdout:
            return self._error(500, "MP3 conversion failed")
        self._send(200, converted.stdout, "audio/mpeg")


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8002), Handler).serve_forever()

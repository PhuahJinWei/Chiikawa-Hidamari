"""Tiny local dev server. Not used in production — GitHub Pages hosts the real thing.

Serves this folder on $PORT (default 8099) and sends no-store, so a reload always
picks up the file you just edited instead of a cached copy.

    python serve.py
    PORT=9000 python serve.py
"""

import functools
import http.server
import os

PORT = int(os.environ.get("PORT") or 8099)
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


# Threading is not optional here. An ES module graph is fetched over several
# parallel keep-alive connections, and a single-threaded server sits on the
# first one waiting for a follow-up request while the browser waits for the
# other files — the page hangs at readyState "interactive" with nothing loaded.
server = http.server.ThreadingHTTPServer(("", PORT), functools.partial(Handler, directory=ROOT))
server.daemon_threads = True

print(f"serving {ROOT}\n  -> http://localhost:{PORT}", flush=True)
server.serve_forever()

"""Tiny local dev server. Not used in production — GitHub Pages hosts the real thing.

Serves this folder on $PORT (default 8099) and sends no-store, so a reload always
picks up the file you just edited instead of a cached copy.

    python serve.py
    PORT=9000 python serve.py

It also takes a POST at /save, which is how goldens.html gets a contact sheet
onto the disk for dev/compare.py to diff. A browser download would do the same
job by way of the Downloads folder, a dialog and a rename; this puts the file
where the differ already looks.
"""

import functools
import http.server
import os
import re

PORT = int(os.environ.get("PORT") or 8099)
ROOT = os.path.dirname(os.path.abspath(__file__))
SAVE_DIR = os.path.join(ROOT, "goldens")

# The whole of what a name is allowed to be. Not a path — a bare filename with
# no separators, no dots leading anywhere, and a known extension. This server is
# bound to localhost and is a toy, which is exactly the reason to keep the one
# route that WRITES from being talked into writing outside its own folder.
#
# `.txt` as well as `.png` because a contact sheet is not the only thing worth
# capturing: a refactor that must not change BEHAVIOUR is checked against a
# dump of every derived value across a matrix of hours, switches and occupancy,
# and that is text. See the fingerprint in LIGHTING_REWORK.md.
SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]{1,64}\.(png|txt)$")

# Bigger than any sheet the rig makes (the six-by-four is about 1.5MB) and small
# enough that a runaway post cannot eat the machine.
MAX_UPLOAD = 64 * 1024 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_POST(self):
        if self.path.split("?")[0] != "/save":
            self.send_error(404)
            return

        name = self.headers.get("X-Filename", "")
        if not SAFE_NAME.match(name) or ".." in name:
            self.send_error(400, "bad filename")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.send_error(400, "bad length")
            return
        if length <= 0 or length > MAX_UPLOAD:
            self.send_error(413, "bad size")
            return

        body = self.rfile.read(length)
        os.makedirs(SAVE_DIR, exist_ok=True)
        path = os.path.join(SAVE_DIR, name)
        with open(path, "wb") as fh:
            fh.write(body)

        print(f"saved {path} ({len(body)} bytes)", flush=True)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(path)))
        self.end_headers()
        self.wfile.write(path.encode())

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

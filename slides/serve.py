# Serves the deck from the current directory with Cache-Control: private, max-age=0, so every load revalidates (a 304
# when nothing changed) and a redeployed deck shows at once, screenshots included. Cloudflare passes this one through;
# for a plain no-cache it tells browsers to keep images for 4 hours.
#
#   python3 serve.py 4091
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "private, max-age=0")
        super().end_headers()


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), NoCache).serve_forever()

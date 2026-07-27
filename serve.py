"""Dev server for Garbage Grapple — static files with no-cache headers so
browser ES-module caching never serves stale code during development.
Usage: python serve.py  (serves on http://localhost:8095)
"""
import http.server

PORT = 8095


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_PUT(self):
        # dev-only: accept screenshot uploads into shots/ (used for docs/presentations)
        import os, re
        name = os.path.basename(self.path)
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.(jpg|png)', name):
            self.send_error(400, 'bad name')
            return
        os.makedirs('shots', exist_ok=True)
        length = int(self.headers.get('Content-Length', 0))
        if length > 20_000_000:
            self.send_error(413)
            return
        with open(os.path.join('shots', name), 'wb') as f:
            f.write(self.rfile.read(length))
        self.send_response(201)
        self.end_headers()


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Serving on http://localhost:{PORT}')
        httpd.serve_forever()

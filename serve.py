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


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Serving on http://localhost:{PORT}')
        httpd.serve_forever()

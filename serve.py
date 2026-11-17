"""Serve the built Eventra site locally: python3 serve.py  ->  http://localhost:4611/"""
import http.server, functools, pathlib, socketserver

ROOT = pathlib.Path(__file__).resolve().parent / "site"
PORT = 4611


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".md": "text/plain; charset=utf-8",
        ".js": "text/javascript",
        ".otf": "font/otf",
        ".webmanifest": "application/manifest+json",
        "": "application/json",  # /api/country
    }


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), functools.partial(Handler, directory=str(ROOT))) as httpd:
        print(f"Eventra: http://localhost:{PORT}/  (dashboard: http://localhost:{PORT}/dashboard/)")
        httpd.serve_forever()

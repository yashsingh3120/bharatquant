#!/usr/bin/env python3
"""
BharatQuant Live Stock Data & Web Server
Serves static files and provides /api/stock proxy to fetch 100% real live market data
from Yahoo Finance with no CORS restrictions and caching.
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import time
import sys
import os
import threading

PORT = int(os.environ.get('PORT', 8080))
CACHE_TTL = 15  # Cache stock quotes for 15 seconds to be fast & respect rate limits
cache = {}  # key -> (timestamp, data_bytes)

def keep_alive_worker():
    """
    Background daemon that pings the server every 11 minutes (660s)
    to prevent Render/free-tier cloud services from sleeping due to inactivity.
    Render automatically provides the RENDER_EXTERNAL_URL environment variable.
    """
    time.sleep(25)  # Wait for server to bind and start
    while True:
        url = os.environ.get('RENDER_EXTERNAL_URL') or os.environ.get('KEEP_ALIVE_URL')
        if url:
            try:
                ping_url = f"{url.rstrip('/')}/api/health"
                req = urllib.request.Request(
                    ping_url,
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BharatQuant-KeepAlive/1.0'}
                )
                with urllib.request.urlopen(req, timeout=20) as resp:
                    print(f"[KEEP-ALIVE] Pinged {ping_url} -> Status: {resp.getcode()}", file=sys.stderr)
            except Exception as e:
                print(f"[KEEP-ALIVE] Ping notification: {e}", file=sys.stderr)
        time.sleep(11 * 60)  # Ping every 11 minutes (well before Render's 15-minute sleep threshold)


class BharatQuantHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path == '/api/stock':
            self.handle_stock_api(parsed.query)
        elif parsed.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "live": True}).encode('utf-8'))
        else:
            # Serve static files from current directory
            super().do_GET()

    def handle_stock_api(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        symbol = params.get('symbol', ['TCS.NS'])[0]
        range_val = params.get('range', ['1y'])[0]
        interval = params.get('interval', ['1d'])[0]
        
        cache_key = f"{symbol}:{range_val}:{interval}"
        now = time.time()
        
        if cache_key in cache:
            timestamp, cached_bytes = cache[cache_key]
            if now - timestamp < CACHE_TTL:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('X-Cache', 'HIT')
                self.end_headers()
                self.wfile.write(cached_bytes)
                return

        yahoo_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range={range_val}&interval={interval}&includePrePost=false"
        
        req = urllib.request.Request(
            yahoo_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        )
        
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                status = response.getcode()
                body = response.read()
                
                # Verify valid JSON
                data = json.loads(body.decode('utf-8'))
                result = data.get('chart', {}).get('result')
                
                if result and len(result) > 0:
                    cache[cache_key] = (now, body)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('X-Cache', 'MISS')
                    self.end_headers()
                    self.wfile.write(body)
                    return
                else:
                    raise ValueError("Empty or invalid chart result from Yahoo Finance")
        except Exception as e:
            print(f"[ERROR] Failed fetching {symbol}: {e}", file=sys.stderr)
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": str(e),
                "symbol": symbol,
                "chart": {"result": None}
            }).encode('utf-8'))

    def end_headers(self):
        # Prevent caching for dynamic content
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Only log errors and API hits to keep terminal neat
        if "api/stock" in args[0] or "500" in args[1] or "502" in args[1]:
            super().log_message(format, *args)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    web_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(web_dir)
    print(f"Starting BharatQuant Live Server on port {PORT} (dir: {web_dir})...")
    # Start Keep-Alive daemon to prevent cloud sleep (Render 24/7 active)
    threading.Thread(target=keep_alive_worker, daemon=True).start()
    with ThreadedTCPServer(("0.0.0.0", PORT), BharatQuantHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.server_close()

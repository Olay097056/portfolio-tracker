import urllib.request

base = "https://bond-crisis-dashboard-v2.vercel.app/_next/static/chunks/app"
for page, chunk in [("sentiment", "fda56724f6b8001b"), ("learn", "077c4cf293ea711e"),
                    ("settings", "7bfcac609d62a585")]:
    url = f"{base}/{page}/page-{chunk}.js"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Chrome/126"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8", errors="ignore")
    open(f"{page}-page.js", "w", encoding="utf-8").write(body)
    print(page, "->", r.status, len(body), "bytes")

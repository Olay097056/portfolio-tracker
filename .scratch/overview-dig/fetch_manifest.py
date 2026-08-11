import urllib.request
import re

base = "https://bond-crisis-dashboard-v2.vercel.app"
for name in ["_buildManifest", "_ssgManifest"]:
    try:
        req = urllib.request.Request(base + "/" + name + ".js",
                                     headers={"User-Agent": "Mozilla/5.0 Chrome/126"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8", errors="ignore")
        print(name, "->", r.status, len(body), "bytes")
        open(name + ".js", "w", encoding="utf-8").write(body)
    except Exception as e:
        print(name, "ERROR", e)

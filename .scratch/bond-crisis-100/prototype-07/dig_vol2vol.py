"""Dig vol2vol's JS bundles for the real API endpoints."""
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="ignore")


html = get("https://www.vol2vol.com/")
print("html bytes:", len(html))
# find _next chunks
chunks = sorted(set(re.findall(r'src="(/_next/static/chunks/[^"]+\.js)"', html)))
print("chunks:", len(chunks))
for c in chunks[:12]:
    print(" ", c)

# fetch a few and grep for api paths
for c in chunks:
    url = "https://www.vol2vol.com" + c
    try:
        js = get(url)
    except Exception as e:
        continue
    apis = set(re.findall(r'["\'](/api/[^"\']+)["\']', js)) | set(re.findall(r'["\'](https?://[^"\']*vol2vol[^"\']*)["\']', js))
    if apis:
        print(f"\n{c.split('/')[-1]} ({len(js)}b):")
        for a in sorted(apis)[:10]:
            print("  ", a[:150])

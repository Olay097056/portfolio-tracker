import urllib.request
import re

url = "https://www.konbalongtun.com/investor-tracker"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

with urllib.request.urlopen(req) as response:
    html = response.read().decode("utf-8")
    print("Title:", re.findall(r'<title>(.*?)</title>', html))
    scripts = re.findall(r'<script.*?>', html)
    print("Script tags count:", len(scripts))
    for s in scripts[:10]:
        print(" ", s)
    
    # Check for API endpoints in HTML
    api_urls = re.findall(r'https?://[^\s"\'<>]+api[^\s"\'<>]+', html)
    print("API URLs found:", set(api_urls[:10]))

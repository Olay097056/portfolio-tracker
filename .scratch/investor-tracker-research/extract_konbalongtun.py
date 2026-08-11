import urllib.request
import re
import json

url = "https://www.konbalongtun.com/investor-tracker"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode("utf-8")
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
        if match:
            data = json.loads(match.group(1))
            page_props = data.get("props", {}).get("pageProps", {})
            print("--- PAGE PROPS KEYS ---")
            print(list(page_props.keys()))
            
            with open("konbalongtun_data.json", "w", encoding="utf-8") as f:
                json.dump(page_props, f, ensure_ascii=False, indent=2)
            print("Saved to konbalongtun_data.json successfully")
        else:
            print("No NEXT_DATA found in HTML")
except Exception as e:
    print("Error:", e)

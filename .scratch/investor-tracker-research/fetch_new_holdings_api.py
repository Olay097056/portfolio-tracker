import urllib.request
import json

url = "https://www.konbalongtun.com/api-server/investors/new-holdings?page=1&limit=50"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode("utf-8"))
        items = data.get("data", data) if isinstance(data, dict) else data
        print("Total new holdings items:", len(items))
        print("Sample item:", json.dumps(items[0] if items else {}, indent=2, ensure_ascii=False))
        
        with open("new_holdings_dump.json", "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        print("Saved to new_holdings_dump.json successfully")
except Exception as e:
    print("Error fetching new holdings API:", e)

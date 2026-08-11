import urllib.request
import json

url = "https://www.konbalongtun.com/api-server/investors/investors-with-holdings?limit=50&page=1"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

with urllib.request.urlopen(req) as res:
    data = json.loads(res.read().decode("utf-8"))
    items = data.get("data", data) if isinstance(data, dict) else data
    print("Total investors fetched:", len(items))
    for idx, inv in enumerate(items):
        print(f"{idx+1}. {inv.get('name')} ({inv.get('managedFund')}) - Performance: {inv.get('performance')}% | AUM: {inv.get('portfolioValue')} | Holdings count: {len(inv.get('holdings', []))}")
        
    with open("all_investors_dump.json", "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print("Saved all investors to all_investors_dump.json")

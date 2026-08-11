"""Probe 25: gold volume with productId=437."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
for td in ["20260807", "20260810"]:
    url = f"https://www.cmegroup.com/CmeWS/mvc/Volume/Details/F/437/{td}/G?tradeDate={td}&pageSize=500"
    r = httpx.get(url, headers=UA, timeout=25)
    try:
        d = r.json()
        t = d.get("totals", {})
        print(f"[{r.status_code}] {td}: totalVol={t.get('totalVolume')} globex={t.get('globex')} "
              f"monthData={len(d.get('monthData', []))} empty={d.get('empty')}")
        if d.get("monthData"):
            print("  sample:", d["monthData"][0])
    except Exception as e:
        print(f"[{r.status_code}] {td}: {r.text[:150]}")

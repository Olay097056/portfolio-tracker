import urllib.request
import json

CIKS = {
    "warren-buffett": {"cik": "0001067983", "name": "Warren Buffett", "fund": "Berkshire Hathaway Inc."},
    "cathie-wood": {"cik": "0001697748", "name": "Cathie Wood", "fund": "ARK Investment Management LLC"},
    "ray-dalio": {"cik": "0001350694", "name": "Ray Dalio", "fund": "Bridgewater Associates LP"},
    "bill-gates": {"cik": "0001166559", "name": "Bill Gates", "fund": "Bill & Melinda Gates Foundation Trust"},
    "michael-burry": {"cik": "0001649339", "name": "Michael Burry", "fund": "Scion Asset Management LLC"},
    "li-lu": {"cik": "0001407545", "name": "Li Lu", "fund": "Himalaya Capital Management LLC"},
}

def fetch_sec_filings(cik):
    url = f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"
    headers = {"User-Agent": "PortfolioTrackerApp/1.0 (contact@portfoliotracker.local)"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode("utf-8"))
        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        
        filings_13f = []
        for i, form in enumerate(forms):
            if "13F-HR" in form:
                filings_13f.append({
                    "form": form,
                    "date": dates[i] if i < len(dates) else "",
                    "accession": accessions[i] if i < len(accessions) else ""
                })
        return data.get("name"), filings_13f[:3]

for slug, meta in CIKS.items():
    sec_name, recent_13f = fetch_sec_filings(meta["cik"])
    print(f"[{slug}] SEC Name: {sec_name} | Latest 13F: {recent_13f[0] if recent_13f else 'None'}")

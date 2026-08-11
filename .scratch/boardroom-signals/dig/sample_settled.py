import glob, json, re, urllib.request
DIG = r"C:\Users\bit-it.helpdesk\Desktop\claude\portfolio-tracker\.scratch\boardroom\dig"
URL = "https://vovprwjjauwqqiowwgqd.supabase.co"
jwt_re = re.compile(r"eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}")
key = None
for path in glob.glob(DIG + r"\*.js"):
    src = open(path, encoding="utf-8", errors="ignore").read()
    m = jwt_re.search(src)
    if m:
        key = m.group(0)
        break
headers = {"apikey": key, "Authorization": f"Bearer {key}"}
req = urllib.request.Request(
    URL + "/rest/v1/boardroom_meetings?select=id,agenda,ended_at,resolution_json&status=eq.completed&order=ended_at.desc&limit=200",
    headers=headers)
meetings = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
found = 0
for m in meetings:
    rj = m.get("resolution_json") or {}
    o = rj.get("outcome") or {}
    h = o.get("h") or {}
    if h.get("results"):
        print("=== meeting", m.get("id"), "ended", m.get("ended_at"))
        print("stance[0]:", json.dumps((rj.get("stances") or [{}])[0], ensure_ascii=False)[:400])
        print("h.results[0]:", json.dumps(h["results"][0], ensure_ascii=False)[:400])
        for k in ("d1", "d3", "d7"):
            d = o.get(k) or {}
            rs = d.get("results") or []
            if rs:
                print(f"{k}.results[0]:", json.dumps(rs[0], ensure_ascii=False)[:300], "| scored_at:", d.get("scored_at"))
        found += 1
        if found >= 2:
            break
print("meetings with non-empty h.results found:", found)

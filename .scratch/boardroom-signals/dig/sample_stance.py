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
    URL + "/rest/v1/boardroom_meetings?select=id,agenda,ended_at,resolution_json&status=eq.completed&order=ended_at.desc&limit=100",
    headers=headers)
meetings = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())

from collections import Counter
cnt = Counter()
sample_stance = None
sample_outcome = None
settled_with = None
for m in meetings:
    rj = m.get("resolution_json") or {}
    for s in rj.get("stances") or []:
        a = str(s.get("asset", "")).upper()
        cnt[a] += 1
        if sample_stance is None and s.get("due_at"):
            sample_stance = s
    o = rj.get("outcome") or {}
    if o.get("h") and sample_outcome is None:
        sample_outcome = o
        settled_with = m.get("id")
print("=== asset frequency (top 25):")
for a, n in cnt.most_common(25):
    print(f"  {a}: {n}")
print("\n=== sample stance (has due_at):")
print(json.dumps(sample_stance, ensure_ascii=False, indent=1)[:900])
print("\n=== sample outcome (settled meeting", settled_with, "):")
print(json.dumps(sample_outcome, ensure_ascii=False, indent=1)[:1200])

import json
import re
import urllib.request

jwt = re.compile(r'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}')
key = None
import glob
for f in glob.glob('*.js'):
    src = open(f, encoding='utf-8', errors='ignore').read()
    m = jwt.search(src)
    if m:
        key = m.group(0)
        break

BASE = 'https://vovprwjjauwqqiowwgqd.supabase.co/rest/v1'
H = {'apikey': key, 'Authorization': 'Bearer ' + key}

# full ai_briefs row
url = f'{BASE}/ai_briefs?select=*&order=generated_at.desc&limit=1'
req = urllib.request.Request(url, headers=H)
with urllib.request.urlopen(req, timeout=20) as r:
    data = json.loads(r.read().decode())
print('=== ai_briefs full ===')
print(json.dumps(data[0], ensure_ascii=False, indent=1)[:2500])

# probe for events/calendar table (ForexFactory source)
for t in ['economic_events', 'calendar_events', 'events', 'forex_calendar', 'upcoming_events']:
    url = f'{BASE}/{t}?select=*&limit=1'
    try:
        req = urllib.request.Request(url, headers=H)
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read().decode())
        print(f'\n=== {t}: EXISTS ({len(d)} rows) ===')
        if d:
            print(json.dumps(d[0], ensure_ascii=False)[:400])
    except Exception as e:
        print(f'\n=== {t}: {e} ===')

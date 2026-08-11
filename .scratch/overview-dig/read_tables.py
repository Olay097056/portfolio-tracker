import json
import re
import urllib.request

# extract anon key from bundle
jwt = re.compile(r'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}')
key = None
import glob
for f in glob.glob('*.js'):
    src = open(f, encoding='utf-8', errors='ignore').read()
    m = jwt.search(src)
    if m:
        key = m.group(0)
        break
print('anon key:', key[:20] + '...' if key else None)

BASE = 'https://vovprwjjauwqqiowwgqd.supabase.co/rest/v1'
H = {'apikey': key, 'Authorization': 'Bearer ' + key}

for table in ['crisis_phase_current', 'model_scores', 'macro_series', 'risk_warnings',
              'country_risk_scores', 'ai_briefs']:
    url = f'{BASE}/{table}?select=*&limit=2'
    req = urllib.request.Request(url, headers=H)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
        print(f'\n=== {table} ({len(data)} rows) ===')
        if data:
            print(json.dumps(data[0], ensure_ascii=False)[:600])
    except Exception as e:
        print(f'\n=== {table}: ERROR {e} ===')

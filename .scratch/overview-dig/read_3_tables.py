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

for table, extra in [('retail_sentiment', '&limit=3&order=recorded_at.desc'),
                     ('index_hourly', '&limit=3&order=recorded_at.desc'),
                     ('lesson_progress', '&limit=2'),
                     ('telegram_links', '&limit=2'),
                     ('user_profiles', '&limit=2')]:
    url = f'{BASE}/{table}?select=*{extra}'
    try:
        req = urllib.request.Request(url, headers=H)
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
        print(f'=== {table} ({len(data)} rows) ===')
        if data:
            print(json.dumps(data[0], ensure_ascii=False)[:500])
    except Exception as e:
        print(f'=== {table}: {e} ===')
    print()

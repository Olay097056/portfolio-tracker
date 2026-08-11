import re

src = open('../boardroom/dig/i18n-3474.js', encoding='utf-8', errors='ignore').read()
keys = sorted(set(re.findall(r'(cme[A-Z][A-Za-z0-9]*):"', src)))
want = [k for k in keys if any(s in k for s in ['Fw', 'Flow', 'Strike', 'Range', 'Iv', 'Vol', 'Pc', 'Sigma', 'Zone', 'Prod', 'Product', 'Rank', 'Event'])]
for k in want:
    m = re.search(re.escape(k) + r':"((?:[^"\\\\]|\\\\.)*)"', src)
    if m:
        print(f'{k}: {m.group(1)[:100]}')

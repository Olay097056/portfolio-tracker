import re

src = open('../boardroom/dig/i18n-3474.js', encoding='utf-8', errors='ignore').read()

# cme* keys
keys = sorted(set(re.findall(r'(cme[A-Z][A-Za-z0-9]*):"', src)))
print('cme* keys:', len(keys))
for k in keys:
    m = re.search(re.escape(k) + r':"((?:[^"\\\\]|\\\\.)*)"', src)
    if m:
        print(f'  {k}: {m.group(1)[:90]}')

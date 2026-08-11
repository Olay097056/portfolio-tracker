import re

src = open('cme-module.js', encoding='utf-8', errors='ignore').read()

# list ALL series ids referenced in the module (macro_series keys)
ids = sorted(set(re.findall(r'id:"([a-z0-9_]+)"', src)))
print('ids:', ids)

# find IV/straddle/vol related series ids (fetched via macro_series .in()
for pat in ['iv_', 'straddle', 'vol', 'imp', 'atmf', 'strike', 'pc_', 'put_call', 'range']:
    hits = [m.start() for m in re.finditer(pat, src)]
    print(pat, ':', len(hits))

# find the cme-read fetch — where products data comes from
i = src.find('cme-read')
print()
print('=== cme-read context ===')
print(src[max(0, i-400):i+400])

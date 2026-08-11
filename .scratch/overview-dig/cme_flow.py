import re

src = open('cme-module.js', encoding='utf-8', errors='ignore').read()

# 1. main data fetch function — find the Promise.all / async function
i = src.find('async function')
if i == -1:
    i = src.find('async (')
print('async at:', i)
# find fetch calls context
for m in re.finditer(r'fetch\("([^"]+)"', src):
    print('fetch:', m.group(1))

print()
# 2. FedWatch calc — search for ZQ, EFFR, probability math
for kw in ['96.305', 'ZQ', 'effr', 'EFFR', 'fedwatch', 'FedWatch', 'fed_funds']:
    hits = [m.start() for m in re.finditer(re.escape(kw), src)]
    print(kw, ':', len(hits), 'hits')

# 3. show the main load function (first 2000 chars after 'async function')
if i != -1:
    print()
    print('=== main fetch fn head ===')
    print(src[i:i+2000])

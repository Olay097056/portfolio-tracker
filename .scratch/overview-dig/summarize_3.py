import re

for page in ['sentiment', 'learn', 'settings']:
    src = open(f'{page}-page.js', encoding='utf-8', errors='ignore').read()
    print(f'=== {page} ({len(src)}b) ===')
    mods = re.findall(r'(\d+):\(e,t,s\)=>\{', src)
    lazy = re.findall(r'(\d+):\(e,t,s\)=>\{Promise\.resolve\(\)\.then\(s\.bind\(s,(\d+)\)\)', src)
    tables = sorted(set(re.findall(r'\.from\("([a-z_]+)"\)', src)))
    rpcs = sorted(set(re.findall(r'\.rpc\("([a-z_]+)"\)', src)))
    fns = sorted(set(re.findall(r'/functions/v1/[a-z-]+', src)))
    urls = sorted(set(re.findall(r'https?://[a-z0-9./_-]+', src)))
    keys = sorted(set(re.findall(r'b\.([A-Za-z0-9_]+)', src)))
    print('lazy:', lazy)
    print('tables:', tables)
    print('rpc:', rpcs)
    print('fns:', fns)
    print('urls:', [u for u in urls if 'vercel' not in u][:8])
    print('i18n keys:', keys)
    print()

import re

src = open('cme-page.js', encoding='utf-8', errors='ignore').read()
i = src.find('82816:(')
print('module 82816 at:', i)
# module ends at next top-level module def
next_mod = re.search(r',(\d+):\(e,t,a\)=>\{', src[i+10:])
end = i + 10 + next_mod.start() if next_mod else len(src)
mod = src[i:end]
print('module len:', len(mod))
open('cme-module.js', 'w', encoding='utf-8').write(mod)
pretty = re.sub(r'([;{}])', r'\1\n', mod)
open('cme-module.pretty.js', 'w', encoding='utf-8').write(pretty)
print('saved. pretty bytes:', len(pretty))

# quick facts: tables, functions, i18n keys
print('\nTABLES:', sorted(set(re.findall(r'\.from\("([a-z_]+)"\)', mod))))
print('RPCs:', sorted(set(re.findall(r'\.rpc\("([a-z_]+)"\)', mod))))
print('functions:', sorted(set(re.findall(r'/functions/v1/[a-z-]+', mod))))
print('i18n keys:', sorted(set(re.findall(r'b\.([A-Za-z0-9_]+)', mod)))[:40])

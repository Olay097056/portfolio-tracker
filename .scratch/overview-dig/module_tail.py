import re
src = open('overview-module.js', encoding='utf-8', errors='ignore').read()
# imports of the module
imports = re.findall(r'var ([a-z])=s\((\d+)\)', src)
print('imports:', imports)
# search module 89547 for subcomponents referenced: YieldCurveChart=h(33295) already known
# find where 'b.' i18n keys used and what other b.* keys exist
keys = sorted(set(re.findall(r'b\.([A-Za-z0-9_]+)', src)))
print('i18n keys used in module:', keys)
# check for subcomponent functions/keys like b.keyFigures, b.yieldCurve — maybe rendered via imported components
print()
print('tail of module:')
print(src[-1800:])

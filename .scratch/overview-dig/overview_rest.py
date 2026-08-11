import re
src = open('overview-module.pretty.js', encoding='utf-8', errors='ignore').read()
print('total pretty lines:', src.count('\n'))
# find sections by i18n key usage
for key in ['aiBrief', 'recommend', 'imagin', 'events', 'forex', 'warnings', 'notif', 'regime', 'topModel', 'countryRisk', 'keyFigures', 'yieldCurve', 'modelsList']:
    hits = [m.start() for m in re.finditer(re.escape('b.' + key), src)]
    print(f'b.{key}: {len(hits)} hits')
# print the middle part we haven't seen (between REGIME card and end)
i_start = src.find('b.regime')
i_end = src.rfind('b.overview')
print()
print('=== section after regime (tail) ===')
print(src[src.find('countryRisk'):src.find('countryRisk')+2000])

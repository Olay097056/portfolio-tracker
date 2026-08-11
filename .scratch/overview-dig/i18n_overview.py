import re, glob, os

# find i18n file in sibling digs
candidates = [
    '../boardroom/dig/i18n-3474.js',
    '../boardroom-signals/dig/i18n-3474.js',
    'chunk-3474-e1aec38ee927d485.js',
]
path = None
for c in candidates:
    if os.path.exists(c):
        path = c
        break
print('i18n file:', path)
src = open(path, encoding='utf-8', errors='ignore').read()
print('bytes:', len(src))

# extract the overview keys (b.* namespace)
keys = ['overview', 'lastUpdated', 'aiBrief', 'refreshBrief', 'analyzing', 'actionFailed',
        'aiRecommendations', 'aiScenarios', 'upcomingEvents', 'calendarSource',
        'activeWarnings', 'regime', 'confidence', 'transitionZone', 'topModel', 'models',
        'countryRisk', 'viewAll', 'readMore', 'readLess', 'forecastShort', 'prevShort',
        'chatMissingKey', 'keyFigures', 'yieldCurve', 'modelStatus', 'updated', 'now']
for k in keys:
    m = re.search(r'%s:\"([^\"]*)\"' % re.escape(k), src)
    if m:
        print(f'{k}: {m.group(1)}')
    else:
        m2 = re.search(r'%s:\"((?:[^"\\\\]|\\\\.)*)\"' % re.escape(k), src)
        print(f'{k}: {m2.group(1) if m2 else "NOT FOUND"}')

import re

html = open('learn.html', encoding='utf-8', errors='ignore').read()
chunks = sorted(set(re.findall(r'src="([^"]*chunks/(?!app/)[^"]+\.js)"', html)))
print('all shared chunks in learn.html:')
for c in chunks:
    print(' ', c.split('/')[-1])

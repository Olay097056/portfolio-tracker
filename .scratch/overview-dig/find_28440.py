import re
import glob

# search all downloaded chunks for module 28440 (lessons data)
for f in glob.glob('*.js'):
    src = open(f, encoding='utf-8', errors='ignore').read()
    if re.search(r'28440:\(', src):
        print('28440 DEFINED in', f)
        i = src.find('28440:(')
        seg = src[i:i+5000]
        print(seg[:4500])
        break
else:
    print('not in any downloaded chunk — check learn.html scripts')
    html = open('learn.html', encoding='utf-8', errors='ignore').read()
    chunks = sorted(set(re.findall(r'src="([^"]*chunks/[^"]+\.js)"', html)))
    print('learn.html chunks:')
    for c in chunks:
        print(' ', c)

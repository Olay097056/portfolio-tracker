import re, glob

# find anon key (JWT) in downloaded chunks
jwt = re.compile(r'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}')
found = set()
for f in glob.glob('*.js') + glob.glob('../boardroom/dig/*.js'):
    try:
        src = open(f, encoding='utf-8', errors='ignore').read()
        for m in jwt.finditer(src):
            found.add(m.group(0))
    except Exception:
        pass
for k in found:
    print(k)
print('---')
# also find supabase URL
for f in glob.glob('*.js'):
    src = open(f, encoding='utf-8', errors='ignore').read()
    m = re.search(r'https://[a-z0-9]+\.supabase\.co', src)
    if m:
        print('supabase url:', m.group(0))
        break

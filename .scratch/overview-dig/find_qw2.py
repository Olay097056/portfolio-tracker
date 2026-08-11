import re
src = open('chunk-7362-4aa258e42d947c01.js', encoding='utf-8', errors='ignore').read()

# search for all let/const declarations near top level
for mm in re.finditer(r'(?:;|^)(let|const|var) ([a-z])[=:]', src):
    print('decl:', mm.group(1), mm.group(2), 'at', mm.start())
    print('  head:', src[mm.start():mm.start()+200].replace('\n',' ')[:190])
    print()

# find 'normal' (the fallback phase key seen in overview: o.Qw.normal)
i = src.find('normal')
while i != -1:
    ctx = src[max(0,i-80):i+80]
    if 'Qw' in ctx or 'phase' in ctx or ':' in ctx:
        print('normal ctx:', ctx.replace('\n',' ')[:160])
    i = src.find('normal', i+1)
    if i > 50000: break

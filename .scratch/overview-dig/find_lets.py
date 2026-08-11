import re
src = open('chunk-7362-4aa258e42d947c01.js', encoding='utf-8', errors='ignore').read()
for mm in re.finditer(r'let ([a-z])=\{"', src):
    print('let', mm.group(1), 'at', mm.start())
    print('  head:', src[mm.start():mm.start()+300].replace('\n', ' ')[:280])
    print()

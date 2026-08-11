import re
src = open('chunk-7362-4aa258e42d947c01.js', encoding='utf-8', errors='ignore').read()

# The export is t.d(o,{Du:()=>s,L6:()=>r,Qw:()=>a,Zt:()=>n,rZ:()=>i})
# So after 'let r={...}' there must be 'let a=' / 'let n=' / 'let s=' / 'let i='
# Find all top-level 'let X=' occurrences
for mm in re.finditer(r';let ([a-z])=', src):
    start = mm.start() + 1
    print('let', mm.group(1), 'at', start)
    print('  head:', src[start:start+250].replace('\n', ' ')[:230])
    print()

# Also find the very end of the module (next module id)
nextmod = re.search(r'\},(\d+):\(e,o,t\)=>', src[1000:])
if nextmod:
    print('next module at', 1000 + nextmod.start())

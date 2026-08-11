import re
import glob

# Find which chunk defines module 82816 by scanning ALL downloaded js
# Also look for webpack chunk-id -> file mapping (_.u or e.u functions)
for f in sorted(glob.glob('*.js')):
    src = open(f, encoding='utf-8', errors='ignore').read()
    # module def pattern variants
    if re.search(r'82816:\(e,t', src):
        print('82816 DEFINED in', f)
    # chunk map: {chunkId: "filename"} patterns like {"6534":"..."} or u=()=>"..." 
    m = re.search(r'\.u=\(\)=>"([^"]+)"', src)
    if m:
        print('chunk loader in', f, '->', m.group(1))
    # push([[chunkIds],[modules]]) headers
    for mm in re.finditer(r'push\(\[\[([0-9,]+)\]\]', src):
        if '6534' in mm.group(1):
            print('chunk 6534 group declared in', f)

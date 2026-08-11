import re, glob

# Qw = phase name map, Zt = model status map — find which module exports them
for f in glob.glob('*.js'):
    src = open(f, encoding='utf-8', errors='ignore').read()
    # exports pattern: t.d(o,{...Qw:()=>a...})
    m = re.search(r't\.d\(o,\{([^}]*)\}\)', src)
    if m and ('Qw' in m.group(1) or 'Zt' in m.group(1) or 'L6' in m.group(1)):
        print(f, '->', m.group(1)[:200])
    # also search for phase names in Thai (transition zone strings)
    if 'is_transition_zone' in src:
        print(f, 'has is_transition_zone')
    if 'transitionZone' in src or 'Qw=' in src:
        print(f, 'has Qw-ish')

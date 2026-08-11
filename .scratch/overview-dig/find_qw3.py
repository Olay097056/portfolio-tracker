import re
src = open('chunk-7362-4aa258e42d947c01.js', encoding='utf-8', errors='ignore').read()

# find 'let r={...L6...},a={...Qw...},n={...Zt...},s=...,i=...'
# L6 ends at '},a={' ; Qw ends at '},n={' ; Zt ends at '},s=' or '};'
i_a = src.find('},a={')
print('=== Qw (phase map) ===')
print(src[i_a+2:i_a+700])
i_n = src.find('},n={')
print()
print('=== Zt (status map) ===')
print(src[i_n+2:i_n+500])
# color map for models
i_c = src.find('recovery-reflation":"#')
if i_c == -1:
    i_c = src.find('"#38bdf8"')
print()
print('=== model colors ===')
print(src[max(0,i_c-200):i_c+300])

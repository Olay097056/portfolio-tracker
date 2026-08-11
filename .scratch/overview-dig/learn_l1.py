import re

src = open('learn-page.js', encoding='utf-8', errors='ignore').read()

# module 28440 = lessons data — find l1
i = src.find('28440:(')
print('module 28440 at:', i)
if i != -1:
    seg = src[i:i+6000]
    print(seg[:5500])

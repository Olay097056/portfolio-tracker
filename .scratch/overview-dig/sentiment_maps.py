import re

src = open('sentiment-page.js', encoding='utf-8', errors='ignore').read()

# extract the h map (4 indicators) fully
i = src.find('h={euphoria')
if i == -1:
    i = src.find('let m=')
print(src[i:i+1500])

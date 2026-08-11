import re

src = open('chunk-8440-de27c4ca13e2c7f3.js', encoding='utf-8', errors='ignore').read()
i = src.find('28440:(')
seg = src[i:i+7000]
# prettify for reading
pretty = re.sub(r'([;{}])', r'\1\n', seg)
print(pretty[:6000])

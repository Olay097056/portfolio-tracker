import re

src = open('cme-module.js', encoding='utf-8', errors='ignore').read()

# find where the page loads its main data: search for macro_series .from(
i = src.find('.from("macro_series")')
while i != -1:
    print('=== .from("macro_series") at', i, '===')
    print(src[max(0, i-500):i+500])
    print()
    i = src.find('.from("macro_series")', i+1)
    if i > 20000:
        break

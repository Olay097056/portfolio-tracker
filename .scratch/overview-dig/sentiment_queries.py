import re

src = open('sentiment-page.js', encoding='utf-8', errors='ignore').read()

# find .from("index_hourly") and .from("retail_sentiment") contexts
for table in ['index_hourly', 'retail_sentiment']:
    i = src.find(f'.from("{table}")')
    while i != -1:
        print(f'=== {table} at {i} ===')
        print(src[max(0, i-350):i+350])
        print()
        i = src.find(f'.from("{table}")', i + 1)

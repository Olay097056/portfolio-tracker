import re

# LEARN page
src = open('learn-page.js', encoding='utf-8', errors='ignore').read()
print('=== LEARN ===')
# find lesson content — lessons hardcoded or from table?
i = src.find('lesson_progress')
print('lesson_progress ctx:', src[max(0,i-200):i+400])
print()
# reset_my_lessons rpc
j = src.find('reset_my_lessons')
print('rpc ctx:', src[max(0,j-150):j+250])
print()
# find lesson data structure (chapters)
k = src.find('บท ')
print('บท ctx:', src[max(0,k-200):k+300] if k != -1 else 'not found')

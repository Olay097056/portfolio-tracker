import re

src = open('settings-page.js', encoding='utf-8', errors='ignore').read()

# telegram-link edge fn call
i = src.find('telegram-link')
print('=== telegram-link ctx ===')
print(src[max(0, i-500):i+500])
print()
# admin-settings
j = src.find('admin-settings')
print('=== admin-settings ctx ===')
print(src[max(0, j-300):j+400])
print()
# telegram_links / user_profiles queries
for t in ['telegram_links', 'user_profiles']:
    k = src.find(f'.from("{t}")')
    print(f'=== {t} ===')
    if k != -1:
        print(src[max(0, k-250):k+400])
    else:
        print('(no direct .from query — via edge fn)')
    print()

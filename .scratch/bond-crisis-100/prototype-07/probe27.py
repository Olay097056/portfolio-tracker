"""Show the rest of module 23741 (LastTotals + ExchangeVol URLs)."""
src = open("volume_module.js", encoding="utf-8").read()
# find the function bodies after the exports
for fn in ["getVolumeLastTotals", "getVolumeExchangeVol"]:
    i = src.find(fn)
    print(f"--- {fn} ---")
    print(src[max(0, i-100):i+700])
    print()

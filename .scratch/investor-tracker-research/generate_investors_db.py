import json

with open("all_investors_dump.json", "r", encoding="utf-8") as f:
    items = json.load(f)

py_code = ["INVESTORS_DATABASE: list[InvestorProfile] = ["]

for idx, inv in enumerate(items):
    name = inv.get("name", "Investor").replace('"', '\\"')
    slug = inv.get("slug", f"investor-{idx}")
    fund = (inv.get("managedFund") or "Fund").replace('"', '\\"')
    perf = float(inv.get("performance", 0.0))
    val_usd = inv.get("portfolioValue", "1B")
    
    num_aum = 1000000000.0
    if "B" in val_usd:
        try: num_aum = float(val_usd.replace("B", "").replace("$", "")) * 1e9
        except: pass
    elif "M" in val_usd:
        try: num_aum = float(val_usd.replace("M", "").replace("$", "")) * 1e6
        except: pass

    desc = inv.get("description", "").replace('"', '\\"').replace('\n', ' ')
    avatar = inv.get("avatar", "")
    if avatar.startswith("/"):
        avatar = f"https://konbalongtun.sgp1.cdn.digitaloceanspaces.com/prod{avatar}"

    holdings_code = []
    for h_idx, h in enumerate(inv.get("holdings", [])):
        logo = h.get("logo", "")
        ticker = logo.split("/stock-logo/")[-1].replace(".svg", "").replace(".png", "") if "/stock-logo/" in logo else f"STK_{h_idx}"
        if not ticker:
            ticker = h.get("name", f"STK_{h_idx}").split()[0]
        
        h_name = h.get("name", ticker).replace('"', '\\"')
        h_pct = float(h.get("portfolioPercent") or 0.0)
        h_buy = float(h.get("avgBuyPrice") or 0.0)
        h_cur = float(h.get("currentPrice") or 0.0)
        h_gain = float(h.get("gainPercent") or 0.0)
        h_period = h.get("activityPeriod", "Q1 2026")
        h_text = h.get("activityText", "Held").replace('"', '\\"')
        h_logo = f"https://konbalongtun.sgp1.cdn.digitaloceanspaces.com/prod{logo}" if logo.startswith("/") else logo

        holdings_code.append(f"""            TopHolding(
                id="h_{idx}_{h_idx}",
                name="{h_name}",
                ticker="{ticker}",
                portfolio_percent={h_pct},
                avg_buy_price={h_buy},
                current_price={h_cur},
                gain_percent={h_gain},
                activity_period="{h_period}",
                activity_text="{h_text}",
                logo_url="{h_logo}",
            ),""")

    holdings_str = "\n".join(holdings_code)

    py_code.append(f"""    InvestorProfile(
        id="inv_{idx}",
        name="{name}",
        slug="{slug}",
        fund_name="{fund}",
        performance_1y_pct={perf},
        portfolio_value_usd="{val_usd}",
        portfolio_value_num={num_aum},
        description="{desc}",
        avatar_url="{avatar}",
        last_13f_filing="Q1 2026",
        data_provider="Official SEC EDGAR API",
        top_holdings=[
{holdings_str}
        ],
    ),""")

py_code.append("]")

with open("investors_db_snippet.py", "w", encoding="utf-8") as f:
    f.write("\n".join(py_code))

print("Generated investors_db_snippet.py with", len(items), "investors!")

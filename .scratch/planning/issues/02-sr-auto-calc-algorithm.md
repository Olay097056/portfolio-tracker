Type: research
Status: resolved

## Question

What algorithm should compute default support/resistance (S/R) levels automatically, since (unlike wethaiinvest.com) this app has no admin team curating them by hand?

Evaluate candidates such as pivot points, swing high/low detection, and moving-average bands. Recommend one (or a small combination) that works across the app's supported chart intervals (minute/day/week/month) and ranges (1D through 5Y), and describe how it hands off to the manual override the user can drag/edit on top of it.

## Answer

**Candidates considered:**
- **Classic (floor-trader) pivot points** — formula off the previous bar's OHLC. Good for intraday day-trading but produces a fixed handful of levels tied to one bar's timeframe; doesn't generalize well across 1D through 5Y ranges.
- **Moving-average bands** (e.g. Bollinger Bands) — already planned as a separate chart overlay (per the wethaiinvest reference UI); these move with price and aren't really discrete "lines," so they're a poor fit for the S/R lines specifically.
- **Swing high/low (fractal) detection + level clustering** — detect confirmed pivots (a bar whose high/low is more extreme than N bars on either side), then cluster nearby pivots within a small % tolerance into horizontal zones, ranking each zone's strength by how many times price touched/reacted to it.

**Recommendation: swing high/low detection + clustering**, because:
1. It's timeframe-agnostic — it runs on whatever OHLC bar series is currently loaded (minute/day/week/month), so the same algorithm produces sensible levels whether the user is on a 1D or 5Y range, without special-casing per interval.
2. It matches how the reference product visually presents S/R (a handful of horizontal lines the user reacts to), not a moving band.
3. It's simple enough to implement without ML or a paid indicator library — a standard N-bar fractal pivot detector (e.g. N=5) followed by a clustering pass (group pivots within ~1–2% of each other, keep the top few zones by touch count) is well-documented and cheap to compute server-side per ticker/interval.

**Auto → manual handoff:** on first load of a ticker/interval, the backend computes the clustered swing-based levels and returns them as the default `Freestyle` S/R lines. The frontend lets the user drag any line or add/remove lines (the "S"/"R"/"Freestyle" controls) — once touched, that ticker's lines are marked user-edited in the database and the auto-calculation is not re-applied on top of them; a "recompute defaults" action lets the user reset back to the algorithm's output if they want to discard manual edits.

Sources: [Support & Resistance Zones — TradingView](https://www.tradingview.com/script/Jen3WBZc-Support-Resistance-Zones-super-clean-advanced-2026-version/), [Automatic Support & Resistance — TradingView](https://www.tradingview.com/script/JXrNys5J-Automatic-Support-Resistance/), [Can You Automate Swing High/Low, Support, and Resistance Trading Strategies with Python?](https://trading-strategies.academy/archives/1261)

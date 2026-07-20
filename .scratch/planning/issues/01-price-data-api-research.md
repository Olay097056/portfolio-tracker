Type: research
Status: resolved

## Question

Which stock/ETF price data API should the app use for real-time (or near-real-time) and historical price data?

Compare at least yfinance, Alpha Vantage, Twelve Data, and Finnhub on: rate limits, reliability/uptime, terms-of-use restrictions for a personal (non-commercial) app, historical data depth (needs at least 5Y daily + intraday for 1D/5D/1M ranges per the chart's Range selector), and cost. Recommend one primary choice plus a fallback, and note any API-key setup steps required before implementation can start.

## Answer

**Comparison (2026):**

| API | Free tier limit | Historical depth | ToS for personal use | API key |
|---|---|---|---|---|
| yfinance | No official limit (unofficial — scrapes Yahoo endpoints); aggressive polling risks temporary IP blocking | Full daily history for years/decades; intraday depth varies by interval but generally covers the app's 1D/5D/1M needs | Gray area — Yahoo's terms discourage republishing, but personal/non-commercial single-user use is low-risk. Not guaranteed stable; breaks when Yahoo changes backend (fixes typically land within days upstream) | None needed |
| Alpha Vantage | ~25 requests/day, 5/min (free tier was cut from 500→100→25 over time) | Good depth, but the 25/day cap is impractical even for a single active user browsing several tickers/ranges | Standard developer ToS, fine for personal use | Free signup |
| Twelve Data | ~800 requests/day, 8/min | Daily/weekly/monthly data goes back to each symbol's listing date; intraday (1min–8h) typically covers several months to ~1 year | Standard developer ToS, explicitly allows personal use | Free signup |
| Finnhub | 60 requests/min (most generous per-minute limit), free WebSocket real-time trades | Free-tier historical candle access for US stocks has plan-dependent restrictions — needs a quick hands-on check during implementation, not confirmed from docs alone | Standard developer ToS | Free signup |

**Recommendation:**
- **Primary: yfinance** — free, no API key/signup step, best historical depth for daily/weekly charts (covers the 5Y range and beyond), and it's the path of least setup friction for a single-user local app. Accept the known tradeoff: it's unofficial, so it can silently break on Yahoo backend changes and should be wrapped with basic retry/backoff and response caching (don't re-fetch on every page load).
- **Fallback: Twelve Data** — official ToS-compliant API, free API key, 800 requests/day is comfortably enough for one user's portfolio + watchlist, and it's the fallback to switch to if yfinance breaks or gets IP-rate-limited. Sign up for a free API key before implementation starts; store it as an environment variable, never committed.
- **Not recommended**: Alpha Vantage (25/day is too tight even for one user checking a handful of tickers), Finnhub (attractive rate limit, but free-tier US stock candle access needs verifying hands-on before relying on it — revisit if Twelve Data proves insufficient).

Sources: [Best Free Stock Market APIs in 2026 (Tested)](https://thenextgennexus.com/2026/05/15/10-best-free-stock-market-apis-2026/), [I Tested 4 Free Stock Market APIs](https://orthogonal.info/i-tested-4-free-stock-market-apis-heres-which-one-actually-works-for-side-projects/), [Alpha Vantage API: The Complete 2026 Guide](https://alphalog.ai/blog/alphavantage-api-complete-guide), [Why yfinance Keeps Getting Blocked, and What to Use Instead](https://medium.com/@trading.dude/why-yfinance-keeps-getting-blocked-and-what-to-use-instead-92d84bb2cc01), [Twelve Data — Historical data](https://support.twelvedata.com/en/articles/5194454-historical-data)

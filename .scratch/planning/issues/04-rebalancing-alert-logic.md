Type: grilling
Blocked by: 03
Status: resolved

## Question

What exact rule triggers a rebalancing alert, and how is it surfaced?

Decide the deviation threshold between current % and target % that counts as "needs rebalancing" (e.g. the wethaiinvest.com screenshot showed current 29.15% vs. target 25.00% flagged in red), whether the threshold is fixed or user-configurable, and how it's shown in the UI (color-coded bar, badge, notification, etc).

## Answer

**Threshold**: absolute percentage-point deviation between current allocation % and `target_allocation_pct`, default **±5 pp**, user-configurable (a single global setting, not per-holding).

**Severity bands** on the existing current/target progress bar:
- Green — within ±5pp (default threshold)
- Yellow — deviation between 1× and 2× the threshold (e.g. 5–10pp at default)
- Red — deviation beyond 2× the threshold (e.g. >10pp at default)

**Surfacing**: no push notifications or popups (desktop app the user opens and checks, not a mobile app needing out-of-app alerts) — just the color-coded bar per holding, plus a dashboard-level summary badge/list ("N holdings need rebalancing") so the user sees the overview without drilling into each ticker.

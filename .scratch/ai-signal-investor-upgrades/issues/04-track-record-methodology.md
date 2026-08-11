Type: grilling
Status: closed (out of scope)

## Question

Design the AI track-record system: log every AI narrative call, later resolve whether it was right, show the tally. The "was it right" definition is already locked (see the map's Notes — same hit-target-before-stop definition the backtest engine uses), but the surrounding system needs real design before building it. Resolve, with the user, one at a time:

- **What gets logged, and where?** A new DB table (e.g. `ai_narrative_calls`: ticker, called_at, sentiment, the trading-setup snapshot at call time — entry/target/stop — and later a resolved outcome + resolved_at) is the obvious shape, but confirm: does every `POST /ai-narrative/analyze` call get logged, or only ones the user explicitly acts on somehow? (There's no "the user traded on this" signal today — logging every call is probably right, but say so explicitly rather than assume.)
- **When does resolution happen?** Options: (a) a background job that periodically re-checks all unresolved calls whose target/stop window (per the backtest's 60-trading-day expiry convention) has closed, (b) resolve lazily/on-demand when the user views the track record. (a) matches the existing backtest's own convention and gives a self-maintaining record; (b) avoids needing any scheduled job but means the record can go stale until someone looks.
- **What's shown, and where?** A simple tally ("AI เคยพูดถูก 8 จาก 12 ครั้ง") is the minimum bar — decide placement (own page? section of the dashboard? per-ticker or global?) and whether individual past calls are browsable/auditable (which specific calls were right/wrong) or just the aggregate number.
- **Cold-start**: the log starts empty today. Decide what the UI shows before there's enough resolved history to be meaningful (a handful of calls isn't a real track record yet) — an explicit "ยังสะสมข้อมูลไม่พอ" state, not a misleading 1/1 = 100%.

## Answer

Ruled out of scope — the user decided against pursuing this after the ticket's scope was explained back to them (logging every AI call, resolving outcomes later, showing a tally). Not resolved as a design decision; closed without a methodology.


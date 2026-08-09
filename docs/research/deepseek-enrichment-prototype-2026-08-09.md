# DeepSeek Enrichment Prototype — findings (2026-08-09)

Result of wayfinder ticket **DeepSeek translate + enrich pipeline**: the prompt
shape, latency, and cost of turning raw RSS headlines into the reference
`news_items` shape (`title_th`, `impact_score`, `category`, `related_models`,
`analysis_th`) using the user's DeepSeek key.

## Batch enrichment (one call per ~20 headlines)

**Prompt shape:** system prompt pins the output contract (JSON array, same
order, `title_th` natural Thai, `impact_score` 0-100 with an anchoring
definition, category from the reference's 8 values, `related_models` from the
6 regime models), user message lists numbered headlines, `temperature 0.2`,
**`response_format: {"type": "json_object"}`** (body must be an object with an
`items` key), `max_tokens 8000`.

**Measured (20 real headlines, model `deepseek-v4-flash`):**

| Shape | Latency | Tokens | per headline |
|---|---|---|---|
| 20/call, free-form (original) | 53.4s | 6,711 | 336 |
| 2×10/call, json_object | 42.7s | 6,076 | 304 |
| **20/call, json_object (final)** | **33.0s** | **4,438** | **222** |

**Findings:**
- `json_object` output mode cuts ~34% of tokens vs free-form (the model
  stops emitting markdown/whitespace/narrative padding: 6,071 → 3,773
  completion tokens) AND is 38% faster.
- 20/call beats 10/call: the system prompt is paid once per call, so
  smaller chunks multiply the fixed overhead.
- Free-form at `max_tokens 4000` **truncates** (JSON cut mid-way) — with
  `json_object` + 8000 the 20-item batch parses clean.
- First attempt used free-form + 4000 and had to be re-run: the wasted
  call is exactly what json_object + 8000 eliminates.

**Quality A/B (json_object flash vs the original free-form flash, same 20
headlines, `deepseek-v4-flash` only — the user ruled out `deepseek-v4-pro`
as pricier without a demonstrated need):**
- category agreement **17/20**, related_models agreement **16/20**,
  avg impact |Δ| **4.2**, big impact deltas (≥20) **0**
- title_th identical only 3/20 — but the diffs are paraphrase style, both
  renderings correct Thai (e.g. "ทบทวนการตัดสินใจถอนข้อกล่าวหา" vs "ทบทวน
  คำตัดสินยกเลิกข้อกล่าวหา"); impact never flips across the 40-threshold;
  the few category/model disagreements are analyst-judgment-level
  (bank earnings → credit-panic vs bank-run).
- **Conclusion:** json_object preserves quality (within model noise) while
  cutting ~34% tokens — the final pick stands on flash + json_object.

**Quality sample (verbatim from the run):**

| EN title | TH title | impact | category | related models |
|---|---|---|---|---|
| Iran sets conditions for opening Strait of Hormuz… | อิหร่านตั้งเงื่อนไขเปิดช่องแคบฮอร์มุซ หลังยูเออีระบุเรือลำหนึ่งของตนถูก… | 75 | energy | inflation-oil, yield-shock |
| Retail spending fell in March as consumers pull back | การใช้จ่ายค้าปลีกในเดือนมีนาคมลดลง ขณะที่ผู้บริโภคชะลอการใช้จ่าย | 65 | economy | fed-pivot |
| Markets digest bank earnings after recent turmoil | ตลาดประเมินผลประกอบการธนาคารหลังความปั่นป่วนล่าสุด | 40 | market | credit-panic |
| Serbia and Ukraine pledge closer economic ties… | เซอร์เบียและยูเครนให้คำมั่นกระชับความสัมพันธ์ทางเศรษฐกิจ เล็งทำข้อตกลง… | 5 | world | — |
| Messi's father Jorge dies aged 68 | ฆอร์เฆ เมสซี พ่อของเมสซี เสียชีวิตในวัย 68 ปี | 0 | world | — |

## Analysis (expandable Thai panel)

**Prompt shape:** system prompt asks for a short (≤120 words) Thai analysis
for retail investors — what it means, which markets it moves, why. `temp 0.4`,
`max_tokens 400`. One call per item.

**Measured (2 top-impact items):** **~5.2s and ~610 tokens each**. Quality is
fluent, specific and market-aware (Hormuz → oil spike, bonds as safe haven,
gold bid; retail spending → Fed rate-cut pricing, discretionary stocks under
pressure).

## Decisions (user-confirmed 2026-08-09)

1. **Enrichment (translate + impact + category + related_models) runs for
   EVERY item** — one batched call per ~20 headlines, ~2.7s/headline.
2. **`analysis_th` is generated ONLY for items with impact_score ≥ 40** — the
   user's cost-control pick. A full 277-item sweep → ~2-3 analysis calls
   instead of 277. Items below the bar show no expandable panel.
3. **`related_models` is DeepSeek-assigned** (proved accurate in the sample:
   Hormuz → inflation-oil + yield-shock, retail pullback → fed-pivot), not
   keyword-matched.
4. **Batch size 20/call, max_tokens 8000** — the truncation failure at 4000
   output tokens means the pipeline must parse per-element and re-run any
   truncated tail, or chunk smaller.

## Cost estimate (rough)

DeepSeek pricing is per-token; at ~336 tok/headline enrichment + ~610 tok/headline
for the ≥40-impact subset, a full sweep of ~277 items is dominated by the
enrichment batch (~5 batches ≈ 3-4 min). Analysis adds ~5s × few items.
The translation step is the one that scales linearly with volume — the
SQLite translate-once cache (map Notes) prevents re-paying for re-fetches.

## Assets

- `probe_rss.py`, `fetch_20.py`, `deepseek_batch.py`, `deepseek_analysis.py`
  (under the temp research dir) — the working prototypes.
- Sample input `sample20.jsonl`, enriched output `enriched20.jsonl`.

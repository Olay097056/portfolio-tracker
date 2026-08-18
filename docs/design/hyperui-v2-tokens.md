# HyperUI v2 — portfolio-tracker design system & token spec

**Source of truth:** [hyperui.dev](https://hyperui.dev) (MIT component
library, Tailwind CSS v4). This project adopts HyperUI as its governing
**design language** (light-first gray + semantic tokens + flat surfaces),
translated onto this repo's own stack (vanilla CSS + inline-style React — **no
Tailwind**). This is the port of the canonical spec first written for
`switch-wr-tool` (`docs/design/hyperui-v2-tokens.md`).

Applied: 2026-08-18. Portfolio-tracker defaults to **light**; dark is a
first-class HyperUI-gray variant switched by `<html data-theme>`.

## 1. Design principles

1. **Light-first** — gray-50 page, white cards, gray hairline borders,
   `shadow-sm` elevation. Flat, restrained; **no glassmorphism / glow /
   neon / gradient fads** (retired from the old navy "ambient" theme).
2. **Semantic token names kept stable** — this app's components reference
   `--bg / --panel / --border / --primary / --text / --green/--red/--yellow`
   (and `--text-muted/--text-dim/--card-bg`) inline in hundreds of places.
   The redesign **re-valued the same names** (light `:root` + dark override)
   instead of renaming, so those refs flip automatically.
3. **Status via soft-bg + strong text** — badges/pills use `--*-soft`
   background + `--*-text` color; color is never the only signal (text/icon
   added).
4. **Surfaces are theme-defined, chromatic status colors are fixed** —
   `bg/panel/border/text` resolve via CSS vars per theme, but semantic colors
   (`emerald/red/amber/sky/violet`) stay fixed hex so P&L/severity red/green
   read identically in both modes and unit tests asserting exact
   `rgb(...)`/hex keep passing.
5. **Font is brand-owned** — Outfit (display) / Inter / Noto Sans Thai.

## 2. Token table (shipped)

**Primary = sky-blue** `#0284c7` light / `#38bdf8` dark (project identity).

| Token | LIGHT | DARK (HyperUI gray) |
|---|---|---|
| `--bg` (page) | `#f9fafb` gray-50 | `#0f172a` slate-900 |
| `--panel` / `--card-bg` | `#ffffff` | `#1e293b` slate-800 |
| `--panel2` (raised) | `#f9fafb` | `#16213a` |
| `--panel3` (hover/inset) | `#f3f4f6` gray-100 | `#273449` |
| `--border` | `rgba(15,23,42,.10)` | `rgba(148,163,184,.18)` |
| `--text` | `#0f172a` | `#f1f5f9` |
| `--text-muted` | `#64748b` slate-500 | `#94a3b8` slate-400 |
| `--text-dim` | `#94a3b8` | `#64748b` |
| `--primary` | `#0284c7` | `#38bdf8` |
| `--primary-soft`/`--blue-soft` | `#e0f2fe` / `#0c4a6e` | `#0c4a6e` / `#bae6fd` |
| `--green` / `--red` / `--yellow` | `#16a34a` / `#dc2626` / `#d97706` | `#34d399` / `#f87171` / `#fbbf24` |
| `--green-soft/text` | `#dcfce7` / `#15803d` | `#14532d` / `#bbf7d0` |
| `--red-soft/text` | `#fee2e2` / `#b91c1c` | `#7f1d1d` / `#fecaca` |
| radius | xs 2 · sm 4 · md 6 · lg 8 · xl 12 · full 999 px | same |

## 3. Theme mechanism

- **DOM:** `<html data-theme="light|dark">`; `:root {}` = light,
  `[data-theme='dark'] {}` overrides.
- **Bridge:** `frontend/src/utils/theme.ts` — storage key **`pt_theme`**,
  cookie `theme` (1y), read order localStorage → cookie → light.
- **No-FOUC:** inline `<script>` in `index.html` sets `dataset.theme` before
  first paint.
- **Toggle:** `ThemeToggle.tsx` (sun/moon) mounted in the App header.
- `:focus-visible` uses the primary color; toggle has aria-label/title.

## 4. Component recipes (HyperUI → this app)

| Surface | Recipe |
|---|---|
| `.card` | white `--card-bg`, 1px `--border`, radius 12, `--card-shadow` (flat) |
| `.glass-panel` / `.glass-stat-card` | renamed-but-kept classes now render **flat** `--card-bg` + border (glass retired) |
| button | `--panel` bg, `--border`, radius 8; primary = `--primary` white text |
| badge / chip | `--*-soft` bg + `--*-text`, radius-full |
| table | thead uppercase muted, rows divide `--border`, hover `--panel3` |
| `.nh-*` (New Holdings) | card grid follows theme (light + dark) |
| `.ticker-ac-*` | autocomplete dropdown follows theme |

## 5. Retired (superseded)

- Navy "ambient" dark-only theme: `--bg #0b0f19`, glass panels (`rgba(17,24,39,…)`
  + `backdrop-filter: blur`), glow (`--*-glow` box-shadows), gradient h1/buttons.
- Per-component hardcoded `#0d1220 / #101623 / #131a2b / #1e2940` ink palettes →
  now `var(--bg)/--panel/--border/--card-bg` (surfaces) while status colors
  (`#34d399/#f87171/#fbbf24/#38bdf8`) stay fixed chromatic for tests.

## 6. Porting to another project

See the canonical switch-wr spec port steps. Key insight learned here: in a
React app with per-file palettes, split **surfaces** (map to theme CSS vars)
from **semantic color keys** (keep fixed hex) so theme switching works without
breaking color-assert unit tests.

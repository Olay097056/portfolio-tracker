// frontend/src/components/TickerAutocomplete.tsx
import { useEffect, useRef, useState } from 'react';
import { searchStocks } from '../api/client';
import type { StockSearchResult } from '../api/types';

const DEBOUNCE_MS = 250;

interface TickerAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  // Fired when the user picks a suggestion (click or Enter). The input's own value is
  // NOT changed here -- callers decide what "selecting a ticker" means for their field
  // (populate + auto-fill data, filter a list, submit immediately, ...) via onChange.
  onSelect?: (item: StockSearchResult) => void;
  placeholder?: string;
  // 'dark' matches the app's own theme (reuses the existing .badge.badge-blue chip);
  // 'light' is for the New Holdings card grid, which is deliberately styled to match
  // konbalongtun.com's own light theme rather than the rest of this app.
  theme?: 'dark' | 'light';
  className?: string;
  style?: React.CSSProperties;
  // Style for the outer wrapper div, not the <input> itself -- needed when this component
  // sits inside a flex row and must grow/shrink like the plain <input> it replaced (e.g.
  // { flexGrow: 1 }). Merged with the wrapper's own required `position: relative`.
  wrapperStyle?: React.CSSProperties;
  autoFocus?: boolean;
  required?: boolean;
  'aria-label'?: string;
  // Override where suggestions come from. Defaults to this app's own stock universe
  // (/api/screener/search). The Stock Comparison tool passes konbalongtun's autocomplete
  // instead, because only symbols in that upstream's collection can actually be compared --
  // same dropdown look and keyboard behaviour, different source of truth.
  searchFn?: (query: string) => Promise<StockSearchResult[]>;
  // Cleared automatically after a suggestion is picked -- for pickers that add to a list
  // (the compare tool's "add a stock" box) rather than ones that keep the chosen value.
  clearOnSelect?: boolean;
}

// Shared "type a ticker, see a dropdown of {badge: SYMBOL} {name}" suggestion list, used
// by every ticker-entry field across the app (Add Holding, Watchlist, DCA/Passive Income
// calculators, Dashboard symbol search, Investor Tracker's two search bars, Batch
// Transaction, Stock Screener) -- backed by GET /api/screener/search so every field draws
// from the same real stock universe instead of each reimplementing its own matching.
export function TickerAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder,
  theme = 'dark',
  className,
  style,
  wrapperStyle,
  autoFocus,
  required,
  'aria-label': ariaLabel,
  searchFn,
  clearOnSelect,
}: TickerAutocompleteProps) {
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref, not an effect dependency: callers routinely pass an inline arrow, whose
  // identity changes every render -- depending on it directly would refetch in a loop.
  const searchFnRef = useRef(searchFn);
  searchFnRef.current = searchFn;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = value.trim();
    if (!query) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const run = searchFnRef.current ?? searchStocks;
      run(query)
        .then((data) => {
          setResults(data);
          setActiveIndex(-1);
        })
        .catch(() => setResults([]));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function pick(item: StockSearchResult) {
    onSelect?.(item);
    if (clearOnSelect) onChange('');
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < results.length) {
        e.preventDefault();
        pick(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showDropdown = open && results.length > 0;
  const badgeClass = theme === 'light' ? 'ticker-ac-badge-light' : 'badge badge-blue';

  return (
    <div ref={wrapperRef} className="ticker-ac-wrap" style={{ position: 'relative', ...wrapperStyle }}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        aria-label={ariaLabel}
        autoComplete="off"
        className={className}
        style={style}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && (
        <div className={`ticker-ac-dropdown${theme === 'light' ? ' light' : ''}`} role="listbox">
          {results.map((item, idx) => (
            <button
              key={item.symbol}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              className={`ticker-ac-row${idx === activeIndex ? ' active' : ''}`}
              onMouseDown={(e) => {
                // onMouseDown (not onClick) fires before the input's blur/click-outside
                // handler would otherwise close the dropdown out from under the click.
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className={badgeClass}>{item.symbol}</span>
              <span className="ticker-ac-name">{item.company_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

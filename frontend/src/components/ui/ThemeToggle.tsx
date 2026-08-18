import { useState } from 'react';
import { getInitialTheme, toggleTheme } from '../../utils/theme';
import type { Theme } from '../../utils/theme';

// HyperUI light/dark toggle (portfolio-tracker redesign).
// No icon library — inline SVGs to match the rest of the app.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const handleToggle = () => {
    const next = toggleTheme(theme);
    setTheme(next);
  };

  const isDark = theme === 'dark';

  return (
    <button
      className="theme-toggle-btn"
      onClick={handleToggle}
      title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
    >
      {isDark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

// Theme bridge — HyperUI light/dark (portfolio-tracker redesign).
// Single source for the SPA side of the theme contract:
//   DOM:    <html data-theme="light|dark">   (CSS: :root = light, [data-theme='dark'] = dark)
//   Store:  localStorage 'pt_theme' (SPA priority)
//   Cookie: theme=light|dark (path=/; 1y)
// Read order: localStorage -> cookie -> light
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pt_theme';
export const THEME_COOKIE_NAME = 'theme';

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    const cookie = readCookie(THEME_COOKIE_NAME);
    if (cookie === 'light' || cookie === 'dark') return cookie;
  } catch {
    // storage unavailable — fall through to default
  }
  return 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode / disabled storage — cookie still written below
  }
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function toggleTheme(current: Theme): Theme {
  const next: Theme = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}

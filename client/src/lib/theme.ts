/**
 * Theme helpers — applied via the `data-theme` attribute on <html>, read at boot
 * by main.tsx before React renders (so there's no flash of the wrong theme).
 *
 * E-ink mode is a per-user, frontend-only preference. When on it wins over the
 * normal light/dark theme and applies `data-theme="eink"` (a black-on-white,
 * animation-free, grayscale palette tuned for e-paper screens).
 */

export type Theme = 'dark' | 'light' | 'eink'

export const THEME_KEY = 'letsgetbuff-theme'
export const EINK_KEY = 'letsgetbuff-eink-mode'

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function getEink(): boolean {
  return localStorage.getItem(EINK_KEY) === '1'
}

export function setEink(on: boolean): void {
  localStorage.setItem(EINK_KEY, on ? '1' : '0')
}

/** The normal (non-eink) theme the user last chose. */
export function savedTheme(): Theme {
  const t = localStorage.getItem(THEME_KEY) as Theme | null
  return t === 'light' || t === 'dark' ? t : 'dark'
}

/** Apply the effective theme at boot — e-ink wins, else the saved light/dark theme. */
export function initTheme(): void {
  applyTheme(getEink() ? 'eink' : savedTheme())
}

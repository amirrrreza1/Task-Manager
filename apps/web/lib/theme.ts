export const DEFAULT_THEME_STORAGE_KEY = 'theme';
export const DEFAULT_THEMES = ['light', 'dark'];

export function resolveTheme(
  theme: string,
  systemTheme: 'dark' | 'light',
  enableSystem = true,
): string {
  if (enableSystem && theme === 'system') {
    return systemTheme;
  }
  return theme;
}

export function getThemeScriptCode(
  storageKey = DEFAULT_THEME_STORAGE_KEY,
  defaultTheme = 'system',
  enableSystem = true,
  enableColorScheme = true,
  themes = DEFAULT_THEMES,
): string {
  return `(function() {
  try {
    var stored = localStorage.getItem(${JSON.stringify(storageKey)}) || ${JSON.stringify(defaultTheme)};
    var isDark = ${enableSystem} && stored === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : stored === 'dark';
    var resolved = isDark ? 'dark' : 'light';
    var el = document.documentElement;
    var themes = ${JSON.stringify(themes)};
    for (var i = 0; i < themes.length; i++) {
      el.classList.remove(themes[i]);
    }
    el.classList.add(resolved);
    if (${enableColorScheme}) {
      el.style.colorScheme = resolved;
    }
  } catch (e) {}
})();`;
}

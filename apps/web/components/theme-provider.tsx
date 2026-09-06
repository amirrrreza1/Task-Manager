'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import {
  DEFAULT_THEME_STORAGE_KEY,
  DEFAULT_THEMES,
  getThemeScriptCode,
  resolveTheme,
} from '../lib/theme';

export interface ThemeContextValue {
  theme: string | undefined;
  setTheme: (value: string | ((prev: string) => string)) => void;
  resolvedTheme: string | undefined;
  systemTheme: 'light' | 'dark' | undefined;
  themes: string[];
  forcedTheme: string | undefined;
  mounted: boolean;
}

const defaultContext: ThemeContextValue = {
  theme: undefined,
  setTheme: () => {},
  resolvedTheme: undefined,
  systemTheme: undefined,
  themes: DEFAULT_THEMES,
  forcedTheme: undefined,
  mounted: false,
};

const ThemeContext = createContext<ThemeContextValue>(defaultContext);

export interface ThemeProviderProps {
  children?: ReactNode;
  themes?: string[];
  forcedTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  storageKey?: string;
  defaultTheme?: string;
}

function disableAnimation() {
  const css = document.createElement('style');
  css.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}',
    ),
  );
  document.head.appendChild(css);
  return () => {
    (() => window.getComputedStyle(document.body))();
    setTimeout(() => {
      document.head.removeChild(css);
    }, 1);
  };
}

function getStoredTheme(storageKey: string, defaultTheme: string): string {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    return localStorage.getItem(storageKey) || defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDocument(
  resolved: string,
  themes: string[],
  enableColorScheme: boolean,
  disableTransition: boolean,
) {
  if (typeof document === 'undefined') return;
  const enable = disableTransition ? disableAnimation() : null;
  const el = document.documentElement;
  for (const t of themes) {
    el.classList.remove(t);
  }
  el.classList.add(resolved);
  if (enableColorScheme && (resolved === 'dark' || resolved === 'light')) {
    el.style.colorScheme = resolved;
  }
  enable?.();
}

export function ThemeScript({
  storageKey = DEFAULT_THEME_STORAGE_KEY,
  defaultTheme = 'system',
  enableSystem = true,
  enableColorScheme = true,
  themes = DEFAULT_THEMES,
}: {
  storageKey?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
  enableColorScheme?: boolean;
  themes?: string[];
}) {
  useServerInsertedHTML(() => (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: getThemeScriptCode(
          storageKey,
          defaultTheme,
          enableSystem,
          enableColorScheme,
          themes,
        ),
      }}
    />
  ));

  return null;
}

export function ThemeProvider({
  children,
  themes = DEFAULT_THEMES,
  forcedTheme,
  enableSystem = true,
  disableTransitionOnChange = false,
  enableColorScheme = true,
  storageKey = DEFAULT_THEME_STORAGE_KEY,
  defaultTheme = 'system',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<string>(() => getStoredTheme(storageKey, defaultTheme));
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => getSystemTheme());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setThemeState(getStoredTheme(storageKey, defaultTheme));
    setSystemTheme(getSystemTheme());

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) {
        setThemeState(event.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [storageKey, defaultTheme]);

  const activeTheme = forcedTheme ?? theme;
  const resolvedTheme = forcedTheme ?? resolveTheme(activeTheme, systemTheme, enableSystem);

  useEffect(() => {
    applyThemeToDocument(
      resolvedTheme,
      themes,
      enableColorScheme,
      disableTransitionOnChange && mounted,
    );
  }, [resolvedTheme, themes, enableColorScheme, disableTransitionOnChange, mounted]);

  const setTheme = useCallback(
    (value: string | ((prev: string) => string)) => {
      setThemeState((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          // ignore localStorage errors
        }
        return next;
      });
    },
    [storageKey],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      systemTheme,
      themes: enableSystem ? [...themes, 'system'] : themes,
      forcedTheme,
      mounted,
    }),
    [theme, setTheme, resolvedTheme, systemTheme, themes, enableSystem, forcedTheme, mounted],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ThemeScript
        storageKey={storageKey}
        defaultTheme={defaultTheme}
        enableSystem={enableSystem}
        enableColorScheme={enableColorScheme}
        themes={themes}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

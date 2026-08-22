'use client';

import { MoonStars, SunHigh } from '@appica/icons-react';
import { Button } from '@appica/ui-react/button';
import { useTheme } from '@appica/ui-react/hooks/use-theme';

export function ThemeToggle({ label }: { label?: string }) {
  const { mounted, resolvedTheme, setTheme } = useTheme();
  const dark = mounted && resolvedTheme === 'dark';
  const nextTheme = dark ? 'light' : 'dark';
  const icon = mounted ? (
    dark ? (
      <SunHigh aria-hidden="true" />
    ) : (
      <MoonStars aria-hidden="true" />
    )
  ) : null;

  if (label) {
    return (
      <button
        aria-checked={dark}
        aria-label={`${label}: ${dark ? 'dark' : 'light'} mode`}
        className="profile-menu-row"
        disabled={!mounted}
        role="switch"
        title={`Switch to ${nextTheme} theme`}
        type="button"
        onClick={() => {
          if (mounted) setTheme(nextTheme);
        }}
      >
        <span>{label}</span>
        <span className={`theme-switch ${dark ? 'is-dark' : 'is-light'}`} aria-hidden="true">
          <span className="theme-switch-thumb" />
          <SunHigh className="theme-switch-sun" />
          <MoonStars className="theme-switch-moon" />
        </span>
      </button>
    );
  }

  if (!mounted) {
    return (
      <Button
        aria-label="Toggle color theme"
        size="icon-sm"
        title="Toggle color theme"
        variant="ghost"
      />
    );
  }

  return (
    <Button
      aria-label={`Switch to ${nextTheme} theme`}
      size="icon-sm"
      title={`Switch to ${nextTheme} theme`}
      variant="ghost"
      onClick={() => setTheme(nextTheme)}
    >
      {icon}
    </Button>
  );
}

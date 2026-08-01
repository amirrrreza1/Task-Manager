'use client';

import { MoonStars, SunHigh } from '@appica/icons-react';
import { Button } from '@appica/ui-react/button';
import { useTheme } from '@appica/ui-react/hooks/use-theme';

export function ThemeToggle() {
  const { mounted, resolvedTheme, setTheme } = useTheme();

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

  const dark = resolvedTheme === 'dark';

  return (
    <Button
      aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
      size="icon-sm"
      title={`Switch to ${dark ? 'light' : 'dark'} theme`}
      variant="ghost"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <SunHigh aria-hidden="true" /> : <MoonStars aria-hidden="true" />}
    </Button>
  );
}

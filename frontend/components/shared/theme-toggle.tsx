'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  ThemeToggleButton,
  useThemeTransition,
} from '@/components/ui/shadcn-io/theme-toggle-button';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { startTransition } = useThemeTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const handleToggle = () => {
    startTransition(() => {
      setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
    });
  };

  return (
    <ThemeToggleButton
      theme={resolvedTheme as 'light' | 'dark'}
      variant="circle"
      start="center"
      onClick={handleToggle}
    />
  );
}

'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from './theme-provider';
import { AuthProvider } from './auth-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette, KeyboardShortcutsProvider } from '@/components/navigation';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <KeyboardShortcutsProvider>
            {children}
            <CommandPalette />
            <Toaster position="bottom-right" richColors closeButton />
          </KeyboardShortcutsProvider>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export { PagesProvider, usePages } from './pages-provider';

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

type KeySequence = string[];
type ShortcutHandler = () => void;

interface Shortcut {
  keys: string[];
  handler: ShortcutHandler;
  description: string;
}

/**
 * Hook for handling global keyboard shortcuts
 * Supports single keys, modifier combinations, and key sequences (vim-style)
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const sequenceRef = useRef<string[]>([]);
  const sequenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear sequence after delay
  const clearSequence = useCallback(() => {
    sequenceRef.current = [];
  }, []);

  // Shortcuts configuration
  const shortcuts: Shortcut[] = [
    // Navigation sequences (G + key)
    { keys: ['g', 'h'], handler: () => router.push('/'), description: 'Go Home' },
    { keys: ['g', 'd'], handler: () => router.push('/dashboard'), description: 'Go Dashboard' },
    { keys: ['g', 'q'], handler: () => router.push('/onboarding'), description: 'Go Quick Start' },

    // Actions
    {
      keys: ['t'],
      handler: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      description: 'Toggle Theme',
    },
    {
      keys: ['n'],
      handler: () => {
        router.push('/dashboard');
        setTimeout(() => {
          const input = document.querySelector('input[placeholder*="project"]') as HTMLInputElement;
          if (input) input.focus();
        }, 500);
      },
      description: 'New Project',
    },
    {
      keys: ['?'],
      handler: () => {
        // Show shortcuts help
        alert(
          `Keyboard Shortcuts:

Navigation:
  G H - Go Home
  G D - Go Dashboard
  G Q - Quick Start

Actions:
  ⌘K  - Command Palette
  N   - New Project
  T   - Toggle Theme
  ?   - Show Shortcuts

In Project:
  B   - Board View
  P   - Pages View
  Esc - Close Panels`
        );
      },
      description: 'Show Shortcuts',
    },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs
        if (e.key !== 'Escape') return;
      }

      // Handle modifier shortcuts (⌘K handled by command-palette)
      if (e.metaKey || e.ctrlKey) return;

      // Clear timeout and extend sequence window
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }

      // Add key to sequence
      const key = e.key.toLowerCase();
      sequenceRef.current.push(key);

      // Check for matching shortcuts
      for (const shortcut of shortcuts) {
        const sequence = sequenceRef.current;
        const keys = shortcut.keys;

        // Check if sequence matches shortcut
        if (sequence.length >= keys.length) {
          const recentKeys = sequence.slice(-keys.length);
          if (keys.every((k, i) => k === recentKeys[i])) {
            e.preventDefault();
            shortcut.handler();
            clearSequence();
            return;
          }
        }
      }

      // Clear sequence after 1 second of no input
      sequenceTimeoutRef.current = setTimeout(clearSequence, 1000);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, [router, theme, setTheme, shortcuts, clearSequence]);

  return { shortcuts };
}

/**
 * Component that enables keyboard shortcuts globally
 * Include once in your app layout
 */
export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useKeyboardShortcuts();
  return <>{children}</>;
}

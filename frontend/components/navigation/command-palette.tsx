'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Home,
  LayoutDashboard,
  FolderKanban,
  FileText,
  Settings,
  Plus,
  Search,
  Moon,
  Sun,
  LogOut,
  Sparkles,
  Github,
  Keyboard,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from 'next-themes';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Global keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Fetch projects when opening
  useEffect(() => {
    if (open && isAuthenticated && projects.length === 0) {
      setLoading(true);
      api
        .getProjects()
        .then((data) => setProjects(data.projects || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, isAuthenticated]);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    []
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push('/'))}>
            <Home className="mr-2 h-4 w-4" />
            <span>Home</span>
            <CommandShortcut>G H</CommandShortcut>
          </CommandItem>
          {isAuthenticated && (
            <CommandItem onSelect={() => runCommand(() => router.push('/dashboard'))}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
              <CommandShortcut>G D</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => router.push('/onboarding'))}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Quick Start</span>
            <CommandShortcut>G Q</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Projects (if authenticated) */}
        {isAuthenticated && projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Projects">
              {projects.slice(0, 5).map((project) => (
                <CommandItem
                  key={project.id}
                  onSelect={() =>
                    runCommand(() => router.push(`/project/${project.id}`))
                  }
                >
                  <FolderKanban className="mr-2 h-4 w-4" />
                  <span>{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Actions */}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {isAuthenticated && (
            <CommandItem
              onSelect={() =>
                runCommand(() => {
                  // Focus new project input on dashboard
                  router.push('/dashboard');
                  setTimeout(() => {
                    const input = document.querySelector('input[placeholder*="project"]');
                    if (input) (input as HTMLInputElement).focus();
                  }, 500);
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              <span>New Project</span>
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem
            onSelect={() =>
              runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))
            }
          >
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            <span>Toggle Theme</span>
            <CommandShortcut>T</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Help */}
        <CommandSeparator />
        <CommandGroup heading="Help">
          <CommandItem
            onSelect={() => runCommand(() => window.open('https://github.com', '_blank'))}
          >
            <Github className="mr-2 h-4 w-4" />
            <span>GitHub</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => alert('Keyboard shortcuts:\n\n⌘K - Command palette\n⌘/ - Help\nG H - Go home\nG D - Dashboard\nN - New project\nT - Toggle theme'))}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <CommandShortcut>⌘/</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Account */}
        {isAuthenticated && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Account">
              <CommandItem
                onSelect={() =>
                  runCommand(async () => {
                    await logout();
                    router.push('/');
                  })
                }
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

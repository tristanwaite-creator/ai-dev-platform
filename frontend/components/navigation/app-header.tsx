'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { UserMenu } from './user-menu';
import { BreadcrumbsCompact } from './breadcrumbs';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Search,
  ArrowLeft,
  LayoutDashboard,
  Command,
} from 'lucide-react';
import { MainNav } from './main-nav';

interface AppHeaderProps {
  title?: string;
  projectName?: string;
  showBack?: boolean;
  backHref?: string;
  children?: React.ReactNode;
  className?: string;
}

export function AppHeader({
  title,
  projectName,
  showBack,
  backHref = '/dashboard',
  children,
  className,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  // Open command palette
  const openCommandPalette = useCallback(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      })
    );
  }, []);

  // Determine if we're on a simple page (login/onboarding)
  const isSimplePage = pathname === '/' || pathname === '/onboarding';

  if (isSimplePage) {
    return (
      <header
        className={cn(
          'flex items-center justify-between px-6 py-4',
          className
        )}
      >
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">AI Dev</span>
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {children}
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
    >
      {/* Left side: Logo + Navigation */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold hidden lg:inline">AI Dev</span>
        </Link>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Main Navigation */}
        <MainNav className="hidden sm:flex" />

        {/* Back button for project pages */}
        {showBack && (
          <>
            <div className="h-6 w-px bg-border" />
            <Button variant="ghost" size="sm" asChild>
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
          </>
        )}

        {/* Breadcrumbs or Title */}
        {projectName ? (
          <>
            <div className="h-6 w-px bg-border hidden md:block" />
            <BreadcrumbsCompact projectName={projectName} />
          </>
        ) : title ? (
          <>
            <div className="h-6 w-px bg-border hidden sm:block" />
            <h1 className="text-lg font-semibold">{title}</h1>
          </>
        ) : null}

        {/* Page-specific content */}
        {children}
      </div>

      {/* Right side: Search + User */}
      <div className="flex items-center gap-2">
        {/* Command Palette Trigger */}
        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 w-64 justify-start text-sm text-muted-foreground md:flex"
          onClick={openCommandPalette}
        >
          <Search className="mr-2 h-4 w-4" />
          <span>Search...</span>
          <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        {/* Mobile search button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={openCommandPalette}
        >
          <Search className="h-4 w-4" />
        </Button>

        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}


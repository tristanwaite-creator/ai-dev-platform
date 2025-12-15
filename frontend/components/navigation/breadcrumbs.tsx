'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home, LayoutDashboard, FolderKanban, FileText, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
  projectName?: string;
}

// Route to breadcrumb mapping
const routeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  '/': { label: 'Home', icon: <Home className="h-4 w-4" /> },
  '/dashboard': { label: 'Projects', icon: <LayoutDashboard className="h-4 w-4" /> },
  '/onboarding': { label: 'Quick Start', icon: <Sparkles className="h-4 w-4" /> },
  '/project': { label: 'Project', icon: <FolderKanban className="h-4 w-4" /> },
};

export function Breadcrumbs({ items, className, projectName }: BreadcrumbsProps) {
  const pathname = usePathname();

  // Auto-generate breadcrumbs from pathname if not provided
  const breadcrumbs: BreadcrumbItem[] = items || generateBreadcrumbs(pathname, projectName);

  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center', className)}>
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((item, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <li aria-hidden="true">
                <ChevronRight className="h-4 w-4" />
              </li>
            )}
            <li>
              {item.href && index < breadcrumbs.length - 1 ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 text-foreground font-medium">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

function generateBreadcrumbs(pathname: string, projectName?: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  // Always start with dashboard for authenticated routes
  if (segments.length > 0 && segments[0] !== 'onboarding') {
    breadcrumbs.push({
      label: 'Projects',
      href: '/dashboard',
      icon: <LayoutDashboard className="h-4 w-4" />,
    });
  }

  // Build path progressively
  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    // Handle dynamic routes
    if (segment === 'project' && i + 1 < segments.length) {
      // Skip 'project' segment, use project name for the ID
      continue;
    }

    // Check if this is a project ID
    if (segments[i - 1] === 'project') {
      breadcrumbs.push({
        label: projectName || 'Project',
        href: currentPath,
        icon: <FolderKanban className="h-4 w-4" />,
      });
      continue;
    }

    const config = routeConfig[currentPath];
    if (config) {
      breadcrumbs.push({
        label: config.label,
        href: currentPath,
        icon: config.icon,
      });
    }
  }

  return breadcrumbs;
}

// Compact version for headers
export function BreadcrumbsCompact({ projectName }: { projectName?: string }) {
  const pathname = usePathname();

  // Simple context indicator
  if (pathname.startsWith('/project/')) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Projects
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{projectName || 'Project'}</span>
      </div>
    );
  }

  return null;
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { LoginForm } from '@/components/auth/login-form';
import { SignupForm } from '@/components/auth/signup-form';
import { GitHubButton } from '@/components/auth/github-button';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, ArrowRight, Loader2, Search } from 'lucide-react';
import { MainNav } from '@/components/navigation';

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold hidden sm:inline">AI Dev</span>
          </Link>

          {/* Divider */}
          <div className="h-6 w-px bg-border hidden sm:block" />

          {/* Main Navigation */}
          <MainNav className="hidden sm:flex" />
        </div>

        <div className="flex items-center gap-2">
          {/* Search trigger */}
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 w-48 justify-start text-sm text-muted-foreground md:flex"
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
          >
            <Search className="mr-2 h-4 w-4" />
            <span>Search...</span>
            <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          {/* Hero */}
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">Build with AI</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Describe <span className="mx-1">→</span> Generate{' '}
              <span className="mx-1">→</span> Preview
            </p>
          </div>

          {/* Auth card with tabs */}
          <Card className="w-full">
            <Tabs defaultValue="signin" className="w-full">
              <CardHeader className="text-center pb-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <TabsContent value="signin" className="space-y-4 mt-0">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Welcome back! Sign in to continue.</p>
                  </div>
                  <GitHubButton />
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                  <LoginForm />
                </TabsContent>
                <TabsContent value="signup" className="space-y-4 mt-0">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Create an account to get started.</p>
                  </div>
                  <GitHubButton />
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                  <SignupForm />
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* Try it now CTA */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              New here?{' '}
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Try it now
                <ArrowRight className="h-3 w-3" />
              </Link>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              No account needed to start building
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-muted-foreground">
        Built with Claude AI
      </footer>
    </div>
  );
}

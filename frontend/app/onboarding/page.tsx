'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useGeneration } from '@/hooks/use-generation';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Loader2,
  ExternalLink,
  Github,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MainNav } from '@/components/navigation';

const quickIdeas = [
  { label: 'Landing Page', prompt: 'A modern landing page with hero section, features grid, and email signup' },
  { label: 'Dashboard', prompt: 'A clean analytics dashboard with charts, stats cards, and a sidebar navigation' },
  { label: 'Contact Form', prompt: 'A contact form with name, email, message fields and validation feedback' },
];

type OnboardingStep = 'prompt' | 'generating' | 'preview';

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { status, messages, result, error, generate, reset } = useGeneration();

  const [prompt, setPrompt] = useState('');
  const [step, setStep] = useState<OnboardingStep>('prompt');
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setStep('generating');

    try {
      await generate(prompt);
    } catch (err) {
      // If backend unavailable, show demo mode
      console.error('Generation failed:', err);
    }
  };

  // Update step based on generation status
  useEffect(() => {
    if (status === 'complete') {
      setStep('preview');
    } else if (status === 'error' && error) {
      // Show error state but stay on generating to show the error
    }
  }, [status, error]);

  const handleQuickIdea = (idea: string) => {
    setPrompt(idea);
  };

  const handleStartOver = () => {
    reset();
    setPrompt('');
    setStep('prompt');
  };

  const handleOpenPreview = () => {
    if (result?.sandboxUrl) {
      window.open(result.sandboxUrl, '_blank');
    }
  };

  const handleSaveProject = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      router.push('/?return=/onboarding');
      return;
    }

    setIsSaving(true);
    try {
      // Generate a project name from the prompt
      const projectName = prompt.length > 50
        ? prompt.substring(0, 50) + '...'
        : prompt;

      // Create the project
      const { project } = await api.createProject({
        name: projectName,
        description: prompt,
      });

      // If we have a sandbox result, we could link it here
      // For now, just redirect to the new project
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error('Failed to save project:', err);
      // Fallback to dashboard if save fails
      router.push('/dashboard');
    } finally {
      setIsSaving(false);
    }
  };

  // Determine the current step based on status
  const currentStep: OnboardingStep =
    status === 'complete' ? 'preview' : status === 'streaming' ? 'generating' : step;

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
            <span className="mr-2">Search...</span>
            <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          <ThemeToggle />

          {currentStep !== 'prompt' ? (
            <Button variant="ghost" size="sm" onClick={handleStartOver}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Start over
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href="/">
                Sign In
              </Link>
            </Button>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Step 1: Prompt Input */}
          {currentStep === 'prompt' && (
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">
                  What would you like to build?
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Describe your project and watch AI bring it to life
                </p>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <Textarea
                    placeholder="A landing page for my podcast with a gradient background, audio player, episode list, and email signup form..."
                    className="min-h-[150px] resize-none text-base"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-sm text-muted-foreground">Quick ideas:</span>
                    {quickIdeas.map((idea) => (
                      <Badge
                        key={idea.label}
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80"
                        onClick={() => handleQuickIdea(idea.prompt)}
                      >
                        {idea.label}
                      </Badge>
                    ))}
                  </div>

                  <Button
                    className="mt-6 w-full"
                    size="lg"
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                  >
                    Generate
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: Generating */}
          {currentStep === 'generating' && (
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight">
                  Building your project...
                </h1>
                <p className="mt-2 text-muted-foreground">
                  This usually takes less than 60 seconds
                </p>
              </div>

              <Card>
                <CardContent className="pt-6">
                  {/* Progress indicators */}
                  <div className="space-y-3">
                    {messages.map((msg, i) => (
                      <div key={i} className="flex items-start gap-3">
                        {msg.type === 'status' ? (
                          <div className="flex h-5 w-5 items-center justify-center">
                            {i === messages.length - 1 ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <Check className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span
                          className={cn(
                            'text-sm',
                            msg.type === 'status' && i === messages.length - 1
                              ? 'font-medium'
                              : 'text-muted-foreground'
                          )}
                        >
                          {msg.content}
                        </span>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Make sure the backend server is running on port 3000.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handleStartOver}>
                          Try again
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Claude's response preview */}
                  {messages.filter((m) => m.type === 'text').length > 0 && (
                    <div className="mt-6 rounded-lg bg-muted p-4">
                      <p className="text-sm text-muted-foreground">
                        {messages
                          .filter((m) => m.type === 'text')
                          .map((m) => m.content)
                          .join('')
                          .slice(0, 200)}
                        {messages.filter((m) => m.type === 'text').join('').length > 200 &&
                          '...'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Preview Ready */}
          {currentStep === 'preview' && result && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Your project is ready!
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Preview your creation or save it to continue building
                </p>
              </div>

              {/* Preview iframe */}
              <Card className="overflow-hidden">
                <div className="border-b bg-muted/50 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                      <div className="h-3 w-3 rounded-full bg-yellow-500" />
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                    </div>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {result.sandboxUrl}
                    </span>
                  </div>
                </div>
                <div className="aspect-video bg-white">
                  <iframe
                    src={result.sandboxUrl}
                    className="h-full w-full"
                    title="Preview"
                  />
                </div>
              </Card>

              {/* Files created */}
              {result.filesCreated.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground">Files created:</span>
                  {result.filesCreated.map((file) => (
                    <Badge key={file} variant="outline">
                      {file}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleOpenPreview}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Full Preview
                </Button>
                <Button className="flex-1" onClick={handleSaveProject} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : isAuthenticated ? (
                    <>
                      Save & Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <Github className="mr-2 h-4 w-4" />
                      Connect GitHub to Save
                    </>
                  )}
                </Button>
              </div>

              {!isAuthenticated && (
                <p className="text-center text-sm text-muted-foreground">
                  Connect your GitHub account to save this project and keep building
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { PagesProvider, usePages } from '@/providers/pages-provider';
import { api, streamGeneration } from '@/lib/api';
import { ProjectKanbanBoard } from '@/components/project/kanban-board';
import { PreviewPanel } from '@/components/project/preview-panel';
import { TaskDetailSheet } from '@/components/project/task-detail-sheet';
import { PageSidebar } from '@/components/pages/page-sidebar';
import { PageEditor } from '@/components/pages/page-editor';
import { SynthesizeModal, SynthesizeMode } from '@/components/research/synthesize-modal';
import { UserMenu, BreadcrumbsCompact, AppHeader, MainNav } from '@/components/navigation';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sparkles,
  ArrowLeft,
  Settings,
  Github,
  FileText,
  Loader2,
  LayoutDashboard,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { ResearchSession } from '@/components/research/research-chat-list';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  branchName: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
  createdAt?: string;
  completedAt?: string | null;
  agentSessionId?: string | null;
  synthesizedPrompt?: string | null;
  column?: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  githubRepoUrl: string | null;
  sandboxId: string | null;
  sandboxUrl: string | null;
  tasks: Task[];
}

function ProjectWorkspaceContent() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { fetchPages } = usePages();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [isSandboxLoading, setIsSandboxLoading] = useState(false);
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [isPagesOpen, setIsPagesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('kanban');

  // Research sessions state
  const [researchSessions, setResearchSessions] = useState<ResearchSession[]>([]);
  const [isLoadingResearch, setIsLoadingResearch] = useState(false);

  // Synthesize modal state
  const [synthesizeModalOpen, setSynthesizeModalOpen] = useState(false);
  const [synthesizeMode, setSynthesizeMode] = useState<SynthesizeMode>('task');
  const [selectedSession, setSelectedSession] = useState<{ id: string; title: string } | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // Task detail sheet state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);

  // Open command palette
  const openCommandPalette = useCallback(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
    );
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch project data
  useEffect(() => {
    if (isAuthenticated && projectId) {
      fetchProject();
      fetchPages(projectId);
      fetchResearchSessions();
    }
  }, [isAuthenticated, projectId]);

  const fetchResearchSessions = async () => {
    setIsLoadingResearch(true);
    try {
      const data = await api.getResearchSessions(projectId);
      setResearchSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to fetch research sessions:', error);
    } finally {
      setIsLoadingResearch(false);
    }
  };

  const fetchProject = async () => {
    try {
      const data = await api.getProject(projectId);
      setProject(data.project);
      setTasks(data.project.tasks || []);
      if (data.project.sandboxUrl) {
        setSandboxUrl(data.project.sandboxUrl);
      }
    } catch (error) {
      toast.error('Failed to load project');
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaskMove = useCallback(
    async (taskId: string, newStatus: string) => {
      try {
        await api.updateTask(projectId, taskId, { status: newStatus });

        // Auto-trigger generation when moving to "building" (in_progress)
        if (newStatus === 'in_progress') {
          const task = tasks.find((t) => t.id === taskId);
          // Use description if available, otherwise use title as the prompt
          const prompt = task?.description || task?.title;
          if (prompt) {
            handleGenerate(taskId, prompt);
          }
        }

        // Auto-merge when moving to "done"
        if (newStatus === 'done') {
          toast.success('Task completed! Changes will be merged to main branch.');
        }
      } catch (error) {
        toast.error('Failed to update task');
        fetchProject(); // Refresh to get correct state
      }
    },
    [tasks, projectId]
  );

  const handleTaskCreate = useCallback(
    async (title: string, status: string) => {
      try {
        const data = await api.createTask(projectId, { title, status });
        setTasks((prev) => [...prev, data.task]);
        toast.success('Task created');
      } catch (error) {
        toast.error('Failed to create task');
      }
    },
    [projectId]
  );

  const handleGenerate = useCallback(
    async (taskId: string, prompt: string) => {
      setGeneratingTaskId(taskId);

      try {
        for await (const event of streamGeneration(prompt, {
          projectId,
          taskId,
          autoCommit: true,
        })) {
          if (event.type === 'status' && event.data.sandboxId) {
            // Sandbox created/updated - don't show preview yet
          }
          if (event.type === 'complete') {
            // Don't auto-show preview - user will spin it up in Testing column
            toast.success('Build complete! Task moved to Testing.');

            // Update task to testing column
            await api.updateTask(projectId, taskId, { status: 'review' });
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, status: 'review', column: 'testing' } : t
              )
            );
          }
          if (event.type === 'error') {
            toast.error(event.data.message);
          }
        }
      } catch (error) {
        toast.error('Generation failed');
      } finally {
        setGeneratingTaskId(null);
      }
    },
    [projectId]
  );

  const handleRefreshSandbox = useCallback(async () => {
    setIsSandboxLoading(true);
    try {
      const data = await api.createSandbox(projectId);
      setSandboxUrl(data.sandboxUrl);
    } catch (error) {
      toast.error('Failed to refresh sandbox');
    } finally {
      setIsSandboxLoading(false);
    }
  }, [projectId]);

  const handleCloseSandbox = useCallback(async () => {
    try {
      await api.closeSandbox(projectId);
      setSandboxUrl(null);
    } catch (error) {
      // Ignore errors when closing
    }
  }, [projectId]);

  // Research session handlers
  const handleCreateResearchSession = useCallback(async () => {
    console.log('[ProjectPage] Creating research session for project:', projectId);
    const data = await api.createAgentSession(projectId);
    console.log('[ProjectPage] API response:', data);
    // Refresh sessions list
    fetchResearchSessions();
    console.log('[ProjectPage] Returning sessionId:', data.sessionId);
    return data.sessionId;
  }, [projectId]);

  const handleDeleteResearchSession = useCallback(async (sessionId: string) => {
    try {
      await api.deleteResearchSession(sessionId);
      setResearchSessions(prev => prev.filter(s => s.id !== sessionId));
      toast.success('Research chat deleted');
    } catch (error) {
      toast.error('Failed to delete research chat');
    }
  }, []);

  const handleCreateTaskFromSession = useCallback((sessionId: string, sessionTitle: string) => {
    setSelectedSession({ id: sessionId, title: sessionTitle });
    setSynthesizeMode('task');
    setSynthesizeModalOpen(true);
  }, []);

  const handleSaveSessionAsNote = useCallback((sessionId: string, sessionTitle: string) => {
    setSelectedSession({ id: sessionId, title: sessionTitle });
    setSynthesizeMode('note');
    setSynthesizeModalOpen(true);
  }, []);

  const handleSynthesizeSubmit = useCallback(async (prompt: string) => {
    if (!selectedSession) return;

    setIsSynthesizing(true);
    try {
      const result = await api.synthesizeWithCustomPrompt(
        selectedSession.id,
        prompt,
        synthesizeMode
      );

      if (synthesizeMode === 'task') {
        // Create task with synthesized content
        const data = await api.createTask(projectId, {
          title: result.title,
          description: result.content,
          status: 'todo',
        });
        setTasks((prev) => [...prev, data.task]);
        toast.success('Task created from research');
      } else {
        // Create note/page with synthesized content
        const pageData = await api.createPage(projectId, {
          title: result.title,
          type: 'document',
          icon: '📝',
        });

        // Add the content as a text block
        if (pageData.page?.id) {
          await api.createBlock(pageData.page.id, {
            type: 'text',
            content: { text: result.content },
            order: 0,
          });
        }

        fetchPages(projectId);
        toast.success('Note created from research');
      }

      setSynthesizeModalOpen(false);
      setSelectedSession(null);
    } catch (error) {
      toast.error(`Failed to create ${synthesizeMode}`);
    } finally {
      setIsSynthesizing(false);
    }
  }, [selectedSession, synthesizeMode, projectId, fetchPages]);

  const handleTaskCreatedFromResearch = useCallback(() => {
    // Refresh tasks to show the new task
    fetchProject();
  }, []);

  // Task detail handlers
  const handleTaskClick = useCallback((task: Task) => {
    // Enrich task with column info for the detail sheet
    const statusToColumn: Record<string, string> = {
      todo: 'todo',
      in_progress: 'building',
      review: 'testing',
      done: 'done',
    };
    setSelectedTask({
      ...task,
      column: statusToColumn[task.status] || 'todo',
    } as Task & { column: string });
    setIsTaskSheetOpen(true);
  }, []);

  const handleTaskUpdate = useCallback(async (taskId: string, data: Partial<Task>) => {
    try {
      await api.updateTask(projectId, taskId, data);
      // Update local state
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...data } : t))
      );
      // Update the selected task if it's the one being updated
      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, ...data } : null));
      }
      toast.success('Task updated');
    } catch (error) {
      toast.error('Failed to update task');
    }
  }, [projectId, selectedTask?.id]);

  const handleTaskDelete = useCallback(async (taskId: string) => {
    try {
      await api.deleteTask(projectId, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success('Task deleted');
    } catch (error) {
      toast.error('Failed to delete task');
    }
  }, [projectId]);

  // Combined PR handler
  const handleCreateCombinedPR = useCallback(async (taskIds: string[]) => {
    try {
      toast.loading('Creating combined PR...', { id: 'combined-pr' });
      const result = await api.createCombinedPR(projectId, taskIds);
      toast.success(`Combined PR created!`, { id: 'combined-pr' });

      // Open the PR in a new tab
      window.open(result.prUrl, '_blank');

      // Refresh tasks to show updated state
      fetchProject();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create combined PR',
        { id: 'combined-pr' }
      );
    }
  }, [projectId]);

  // Preview ready handler - shows preview in side panel
  const handlePreviewReady = useCallback((url: string) => {
    setSandboxUrl(url);
  }, []);

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold hidden lg:inline">AI Dev</span>
          </Link>

          {/* Divider */}
          <div className="h-6 w-px bg-border hidden sm:block" />

          {/* Main Navigation */}
          <MainNav className="hidden md:flex" />

          {/* Divider */}
          <div className="h-6 w-px bg-border hidden md:block" />

          {/* Breadcrumbs */}
          <BreadcrumbsCompact projectName={project.name} />

          {/* Tab navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="ml-4">
            <TabsList>
              <TabsTrigger value="kanban" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Board
              </TabsTrigger>
              <TabsTrigger value="pages" className="gap-2">
                <FileText className="h-4 w-4" />
                Pages
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          {/* Search trigger */}
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 w-48 justify-start text-sm text-muted-foreground lg:flex"
            onClick={openCommandPalette}
          >
            <Search className="mr-2 h-4 w-4" />
            <span>Search...</span>
            <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          {/* GitHub status */}
          {project.githubRepoUrl ? (
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={project.githubRepoUrl} target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4" />
                Connected
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-2">
              <Github className="h-4 w-4" />
              Connect
            </Button>
          )}

          {/* Settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Project settings</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'kanban' ? (
          <>
            {/* Kanban board with Research Chat sidebar */}
            <div className="flex-1 overflow-auto p-4">
              <ProjectKanbanBoard
                projectId={projectId}
                tasks={tasks}
                onTasksChange={setTasks}
                onTaskMove={handleTaskMove}
                onTaskCreate={handleTaskCreate}
                onGenerate={handleGenerate}
                onTaskClick={handleTaskClick}
                generatingTaskId={generatingTaskId}
                researchSessions={researchSessions}
                onCreateResearchSession={handleCreateResearchSession}
                onDeleteResearchSession={handleDeleteResearchSession}
                onCreateTaskFromSession={handleCreateTaskFromSession}
                onSaveSessionAsNote={handleSaveSessionAsNote}
                isLoadingResearch={isLoadingResearch}
                onCreateCombinedPR={handleCreateCombinedPR}
                onPreviewReady={handlePreviewReady}
              />
            </div>

            {/* Preview panel - shows when sandbox is active */}
            {(sandboxUrl || isSandboxLoading) && (
              <div className="w-[500px] border-l p-4 flex flex-col">
                <PreviewPanel
                  sandboxUrl={sandboxUrl}
                  isLoading={isSandboxLoading}
                  onRefresh={handleRefreshSandbox}
                  onClose={handleCloseSandbox}
                />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Pages sidebar */}
            <div className="w-80 border-r">
              <PageSidebar projectId={projectId} />
            </div>

            {/* Page editor */}
            <div className="flex-1">
              <PageEditor />
            </div>
          </>
        )}
      </div>

      {/* Synthesize Modal */}
      <SynthesizeModal
        isOpen={synthesizeModalOpen}
        onClose={() => {
          setSynthesizeModalOpen(false);
          setSelectedSession(null);
        }}
        mode={synthesizeMode}
        sessionTitle={selectedSession?.title || 'Research Session'}
        onSubmit={handleSynthesizeSubmit}
        isLoading={isSynthesizing}
      />

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        task={selectedTask as any}
        projectId={projectId}
        open={isTaskSheetOpen}
        onOpenChange={setIsTaskSheetOpen}
        onUpdate={handleTaskUpdate}
        onDelete={handleTaskDelete}
        onGenerate={handleGenerate}
      />
    </div>
  );
}

export default function ProjectWorkspacePage() {
  const params = useParams();
  const projectId = params.id as string;

  return (
    <PagesProvider projectId={projectId}>
      <ProjectWorkspaceContent />
    </PagesProvider>
  );
}

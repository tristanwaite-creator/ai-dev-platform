'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { AppHeader } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Github,
  Clock,
  MoreVertical,
  Trash2,
  Loader2,
  FolderOpen,
  Sparkles,
  Download,
  Check,
  Lock,
  Globe,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Project {
  id: string;
  name: string;
  description: string | null;
  githubRepoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tasks: number;
  };
}

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  url: string;
  defaultBranch: string;
  owner: string;
  updatedAt: string;
  language: string | null;
  imported: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // GitHub import state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [importingRepoId, setImportingRepoId] = useState<number | null>(null);

  // Create new repo state
  const [isCreateRepoDialogOpen, setIsCreateRepoDialogOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch projects
  useEffect(() => {
    if (isAuthenticated) {
      fetchProjects();
    }
  }, [isAuthenticated]);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data.projects || []);
    } catch (error) {
      toast.error('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const data = await api.createProject({ name: newProjectName.trim() });
      setProjects((prev) => [data.project, ...prev]);
      setNewProjectName('');
      toast.success('Project created!');
    } catch (error) {
      toast.error('Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      toast.success('Project deleted');
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const fetchGitHubRepos = async () => {
    setIsLoadingRepos(true);
    try {
      const data = await api.getGitHubRepos();
      setGithubRepos(data.repos || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch GitHub repositories');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleImportRepo = async (repo: GitHubRepo) => {
    setImportingRepoId(repo.id);
    try {
      const result = await api.importGitHubRepo(repo.id);
      toast.success(`Imported "${repo.name}" successfully!`);

      // Mark as imported locally
      setGithubRepos((prev) =>
        prev.map((r) => (r.id === repo.id ? { ...r, imported: true } : r))
      );

      // Add to projects list
      if (result.project) {
        setProjects((prev) => [result.project, ...prev]);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to import repository');
    } finally {
      setImportingRepoId(null);
    }
  };

  const handleOpenImportDialog = () => {
    setIsImportDialogOpen(true);
    if (githubRepos.length === 0) {
      fetchGitHubRepos();
    }
  };

  const handleCreateWithRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName.trim()) return;

    setIsCreatingRepo(true);
    try {
      const res = await fetch('http://localhost:3000/api/github/create-project-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          projectName: newRepoName.trim(),
          repoName: newRepoName.trim().toLowerCase().replace(/\s+/g, '-'),
          description: newRepoDescription.trim() || undefined,
          private: newRepoPrivate,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create project');
      }

      const data = await res.json();
      toast.success(`Created "${data.project.name}" with GitHub repo!`);

      // Add to projects and close dialog
      setProjects((prev) => [{ ...data.project, _count: { tasks: 0 } }, ...prev]);
      setIsCreateRepoDialogOpen(false);
      setNewRepoName('');
      setNewRepoDescription('');
      setNewRepoPrivate(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create project with repo');
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="Projects" />

      {/* Main content */}
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-6xl">
          {/* Quick create form */}
          <div className="mb-8 flex flex-wrap items-center gap-4">
            <form onSubmit={handleQuickCreate} className="flex gap-3">
              <Input
                placeholder="New project name..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                disabled={isCreating}
                className="max-w-sm"
              />
              <Button type="submit" disabled={!newProjectName.trim() || isCreating}>
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create
              </Button>
            </form>

            {/* Import from GitHub */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={handleOpenImportDialog}>
                  <Github className="mr-2 h-4 w-4" />
                  Import from GitHub
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Import GitHub Repository</DialogTitle>
                  <DialogDescription>
                    Select a repository to import as a project. Already imported repos are marked.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[400px] pr-4">
                  {isLoadingRepos ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : githubRepos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Github className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-4 text-sm text-muted-foreground">
                        No repositories found or GitHub not connected.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {githubRepos.map((repo) => (
                        <div
                          key={repo.id}
                          className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{repo.name}</span>
                              {repo.private ? (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <Globe className="h-3 w-3 text-muted-foreground" />
                              )}
                              {repo.language && (
                                <Badge variant="secondary" className="text-xs">
                                  {repo.language}
                                </Badge>
                              )}
                            </div>
                            {repo.description && (
                              <p className="mt-1 text-sm text-muted-foreground truncate">
                                {repo.description}
                              </p>
                            )}
                          </div>
                          <div className="ml-4">
                            {repo.imported ? (
                              <Badge variant="secondary" className="gap-1">
                                <Check className="h-3 w-3" />
                                Imported
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleImportRepo(repo)}
                                disabled={importingRepoId === repo.id}
                              >
                                {importingRepoId === repo.id ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <Download className="mr-1 h-3 w-3" />
                                )}
                                Import
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>

            {/* Create New Project + Repo */}
            <Dialog open={isCreateRepoDialogOpen} onOpenChange={setIsCreateRepoDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  New Project + Repo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Project with GitHub Repo</DialogTitle>
                  <DialogDescription>
                    Create a new project and GitHub repository at the same time.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateWithRepo} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="repoName">Project / Repository Name</Label>
                    <Input
                      id="repoName"
                      placeholder="my-awesome-project"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      disabled={isCreatingRepo}
                    />
                    <p className="text-xs text-muted-foreground">
                      Repo will be created as: {newRepoName ? newRepoName.toLowerCase().replace(/\s+/g, '-') : 'my-project'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repoDescription">Description (optional)</Label>
                    <Textarea
                      id="repoDescription"
                      placeholder="A brief description of your project..."
                      value={newRepoDescription}
                      onChange={(e) => setNewRepoDescription(e.target.value)}
                      disabled={isCreatingRepo}
                      rows={2}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="private">Private Repository</Label>
                      <p className="text-xs text-muted-foreground">
                        {newRepoPrivate ? 'Only you can see this repo' : 'Anyone can see this repo'}
                      </p>
                    </div>
                    <Switch
                      id="private"
                      checked={newRepoPrivate}
                      onCheckedChange={setNewRepoPrivate}
                      disabled={isCreatingRepo}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateRepoDialogOpen(false)}
                      disabled={isCreatingRepo}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={!newRepoName.trim() || isCreatingRepo}>
                      {isCreatingRepo ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Github className="mr-2 h-4 w-4" />
                          Create Project + Repo
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Projects grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create your first project to get started
                </p>
                <Button className="mt-4" asChild>
                  <Link href="/onboarding">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start with AI
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="group cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/project/${project.id}`)}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{project.name}</CardTitle>
                      {project.description && (
                        <CardDescription className="line-clamp-2">
                          {project.description}
                        </CardDescription>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {project._count?.tasks !== undefined && (
                        <span>{project._count.tasks} tasks</span>
                      )}
                      {project.githubRepoUrl && (
                        <Badge variant="secondary" className="gap-1">
                          <Github className="h-3 w-3" />
                          GitHub
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(project.updatedAt)}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* New project card */}
              <Card
                className="flex cursor-pointer items-center justify-center border-dashed transition-colors hover:border-primary hover:bg-muted/50"
                onClick={() => document.querySelector('input')?.focus()}
              >
                <CardContent className="flex flex-col items-center py-8">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">New project</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  GitBranch,
  ExternalLink,
  Trash2,
  Sparkles,
  Calendar,
  AlertCircle,
  Edit3,
  Check,
  X,
  Eye,
  Maximize2,
  RefreshCw,
  Loader2,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface Generation {
  id: string;
  status: string;
  filesCreated: string[];
  createdAt: string;
  agentModel?: string;
  tokenUsage?: number;
  sandboxId?: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  column: string;
  branchName: string | null;
  prUrl: string | null;
  prNumber: number | null;
  createdAt: string;
  completedAt?: string | null;
  generations?: Generation[];
  synthesizedPrompt?: string | null;
}

interface TaskDetailSheetProps {
  task: Task | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (taskId: string, data: Partial<Task>) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  onGenerate?: (taskId: string, prompt: string) => Promise<void>;
}

const priorityColors = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  high: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const statusColors = {
  todo: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  review: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  done: 'bg-green-500/10 text-green-600 dark:text-green-400',
};

export function TaskDetailSheet({
  task,
  projectId,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onGenerate,
}: TaskDetailSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [buildPrompt, setBuildPrompt] = useState('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [isStartingPreview, setIsStartingPreview] = useState(false);
  const [activeSandboxUrl, setActiveSandboxUrl] = useState<string | null>(null);

  if (!task) return null;

  // Get the latest completed generation with a sandboxId
  const latestGeneration = task.generations?.find(
    (g) => g.status === 'completed' && g.sandboxId
  );
  const hasCompletedGeneration = task.generations?.some(g => g.status === 'completed');

  // Use active sandbox URL if we've spun one up, otherwise compute from generation
  const sandboxUrl = activeSandboxUrl || (latestGeneration?.sandboxId
    ? `https://8000-${latestGeneration.sandboxId}.e2b.app`
    : null);

  const canShowPreview =
    (task.column === 'building' || task.column === 'testing') && sandboxUrl;
  const canStartPreview =
    (task.column === 'building' || task.column === 'testing') && hasCompletedGeneration;

  const handleEdit = () => {
    setEditedTitle(task.title);
    setEditedDescription(task.description || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!onUpdate) return;

    await onUpdate(task.id, {
      title: editedTitle,
      description: editedDescription,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedTitle('');
    setEditedDescription('');
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    const confirmed = confirm('Are you sure you want to delete this task?');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await onDelete(task.id);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGenerate = async () => {
    if (!onGenerate) return;

    const prompt = buildPrompt || task.synthesizedPrompt || task.description || task.title;
    await onGenerate(task.id, prompt);
  };

  const handleEditPrompt = () => {
    setBuildPrompt(task.synthesizedPrompt || task.description || task.title);
    setIsEditingPrompt(true);
  };

  const handleSavePrompt = async () => {
    if (onUpdate) {
      await onUpdate(task.id, { synthesizedPrompt: buildPrompt } as any);
    }
    setIsEditingPrompt(false);
  };

  const handleCancelPrompt = () => {
    setBuildPrompt('');
    setIsEditingPrompt(false);
  };

  const handleRefreshPreview = () => {
    setPreviewKey((k) => k + 1);
  };

  const handleStartPreview = async () => {
    setIsStartingPreview(true);
    try {
      const result = await api.startTaskPreview(projectId, task.id);
      setActiveSandboxUrl(result.sandboxUrl);
      setShowPreview(true);
      toast.success('Preview started successfully');
    } catch (error) {
      console.error('Failed to start preview:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start preview');
    } finally {
      setIsStartingPreview(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? (
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Task title"
                className="text-lg font-semibold"
              />
            ) : (
              task.title
            )}
          </SheetTitle>
          <SheetDescription>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge
                variant="outline"
                className={cn(
                  statusColors[task.status as keyof typeof statusColors] ||
                    statusColors.todo
                )}
              >
                {task.status.replace('_', ' ')}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  priorityColors[task.priority as keyof typeof priorityColors] ||
                    priorityColors.medium
                )}
              >
                {task.priority} priority
              </Badge>
            </div>
          </SheetDescription>
        </SheetHeader>

        {/* Live Preview Section - Prominent for Building/Testing */}
        {canShowPreview && (
          <div className="border rounded-lg overflow-hidden mt-4">
            <div className="flex items-center justify-between bg-muted/50 px-3 py-2 border-b">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                </div>
                <span className="text-xs font-medium">Live Preview</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleRefreshPreview}
                  title="Refresh preview"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowPreview(!showPreview)}
                  title={showPreview ? 'Collapse' : 'Expand'}
                >
                  {showPreview ? (
                    <X className="h-3 w-3" />
                  ) : (
                    <Maximize2 className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => window.open(sandboxUrl!, '_blank')}
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {showPreview ? (
              <iframe
                key={previewKey}
                src={sandboxUrl!}
                className="w-full h-[400px] bg-white"
                title="Live Preview"
              />
            ) : (
              <button
                onClick={() => setShowPreview(true)}
                className="w-full py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <Eye className="h-8 w-8" />
                <span className="text-sm">Click to load preview</span>
              </button>
            )}
          </div>
        )}

        {/* No preview available message for Building/Testing */}
        {(task.column === 'building' || task.column === 'testing') && !sandboxUrl && (
          <div className="border border-dashed rounded-lg p-4 mt-4 text-center">
            <Eye className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No preview available yet.
              {task.column === 'building' && !canStartPreview && ' Generate code to see a live preview.'}
            </p>
            {canStartPreview && (
              <Button
                onClick={handleStartPreview}
                disabled={isStartingPreview}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
              >
                {isStartingPreview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting Preview...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Preview
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Description</h3>
                {!isEditing && (
                  <Button variant="ghost" size="sm" onClick={handleEdit}>
                    Edit
                  </Button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Add a description..."
                    className="min-h-[100px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {task.description || 'No description provided'}
                </p>
              )}
            </div>

            <Separator />

            {/* Git Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Git Integration</h3>
              <div className="space-y-2">
                {task.branchName && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {task.branchName}
                    </code>
                  </div>
                )}
                {task.prUrl && (
                  <a
                    href={task.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Pull Request #{task.prNumber}
                  </a>
                )}
                {!task.branchName && !task.prUrl && (
                  <p className="text-sm text-muted-foreground">
                    No Git integration yet
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Dates */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Timeline</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(task.createdAt)}</span>
                </div>
                {task.completedAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Completed:</span>
                    <span>{formatDate(task.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Build Prompt - Show for building column or if synthesized prompt exists */}
            {(task.column === 'building' || task.synthesizedPrompt) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Build Prompt</h3>
                    {!isEditingPrompt && (
                      <Button variant="ghost" size="sm" onClick={handleEditPrompt}>
                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>

                  {isEditingPrompt ? (
                    <div className="space-y-2">
                      <Textarea
                        value={buildPrompt}
                        onChange={(e) => setBuildPrompt(e.target.value)}
                        placeholder="Enter the prompt for code generation..."
                        className="min-h-[150px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSavePrompt}>
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancelPrompt}>
                          <X className="h-3.5 w-3.5 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md bg-muted/50 p-3 text-sm">
                      {task.synthesizedPrompt || task.description || (
                        <span className="text-muted-foreground italic">
                          No prompt set. Click Edit to add one.
                        </span>
                      )}
                    </div>
                  )}

                  {task.column === 'building' && (
                    <Button
                      onClick={handleGenerate}
                      className="w-full"
                      disabled={!task.synthesizedPrompt && !task.description && !task.title}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Code
                    </Button>
                  )}

                  {!task.synthesizedPrompt && !task.description && (
                    <p className="text-xs text-muted-foreground flex items-start gap-2">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      Add a build prompt to provide context for code generation
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Generation History */}
            {task.generations && task.generations.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Generation History</h3>
                  <div className="space-y-2">
                    {task.generations.map((gen) => (
                      <div
                        key={gen.id}
                        className="border rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <Badge
                            variant={
                              gen.status === 'completed'
                                ? 'default'
                                : gen.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {gen.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(gen.createdAt)}
                          </span>
                        </div>
                        {gen.filesCreated && gen.filesCreated.length > 0 && (
                          <div className="text-xs">
                            <p className="text-muted-foreground mb-1">
                              Files created:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {gen.filesCreated.map((file, i) => (
                                <code
                                  key={i}
                                  className="bg-muted px-1.5 py-0.5 rounded text-[10px]"
                                >
                                  {file}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}
                        {gen.agentModel && (
                          <p className="text-xs text-muted-foreground">
                            Model: {gen.agentModel}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="border-t pt-4 mt-4">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isDeleting ? 'Deleting...' : 'Delete Task'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

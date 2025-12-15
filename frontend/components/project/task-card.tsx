'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  GitBranch,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ExternalLink,
  Eye,
  Check,
  AlertCircle,
} from 'lucide-react';

interface Generation {
  id: string;
  status: string;
  sandboxId?: string;
}

interface Task {
  id: string;
  name: string;
  column: string;
  title: string;
  description: string | null;
  priority: string;
  branchName: string | null;
  status: string;
  buildStatus?: string;
  agentSessionId?: string | null;
  synthesizedPrompt?: string | null;
  generations?: Generation[];
}

interface TaskCardProps {
  task: Task;
  projectId: string;
  onGenerate?: (taskId: string, prompt: string) => Promise<void>;
  onClick?: () => void;
  isGenerating?: boolean;
  // Selection support for Testing column multi-select
  isSelectable?: boolean;
  isSelected?: boolean;
  onSelectChange?: (taskId: string, selected: boolean) => void;
  // Preview callback - shows preview in app panel instead of new tab
  onPreviewReady?: (sandboxUrl: string) => void;
}

export function TaskCard({
  task,
  projectId,
  onGenerate,
  onClick,
  isGenerating,
  isSelectable = false,
  isSelected = false,
  onSelectChange,
  onPreviewReady,
}: TaskCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [prompt, setPrompt] = useState(task.description || '');
  const [isSpinningUpPreview, setIsSpinningUpPreview] = useState(false);

  // Get sandbox URL from latest completed generation
  const latestGeneration = task.generations?.find(
    (g) => g.status === 'completed' && g.sandboxId
  );
  const hasCompletedGeneration = !!latestGeneration;

  const handleSpinUpPreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSpinningUpPreview(true);
    try {
      const result = await api.startTaskPreview(projectId, task.id);
      if (onPreviewReady) {
        // Show preview in app panel
        onPreviewReady(result.sandboxUrl);
        toast.success('Preview ready');
      } else {
        // Fallback to opening in new tab
        window.open(result.sandboxUrl, '_blank');
        toast.success('Preview opened in new tab');
      }
    } catch (error) {
      console.error('Failed to spin up preview:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start preview');
    } finally {
      setIsSpinningUpPreview(false);
    }
  };

  const handleResearchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.agentSessionId) {
      router.push(`/project/${projectId}/research/${task.agentSessionId}`);
    }
  };

  const handleGenerate = async () => {
    if (onGenerate && prompt.trim()) {
      await onGenerate(task.id, prompt);
    }
  };

  const priorityColors = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    high: 'bg-red-500/10 text-red-600 dark:text-red-400',
  };

  return (
    <KanbanCard id={task.id} name={task.title} column={task.column}>
      <div className="space-y-2" onClick={onClick}>
        <div className="flex items-start justify-between gap-2">
          {/* Selection checkbox for Testing column */}
          {isSelectable && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => {
                onSelectChange?.(task.id, checked as boolean);
              }}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 mr-1"
            />
          )}
          <p className={cn("font-medium text-sm", isSelectable ? "flex-1" : "")}>{task.title}</p>
          <Badge
            variant="secondary"
            className={cn(
              'text-xs',
              priorityColors[task.priority as keyof typeof priorityColors] ||
                priorityColors.medium
            )}
          >
            {task.priority}
          </Badge>
        </div>

        {task.branchName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            <span className="truncate">{task.branchName}</span>
          </div>
        )}

        {/* Research breadcrumb - shows when task was created from AI research */}
        {task.agentSessionId && (
          <button
            onClick={handleResearchClick}
            className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-600 hover:underline transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            <span>From AI Research</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        )}

        {/* Build status indicator for Building column */}
        {task.column === 'building' && (
          <>
            {isGenerating && (
              <div className="flex items-center gap-2 pt-1 text-xs text-violet-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Building...
              </div>
            )}
            {!isGenerating && task.buildStatus === 'ready' && (
              <div className="flex items-center gap-2 pt-1 text-xs text-green-500">
                <Check className="h-3 w-3" />
                Build complete - drag to Testing
              </div>
            )}
            {task.buildStatus === 'failed' && (
              <div className="flex items-center gap-2 pt-1 text-xs text-red-500">
                <AlertCircle className="h-3 w-3" />
                Build failed
              </div>
            )}
          </>
        )}

        {/* Spin Up Preview button - ONLY in Testing column */}
        {task.column === 'testing' && hasCompletedGeneration && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs mt-2 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-violet-500/20 hover:border-violet-500/40"
            onClick={handleSpinUpPreview}
            disabled={isSpinningUpPreview}
          >
            {isSpinningUpPreview ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin text-violet-500" />
                <span className="text-violet-600 dark:text-violet-400">Spinning Up...</span>
              </>
            ) : (
              <>
                <Eye className="mr-2 h-3 w-3 text-violet-500" />
                <span className="text-violet-600 dark:text-violet-400">Spin Up Preview</span>
              </>
            )}
          </Button>
        )}

        {/* Inline generation for Building column */}
        {task.column === 'building' && !isGenerating && (
          <div className="space-y-2 pt-2">
            <button
              className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Generate code
              </span>
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>

            {isExpanded && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Describe what to build..."
                  className="min-h-[60px] text-xs"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isGenerating}
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  size="sm"
                  className="w-full text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGenerate();
                  }}
                  disabled={!prompt.trim() || isGenerating}
                >
                  <Sparkles className="mr-2 h-3 w-3" />
                  Generate
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </KanbanCard>
  );
}

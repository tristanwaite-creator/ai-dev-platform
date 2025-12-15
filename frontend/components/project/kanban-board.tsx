'use client';

import { useState } from 'react';
import {
  KanbanProvider,
  KanbanBoard,
  KanbanHeader,
  KanbanCards,
  type DragEndEvent,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './task-card';
import { ResearchChatList, ResearchSession } from '@/components/research/research-chat-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  branchName: string | null;
  agentSessionId?: string | null;
  synthesizedPrompt?: string | null;
}

// Extended type for Kanban items that includes Task properties
interface KanbanTask extends Task {
  name: string;
  column: string;
  [key: string]: unknown;
}

interface KanbanBoardProps {
  tasks: Task[];
  onTasksChange?: (tasks: Task[]) => void;
  onTaskMove?: (taskId: string, newStatus: string) => Promise<void>;
  onTaskCreate?: (title: string, status: string) => Promise<void>;
  onGenerate?: (taskId: string, prompt: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
  generatingTaskId?: string | null;
  // Research sessions for the Research column
  projectId: string;
  researchSessions?: ResearchSession[];
  onCreateResearchSession?: () => Promise<string>;
  onDeleteResearchSession?: (sessionId: string) => Promise<void>;
  onCreateTaskFromSession?: (sessionId: string, sessionTitle: string) => void | Promise<void>;
  onSaveSessionAsNote?: (sessionId: string, sessionTitle: string) => void | Promise<void>;
  isLoadingResearch?: boolean;
  // Combined PR creation
  onCreateCombinedPR?: (taskIds: string[]) => Promise<void>;
  // Preview callback - shows preview in app panel
  onPreviewReady?: (sandboxUrl: string) => void;
}

// Kanban columns for tasks (Research is separate chat list)
const taskColumns = [
  { id: 'todo', name: 'Todo', color: 'bg-[oklch(var(--column-research))]' },
  { id: 'building', name: 'Building', color: 'bg-[oklch(var(--column-building))]' },
  { id: 'testing', name: 'Testing', color: 'bg-[oklch(var(--column-testing))]' },
  { id: 'done', name: 'Done', color: 'bg-[oklch(var(--column-done))]' },
];

// Map task status to column id
const statusToColumn: Record<string, string> = {
  todo: 'todo',
  in_progress: 'building',
  review: 'testing',
  done: 'done',
};

const columnToStatus: Record<string, string> = {
  todo: 'todo',
  building: 'in_progress',
  testing: 'review',
  done: 'done',
};

export function ProjectKanbanBoard({
  tasks,
  onTasksChange,
  onTaskMove,
  onTaskCreate,
  onGenerate,
  onTaskClick,
  generatingTaskId,
  projectId,
  researchSessions = [],
  onCreateResearchSession,
  onDeleteResearchSession,
  onCreateTaskFromSession,
  onSaveSessionAsNote,
  isLoadingResearch = false,
  onCreateCombinedPR,
  onPreviewReady,
}: KanbanBoardProps) {
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  const handleTaskSelect = (taskId: string, selected: boolean) => {
    setSelectedTaskIds((prev) =>
      selected ? [...prev, taskId] : prev.filter((id) => id !== taskId)
    );
  };

  const handleCreateCombinedPR = async () => {
    if (onCreateCombinedPR && selectedTaskIds.length > 0) {
      await onCreateCombinedPR(selectedTaskIds);
      setSelectedTaskIds([]); // Clear selection after PR creation
    }
  };

  // Transform tasks for the Kanban component
  const kanbanData = tasks.map((task) => ({
    ...task,
    id: task.id,
    name: task.title,
    column: statusToColumn[task.status] || 'todo',
  }));

  const handleDataChange = async (newData: typeof kanbanData) => {
    // Find the task that was moved
    for (const item of newData) {
      const originalTask = tasks.find((t) => t.id === item.id);
      if (originalTask) {
        const originalColumn = statusToColumn[originalTask.status];
        if (originalColumn !== item.column) {
          // Task was moved to a new column
          const newStatus = columnToStatus[item.column];
          if (onTaskMove) {
            await onTaskMove(item.id, newStatus);
          }
          break;
        }
      }
    }

    // Update local state
    if (onTasksChange) {
      const updatedTasks = newData.map((item) => {
        const original = tasks.find((t) => t.id === item.id);
        return {
          ...original!,
          status: columnToStatus[item.column] || 'todo',
        };
      });
      onTasksChange(updatedTasks);
    }
  };

  const handleAddTask = async (columnId: string) => {
    if (!newTaskTitle.trim() || !onTaskCreate) return;

    const status = columnToStatus[columnId];
    await onTaskCreate(newTaskTitle.trim(), status);
    setNewTaskTitle('');
    setAddingToColumn(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    // Additional handling if needed after drag ends
  };

  return (
    <div className="flex h-full gap-4">
      {/* Research Chat Sidebar */}
      <div className="w-72 shrink-0">
        <ResearchChatList
          projectId={projectId}
          sessions={researchSessions}
          onCreateSession={onCreateResearchSession || (async () => '')}
          onDeleteSession={onDeleteResearchSession}
          onCreateTask={onCreateTaskFromSession}
          onSaveAsNote={onSaveSessionAsNote}
          isLoading={isLoadingResearch}
        />
      </div>

      {/* Task Kanban Board */}
      <div className="flex-1 min-w-0">
        <KanbanProvider
          columns={taskColumns}
          data={kanbanData}
          onDataChange={handleDataChange}
          onDragEnd={handleDragEnd}
          className="h-full"
        >
          {(column) => (
            <KanbanBoard key={column.id} id={column.id}>
              <KanbanHeader
                className={cn(
                  'flex items-center justify-between rounded-t-md',
                  column.color
                )}
              >
                <div className="flex items-center gap-2">
                  <span>{column.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {kanbanData.filter((t) => t.column === column.id).length}
                  </span>
                </div>
                {/* Create Combined PR button for Testing column */}
                {column.id === 'testing' && selectedTaskIds.length > 0 && onCreateCombinedPR && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30 hover:border-green-500/50"
                    onClick={handleCreateCombinedPR}
                  >
                    <GitPullRequest className="mr-1 h-3 w-3 text-green-600" />
                    <span className="text-green-700 dark:text-green-400">
                      PR ({selectedTaskIds.length})
                    </span>
                  </Button>
                )}
              </KanbanHeader>

              {/* Add task button/form - NOW AT TOP */}
              <div className="p-2 border-b">
                {addingToColumn === column.id ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Task title..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTask(column.id);
                        if (e.key === 'Escape') {
                          setAddingToColumn(null);
                          setNewTaskTitle('');
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleAddTask(column.id)}
                        disabled={!newTaskTitle.trim()}
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAddingToColumn(null);
                          setNewTaskTitle('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => setAddingToColumn(column.id)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add task
                  </Button>
                )}
              </div>

              {/* Cards area - scrollable */}
              <KanbanCards<KanbanTask> id={column.id}>
                {(task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    onGenerate={onGenerate}
                    onClick={onTaskClick ? () => onTaskClick(task) : undefined}
                    isGenerating={generatingTaskId === task.id}
                    // Selection props for Testing column
                    isSelectable={column.id === 'testing' && !!onCreateCombinedPR}
                    isSelected={selectedTaskIds.includes(task.id)}
                    onSelectChange={handleTaskSelect}
                    // Preview callback for in-app preview
                    onPreviewReady={onPreviewReady}
                  />
                )}
              </KanbanCards>
            </KanbanBoard>
          )}
        </KanbanProvider>
      </div>
    </div>
  );
}

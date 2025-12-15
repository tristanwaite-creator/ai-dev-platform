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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Settings,
  Github,
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  description: string | null;
  githubRepoUrl: string | null;
  githubRepoOwner: string | null;
  githubRepoName: string | null;
  defaultBranch: string;
  sandboxId: string | null;
  sandboxStatus: string;
  createdAt: string;
}

interface SettingsSheetProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (projectId: string, data: Partial<Project>) => Promise<void>;
  onDelete?: (projectId: string) => Promise<void>;
}

export function SettingsSheet({
  project,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
}: SettingsSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!project) return null;

  const handleEdit = () => {
    setEditedName(project.name);
    setEditedDescription(project.description || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!onUpdate) return;

    setIsSaving(true);
    try {
      await onUpdate(project.id, {
        name: editedName,
        description: editedDescription,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedName('');
    setEditedDescription('');
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    const confirmed = confirm(
      `Are you sure you want to delete "${project.name}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    const doubleConfirmed = confirm(
      'This will permanently delete the project and all its tasks. Type DELETE to confirm.'
    );
    if (!doubleConfirmed) return;

    setIsDeleting(true);
    try {
      await onDelete(project.id);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const sandboxStatusIcon = {
    active: CheckCircle2,
    inactive: XCircle,
    error: AlertCircle,
  };

  const sandboxStatusColor = {
    active: 'text-green-600 dark:text-green-400',
    inactive: 'text-muted-foreground',
    error: 'text-red-600 dark:text-red-400',
  };

  const SandboxIcon =
    sandboxStatusIcon[project.sandboxStatus as keyof typeof sandboxStatusIcon] ||
    XCircle;
  const sandboxColor =
    sandboxStatusColor[
      project.sandboxStatus as keyof typeof sandboxStatusColor
    ] || 'text-muted-foreground';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Project Settings
          </SheetTitle>
          <SheetDescription>
            Manage your project configuration and integrations
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* General Settings */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-3">General</h3>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="name">Project Name</Label>
                      <Input
                        id="name"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="My Project"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        placeholder="Project description..."
                        className="min-h-[80px]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <p className="mt-1">{project.name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">
                        Description
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {project.description || 'No description'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleEdit}>
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* GitHub Integration */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                <h3 className="text-sm font-medium">GitHub Integration</h3>
              </div>

              {project.githubRepoUrl ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium">Connected</span>
                      </div>
                      <a
                        href={project.githubRepoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        {project.githubRepoOwner}/{project.githubRepoName}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-muted-foreground">
                        Default Branch
                      </Label>
                      <Badge variant="outline" className="mt-1">
                        {project.defaultBranch}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-4 text-center">
                  <XCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-3">
                    No GitHub repository connected
                  </p>
                  <Button variant="outline" size="sm" disabled>
                    <Github className="mr-2 h-4 w-4" />
                    Connect Repository
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Connect via project creation or quick-start
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Sandbox Status */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                <h3 className="text-sm font-medium">E2B Sandbox</h3>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <SandboxIcon className={cn('h-4 w-4', sandboxColor)} />
                  <span className="text-sm capitalize">
                    {project.sandboxStatus}
                  </span>
                </div>

                {project.sandboxId && (
                  <div className="text-xs">
                    <Label className="text-muted-foreground">Sandbox ID</Label>
                    <code className="block mt-1 bg-muted px-2 py-1 rounded text-[10px]">
                      {project.sandboxId}
                    </code>
                  </div>
                )}

                {project.sandboxStatus === 'inactive' && (
                  <p className="text-xs text-muted-foreground">
                    Sandbox will be created when you generate code
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Metadata */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Metadata</h3>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Project ID</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded">
                    {project.id}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span>Created</span>
                  <span>
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Danger Zone */}
        <div className="border-t pt-4 mt-4 space-y-3">
          <div>
            <h3 className="text-sm font-medium text-destructive mb-2">
              Danger Zone
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Once you delete a project, there is no going back. This will
              permanently delete all tasks, generations, and associated data.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

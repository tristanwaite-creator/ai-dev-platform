'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ListTodo, FileText, Sparkles } from 'lucide-react';

export type SynthesizeMode = 'task' | 'note';

interface SynthesizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: SynthesizeMode;
  sessionTitle: string;
  onSubmit: (prompt: string) => Promise<void>;
  isLoading?: boolean;
}

const modeConfig = {
  task: {
    icon: ListTodo,
    iconColor: 'text-blue-500',
    title: 'Create Task from Research',
    description: 'Describe what task you want to create based on this research conversation.',
    placeholder: 'e.g., "Create a task to implement the authentication system we discussed, focusing on OAuth2 integration"',
    submitText: 'Create Task',
    submitColor: 'bg-blue-500 hover:bg-blue-600',
  },
  note: {
    icon: FileText,
    iconColor: 'text-green-500',
    title: 'Save as Note',
    description: 'Describe what you want to capture in a note from this research conversation.',
    placeholder: 'e.g., "Summarize the key findings about React performance optimization techniques"',
    submitText: 'Save Note',
    submitColor: 'bg-green-500 hover:bg-green-600',
  },
};

export function SynthesizeModal({
  isOpen,
  onClose,
  mode,
  sessionTitle,
  onSubmit,
  isLoading = false,
}: SynthesizeModalProps) {
  const [prompt, setPrompt] = useState('');
  const config = modeConfig[mode];
  const Icon = config.icon;

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    await onSubmit(prompt.trim());
    setPrompt('');
  };

  const handleClose = () => {
    if (!isLoading) {
      setPrompt('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.iconColor}`} />
            {config.title}
          </DialogTitle>
          <DialogDescription>
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Session context */}
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">From research session:</p>
            <p className="text-sm font-medium truncate">{sessionTitle}</p>
          </div>

          {/* Prompt input */}
          <div className="space-y-2">
            <Label htmlFor="synthesize-prompt" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              Your instructions
            </Label>
            <Textarea
              id="synthesize-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={config.placeholder}
              className="min-h-[120px] resize-none"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Claude will analyze the conversation and generate content based on your prompt.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isLoading}
            className={config.submitColor}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {config.submitText}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

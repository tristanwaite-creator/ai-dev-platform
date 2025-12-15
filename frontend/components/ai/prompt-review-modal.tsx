'use client';

import { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, ArrowRight, Loader2, Sparkles, MessageSquare } from 'lucide-react';

interface PromptReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  synthesizedPrompt: string;
  synthesizedTitle: string;
  context: string[];
  messageCount: number;
  isLoading?: boolean;
  onSendToBuild: (title: string, prompt: string) => Promise<void>;
}

export function PromptReviewModal({
  open,
  onOpenChange,
  synthesizedPrompt,
  synthesizedTitle,
  context,
  messageCount,
  isLoading = false,
  onSendToBuild,
}: PromptReviewModalProps) {
  const [title, setTitle] = useState(synthesizedTitle);
  const [prompt, setPrompt] = useState(synthesizedPrompt);
  const [isSending, setIsSending] = useState(false);

  // Update state when props change
  useEffect(() => {
    setTitle(synthesizedTitle);
    setPrompt(synthesizedPrompt);
  }, [synthesizedTitle, synthesizedPrompt]);

  const handleSendToBuild = async () => {
    if (!prompt.trim()) return;

    setIsSending(true);
    try {
      await onSendToBuild(title, prompt);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to send to build:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Review Build Prompt
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Generated from {messageCount} messages in research session
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* Task Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Task Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title..."
                className="font-medium"
              />
            </div>

            {/* Build Prompt */}
            <div className="space-y-2">
              <Label htmlFor="prompt">Build Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what to build..."
                className="min-h-[200px] resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Edit the prompt above to refine what will be built
              </p>
            </div>

            {/* Extracted Context */}
            {context.length > 0 && (
              <div className="space-y-2">
                <Label>Included Context</Label>
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  {context.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="shrink-0 mt-0.5">
                        {item.startsWith('Research:') ? 'Research' : 'Page'}
                      </Badge>
                      <span className="text-muted-foreground line-clamp-2">
                        {item.replace(/^(Research:|Created page:)\s*/, '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Research
          </Button>
          <Button
            onClick={handleSendToBuild}
            disabled={!prompt.trim() || isSending || isLoading}
            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
          >
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Task...
              </>
            ) : (
              <>
                Send to Building
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

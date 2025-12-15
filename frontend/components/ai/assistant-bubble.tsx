'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Sparkles, X, Send, Loader2, Search, FileText, ArrowRight, Wand2 } from 'lucide-react';
import { PromptReviewModal } from './prompt-review-modal';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: Array<{ name: string; status: string }>;
}

interface SynthesizedPrompt {
  prompt: string;
  title: string;
  context: string[];
  messageCount: number;
}

interface AssistantBubbleProps {
  projectId: string;
  onCreateSession?: () => Promise<string>;
  onSendMessage?: (sessionId: string, message: string) => Promise<{
    message: string;
    toolCalls?: Array<{ name: string }>;
  }>;
  onSynthesizePrompt?: (sessionId: string) => Promise<SynthesizedPrompt>;
  onCreateBuildTask?: (sessionId: string, title: string, prompt: string) => Promise<{
    taskId: string;
    title: string;
  }>;
  onTaskCreated?: () => void;
}

export function AssistantBubble({
  projectId,
  onCreateSession,
  onSendMessage,
  onSynthesizePrompt,
  onCreateBuildTask,
  onTaskCreated,
}: AssistantBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [synthesizedData, setSynthesizedData] = useState<SynthesizedPrompt | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleOpen = async () => {
    setIsOpen(true);

    // Create session if needed
    if (!sessionId && onCreateSession) {
      try {
        const newSessionId = await onCreateSession();
        setSessionId(newSessionId);
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: "Hi! I'm your AI research assistant. I can help you search the web, create documentation, and organize your project notes. What would you like to explore?",
            timestamp: new Date(),
          },
        ]);
      } catch (error) {
        console.error('Failed to create session:', error);
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !sessionId || !onSendMessage) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await onSendMessage(sessionId, userMessage.content);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        toolCalls: response.toolCalls?.map((t) => ({ name: t.name, status: 'executed' })),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSynthesize = async () => {
    if (!sessionId || !onSynthesizePrompt) return;

    setIsSynthesizing(true);
    try {
      const result = await onSynthesizePrompt(sessionId);
      setSynthesizedData(result);
      setShowPromptModal(true);
    } catch (error) {
      console.error('Failed to synthesize prompt:', error);
      toast.error('Failed to synthesize prompt. Please try again.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSendToBuild = async (title: string, prompt: string) => {
    if (!sessionId || !onCreateBuildTask) return;

    const result = await onCreateBuildTask(sessionId, title, prompt);
    toast.success(`Task "${result.title}" created in Building column!`);
    setShowPromptModal(false);
    setIsOpen(false);

    // Notify parent to refresh tasks
    if (onTaskCreated) {
      onTaskCreated();
    }
  };

  return (
    <>
      {/* Floating bubble */}
      <Button
        className={cn(
          'fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg transition-transform',
          isOpen && 'scale-0'
        )}
        onClick={handleOpen}
      >
        <Sparkles className="h-6 w-6" />
        <span className="sr-only">Open AI Assistant</span>
      </Button>

      {/* Chat panel */}
      <Card
        className={cn(
          'fixed bottom-6 right-6 w-96 max-h-[600px] flex flex-col shadow-xl transition-all duration-200',
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI Assistant
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-4 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex flex-col',
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* Tool indicators */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {message.toolCalls.map((tool, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {tool.name === 'search_web' && (
                          <Search className="h-3 w-3" />
                        )}
                        {tool.name.includes('page') && (
                          <FileText className="h-3 w-3" />
                        )}
                        {tool.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            )}
          </div>
        </ScrollArea>

        <CardContent className="border-t pt-3">
          {/* Quick actions */}
          {messages.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setInput('Research best practices for ')}
              >
                <Search className="mr-1 h-3 w-3" />
                Research
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setInput('Create a documentation page about ')}
              >
                <FileText className="mr-1 h-3 w-3" />
                Create doc
              </Button>
            </div>
          )}

          {/* Synthesize button - show when there's enough conversation */}
          {messages.length >= 2 && onSynthesizePrompt && (
            <Button
              onClick={handleSynthesize}
              disabled={isSynthesizing || isLoading}
              className="w-full mb-3"
            >
              {isSynthesizing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Synthesizing...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Synthesize into Build Prompt
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}

          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              placeholder="Ask anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[40px] max-h-[120px] resize-none"
              disabled={isLoading}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Review Modal */}
      {synthesizedData && (
        <PromptReviewModal
          open={showPromptModal}
          onOpenChange={setShowPromptModal}
          synthesizedPrompt={synthesizedData.prompt}
          synthesizedTitle={synthesizedData.title}
          context={synthesizedData.context}
          messageCount={synthesizedData.messageCount}
          onSendToBuild={handleSendToBuild}
        />
      )}
    </>
  );
}

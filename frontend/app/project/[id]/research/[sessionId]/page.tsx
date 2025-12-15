'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Send,
  Loader2,
  Hammer,
  Plus,
  Sparkles,
  Search,
  Copy,
  Check,
  Wand2,
  ArrowRight,
  Brain,
  Globe,
  Zap,
  Code2,
  ListTodo,
  FileText,
  Coffee,
  Lightbulb,
  Rocket,
  Star,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { toast } from 'sonner';
import { SynthesizeModal, SynthesizeMode } from '@/components/research/synthesize-modal';

// Fun thinking messages that rotate while waiting
const THINKING_MESSAGES = [
  { text: "Brewing some ideas...", icon: Coffee },
  { text: "Connecting the dots...", icon: Sparkles },
  { text: "Searching the multiverse...", icon: Globe },
  { text: "Consulting my neural networks...", icon: Brain },
  { text: "Having a lightbulb moment...", icon: Lightbulb },
  { text: "Crunching the possibilities...", icon: Rocket },
  { text: "Reading between the lines...", icon: FileText },
  { text: "Pondering deeply...", icon: Star },
  { text: "Gathering cosmic wisdom...", icon: Sparkles },
  { text: "Synthesizing brilliance...", icon: Wand2 },
  { text: "Exploring rabbit holes...", icon: Search },
  { text: "Assembling the pieces...", icon: ListTodo },
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  toolCalls?: Array<{ name: string; status: string }>;
  buildPrompt?: {
    title: string;
    prompt: string;
  };
}

interface Session {
  id: string;
  title: string;
  status: string;
  projectId: string;
}

// Animated thinking indicator with rotating messages
function ThinkingIndicator() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const current = THINKING_MESSAGES[messageIndex];
  const Icon = current.icon;

  return (
    <div className="flex items-center gap-3 text-muted-foreground animate-in fade-in slide-in-from-bottom-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
        <Icon className="h-4 w-4 text-violet-500 animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
        <span className="text-sm font-medium transition-all duration-300">{current.text}</span>
      </div>
    </div>
  );
}

export default function ResearchChatPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const sessionId = params.sessionId as string;

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Chat mode toggles
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [codebaseEnabled, setCodebaseEnabled] = useState(false);

  // Synthesize modal state - two-step flow
  const [synthesizeMode, setSynthesizeMode] = useState<SynthesizeMode>('task');
  const [isSynthesizePromptOpen, setIsSynthesizePromptOpen] = useState(false);
  const [isSynthesizePreviewOpen, setIsSynthesizePreviewOpen] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedTitle, setSynthesizedTitle] = useState('');
  const [synthesizedContent, setSynthesizedContent] = useState('');
  const [synthesizedSummary, setSynthesizedSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch session and messages
  useEffect(() => {
    if (isAuthenticated && sessionId) {
      fetchSession();
      fetchMessages();
    }
  }, [isAuthenticated, sessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchSession = async () => {
    // Session info is returned with messages
  };

  const fetchMessages = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAgentMessages(sessionId);
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      const response = await api.chatWithAgent(sessionId, userMessage.content, {
        searchEnabled,
        thinkingEnabled,
        codebaseEnabled,
      });

      // Check if the response contains a build prompt
      const buildPrompt = extractBuildPrompt(response.message);

      const assistantMessage: Message = {
        id: response.messageId || `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        createdAt: new Date().toISOString(),
        toolCalls: response.toolCalls,
        buildPrompt,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
      // Remove the optimistic user message
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setInput(userMessage.content);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const extractBuildPrompt = (content: string): Message['buildPrompt'] | undefined => {
    // Look for build prompt markers in the response
    const buildPromptMatch = content.match(/\[BUILD_PROMPT\]([\s\S]*?)\[\/BUILD_PROMPT\]/);
    const titleMatch = content.match(/\[BUILD_TITLE\](.*?)\[\/BUILD_TITLE\]/);

    if (buildPromptMatch) {
      return {
        title: titleMatch?.[1] || 'Build from Research',
        prompt: buildPromptMatch[1].trim(),
      };
    }
    return undefined;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddToTodo = async (buildPrompt: Message['buildPrompt']) => {
    if (!buildPrompt) return;

    try {
      await api.createTask(projectId, {
        title: buildPrompt.title,
        description: buildPrompt.prompt,
        status: 'todo',
      });
      toast.success(`Task "${buildPrompt.title}" added to Todo`);
    } catch (error) {
      console.error('Failed to create task:', error);
      toast.error('Failed to add task');
    }
  };

  const handleCreateTaskFromMessage = async (content: string) => {
    try {
      // Generate a short title from the content
      const title = content.length > 50
        ? content.substring(0, 50).trim() + '...'
        : content.substring(0, 50).trim();

      await api.createTask(projectId, {
        title: `Research: ${title}`,
        description: content,
        status: 'todo',
      });
      toast.success('Task created in Kanban board!', {
        description: 'Check your Todo column',
      });
    } catch (error) {
      console.error('Failed to create task:', error);
      toast.error('Failed to create task');
    }
  };

  const handleSaveAsNote = async (content: string) => {
    try {
      // Generate a title from the first line or first 40 chars
      const firstLine = content.split('\n')[0].trim();
      const title = firstLine.length > 40
        ? `${firstLine.substring(0, 40).trim()}...`
        : firstLine || 'Research Note';

      // Create the page
      const page = await api.createPage(projectId, {
        title,
        type: 'document',
      });

      // Add the content as paragraphs in BlockNote format
      if (page.page?.id) {
        const paragraphs = content.split('\n\n').filter((p: string) => p.trim());
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i].trim();
          await api.createBlock(page.page.id, {
            type: 'paragraph',
            content: {
              blockNoteBlock: {
                type: 'paragraph',
                props: {},
                content: [{ type: 'text', text: paragraph }],
                children: [],
              },
              props: {},
              content: [{ type: 'text', text: paragraph }],
              children: [],
            },
            order: i,
          });
        }
      }

      toast.success('Saved to Notes!', {
        description: 'Check your Pages section',
      });
    } catch (error) {
      console.error('Failed to save note:', error);
      toast.error('Failed to save note');
    }
  };

  const handleBack = () => {
    router.push(`/project/${projectId}`);
  };

  // Open synthesize modal with mode
  const handleOpenSynthesize = (mode: SynthesizeMode) => {
    setSynthesizeMode(mode);
    setIsSynthesizePromptOpen(true);
  };

  // Step 1: User enters prompt, then we synthesize
  const handleSynthesizeSubmit = async (userPrompt: string) => {
    setIsSynthesizing(true);

    try {
      const result = await api.synthesizeWithCustomPrompt(sessionId, userPrompt, synthesizeMode);
      setSynthesizedTitle(result.title || (synthesizeMode === 'task' ? 'New Task' : 'New Note'));
      setSynthesizedContent(result.content || '');
      setSynthesizedSummary(result.summary || '');

      // Close prompt modal, open preview modal
      setIsSynthesizePromptOpen(false);
      setIsSynthesizePreviewOpen(true);
    } catch (error) {
      console.error('Failed to synthesize:', error);
      toast.error('Failed to generate content. Please try again.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Step 2: User confirms and submits
  const handleConfirmSubmit = async () => {
    if (!synthesizedContent.trim()) {
      toast.error('No content to submit');
      return;
    }

    setIsSubmitting(true);

    try {
      if (synthesizeMode === 'task') {
        // Create task in kanban
        await api.createTask(projectId, {
          title: synthesizedTitle,
          description: synthesizedContent,
          status: 'todo',
        });
        toast.success(`Task "${synthesizedTitle}" created!`);
      } else {
        // Create page/note
        const page = await api.createPage(projectId, {
          title: synthesizedTitle,
          type: 'document',
        });
        if (page.page?.id) {
          const paragraphs = synthesizedContent.split('\n\n').filter((p: string) => p.trim());
          for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i].trim();
            await api.createBlock(page.page.id, {
              type: 'paragraph',
              content: {
                blockNoteBlock: {
                  type: 'paragraph',
                  props: {},
                  content: [{ type: 'text', text: paragraph }],
                  children: [],
                },
                props: {},
                content: [{ type: 'text', text: paragraph }],
                children: [],
              },
              order: i,
            });
          }
        }
        toast.success(`Note "${synthesizedTitle}" saved!`);
      }

      // Reset state
      setIsSynthesizePreviewOpen(false);
      setSynthesizedTitle('');
      setSynthesizedContent('');
      setSynthesizedSummary('');
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error(`Failed to create ${synthesizeMode}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Go back to prompt to refine
  const handleBackToPrompt = () => {
    setIsSynthesizePreviewOpen(false);
    setIsSynthesizePromptOpen(true);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 flex items-center gap-4 px-4 py-3 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">Research Chat</h1>
          <p className="text-xs text-muted-foreground">
            {messages.length} messages
          </p>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <WelcomeMessage />
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onAddToTodo={handleAddToTodo}
                onCreateTask={handleCreateTaskFromMessage}
                onSaveAsNote={handleSaveAsNote}
              />
            ))
          )}

          {isSending && <ThinkingIndicator />}
        </div>
      </ScrollArea>

      {/* Input area with controls */}
      <div className="border-t bg-card">
        <div className="max-w-3xl mx-auto">
          {/* Controls bar - Modes on left, Actions on right */}
          <div className="flex items-center justify-between px-4 py-2 border-b">
            {/* Mode toggles - Left side */}
            <div className="flex items-center gap-2">
              <Toggle
                pressed={searchEnabled}
                onPressedChange={setSearchEnabled}
                size="sm"
                className={cn(
                  'gap-1.5 data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-600 dark:data-[state=on]:text-blue-400',
                  'hover:bg-blue-500/10'
                )}
                aria-label="Toggle web search"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="text-xs">Search</span>
              </Toggle>
              <Toggle
                pressed={codebaseEnabled}
                onPressedChange={setCodebaseEnabled}
                size="sm"
                className={cn(
                  'gap-1.5 data-[state=on]:bg-green-500/20 data-[state=on]:text-green-600 dark:data-[state=on]:text-green-400',
                  'hover:bg-green-500/10'
                )}
                aria-label="Toggle codebase analysis"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span className="text-xs">Codebase</span>
              </Toggle>
              <Toggle
                pressed={thinkingEnabled}
                onPressedChange={setThinkingEnabled}
                size="sm"
                className={cn(
                  'gap-1.5 data-[state=on]:bg-purple-500/20 data-[state=on]:text-purple-600 dark:data-[state=on]:text-purple-400',
                  'hover:bg-purple-500/10'
                )}
                aria-label="Toggle extended thinking"
              >
                <Brain className="h-3.5 w-3.5" />
                <span className="text-xs">Thinking</span>
              </Toggle>
            </div>

            {/* Action buttons - Right side */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenSynthesize('task')}
                disabled={isSynthesizing || isSubmitting || messages.length < 2}
                className="gap-1.5"
              >
                <ListTodo className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs">Create Task</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenSynthesize('note')}
                disabled={isSynthesizing || isSubmitting || messages.length < 2}
                className="gap-1.5"
              >
                <FileText className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs">Save as Note</span>
              </Button>
            </div>
          </div>

          {/* Message input */}
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                placeholder={
                  codebaseEnabled && searchEnabled
                    ? "Ask about your project... I'll analyze your code and search the web"
                    : codebaseEnabled
                    ? "Ask about your project... I'll analyze your codebase"
                    : searchEnabled
                    ? "Ask about what you want to build... I'll search the web for current info"
                    : "Quick chat - no web search, faster responses"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] max-h-[200px] resize-none"
                disabled={isSending}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                size="icon"
                className="h-[60px] w-[60px]"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Prompt Modal - User enters their instructions */}
      <SynthesizeModal
        isOpen={isSynthesizePromptOpen}
        onClose={() => setIsSynthesizePromptOpen(false)}
        mode={synthesizeMode}
        sessionTitle={`Research Chat (${messages.length} messages)`}
        onSubmit={handleSynthesizeSubmit}
        isLoading={isSynthesizing}
      />

      {/* Step 2: Preview Modal - Review generated content */}
      <Dialog open={isSynthesizePreviewOpen} onOpenChange={setIsSynthesizePreviewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {synthesizeMode === 'task' ? (
                <ListTodo className="h-5 w-5 text-blue-500" />
              ) : (
                <FileText className="h-5 w-5 text-green-500" />
              )}
              Review {synthesizeMode === 'task' ? 'Task' : 'Note'}
            </DialogTitle>
            <DialogDescription>
              Review and edit the generated content before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Summary */}
            {synthesizedSummary && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Summary:</p>
                <p className="text-sm">{synthesizedSummary}</p>
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="preview-title">Title</Label>
              <Input
                id="preview-title"
                value={synthesizedTitle}
                onChange={(e) => setSynthesizedTitle(e.target.value)}
                placeholder="Enter a title"
              />
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="preview-content">Content</Label>
              <Textarea
                id="preview-content"
                value={synthesizedContent}
                onChange={(e) => setSynthesizedContent(e.target.value)}
                placeholder="Enter content"
                className="min-h-[200px] resize-none"
              />
            </div>

            <div className="text-xs text-muted-foreground">
              Generated from {messages.length} messages in this research session
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleBackToPrompt}
              disabled={isSubmitting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Refine
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsSynthesizePreviewOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSubmit}
              disabled={isSubmitting || !synthesizedContent.trim()}
              className={synthesizeMode === 'task' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {synthesizeMode === 'task' ? 'Create Task' : 'Save Note'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WelcomeMessage() {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 mb-4">
        <Sparkles className="h-8 w-8 text-violet-500" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Start Your Research</h2>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        Chat about what you want to build. When you're ready, ask me to
        &quot;create a build prompt&quot; and I&apos;ll synthesize our conversation
        into an actionable task.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <SuggestionChip text="I want to build a landing page" />
        <SuggestionChip text="Help me design a dashboard" />
        <SuggestionChip text="Research best practices for forms" />
      </div>
    </div>
  );
}

function SuggestionChip({ text }: { text: string }) {
  return (
    <button className="px-3 py-1.5 text-sm rounded-full border bg-card hover:bg-accent transition-colors">
      {text}
    </button>
  );
}

interface ChatMessageProps {
  message: Message;
  onAddToTodo: (buildPrompt: Message['buildPrompt']) => void;
  onCreateTask: (content: string) => void;
  onSaveAsNote: (content: string) => void;
}

function ChatMessage({ message, onAddToTodo, onCreateTask, onSaveAsNote }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateTask = () => {
    onCreateTask(message.content);
    setTaskCreated(true);
    setTimeout(() => setTaskCreated(false), 3000);
  };

  const handleSaveNote = () => {
    onSaveAsNote(message.content);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 3000);
  };

  const isUser = message.role === 'user';

  return (
    <div
      className={cn('flex gap-3', isUser && 'flex-row-reverse')}
      data-testid={`message-${message.role}`}
      data-role={message.role}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
        )}
      >
        {isUser ? 'U' : <Sparkles className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0', isUser && 'text-right')}>
        <div
          className={cn(
            'inline-block rounded-2xl px-4 py-2 max-w-[85%] text-left',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          )}
        >
          {/* Tool calls indicator */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {message.toolCalls.map((tool, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300"
                >
                  <Search className="h-3 w-3" />
                  {tool.name}
                </span>
              ))}
            </div>
          )}

          {/* Message content */}
          <p className="whitespace-pre-wrap">{message.content}</p>

          {/* Build prompt card */}
          {message.buildPrompt && (
            <BuildPromptCard
              buildPrompt={message.buildPrompt}
              onAddToTodo={() => onAddToTodo(message.buildPrompt)}
            />
          )}
        </div>

        {/* Action buttons for assistant messages */}
        {!isUser && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-500" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>

            {/* Create Task button */}
            <button
              onClick={handleCreateTask}
              disabled={taskCreated}
              className="text-xs text-muted-foreground hover:text-orange-500 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {taskCreated ? (
                <>
                  <Check className="h-3 w-3 text-green-500" /> Task Created
                </>
              ) : (
                <>
                  <ListTodo className="h-3 w-3" /> Create Task
                </>
              )}
            </button>

            {/* Save as Note button */}
            <button
              onClick={handleSaveNote}
              disabled={noteSaved}
              className="text-xs text-muted-foreground hover:text-blue-500 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {noteSaved ? (
                <>
                  <Check className="h-3 w-3 text-green-500" /> Note Saved
                </>
              ) : (
                <>
                  <FileText className="h-3 w-3" /> Save as Note
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface BuildPromptCardProps {
  buildPrompt: NonNullable<Message['buildPrompt']>;
  onAddToTodo: () => void;
}

function BuildPromptCard({ buildPrompt, onAddToTodo }: BuildPromptCardProps) {
  const [added, setAdded] = useState(false);

  const handleClick = () => {
    onAddToTodo();
    setAdded(true);
  };

  return (
    <Card className="mt-3 p-3 border-2 border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5">
      <div className="flex items-start gap-2">
        <Hammer className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{buildPrompt.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
            {buildPrompt.prompt}
          </p>
          <Button
            size="sm"
            onClick={handleClick}
            disabled={added}
            className="mt-2"
          >
            {added ? (
              <>
                <Check className="mr-1 h-3 w-3" />
                Added to Todo
              </>
            ) : (
              <>
                <Plus className="mr-1 h-3 w-3" />
                Add to Todo
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

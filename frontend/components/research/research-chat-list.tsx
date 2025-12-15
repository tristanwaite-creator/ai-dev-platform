'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Plus,
  Search,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Loader2,
  ListTodo,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

export interface ResearchSession {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'archived';
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ResearchChatListProps {
  projectId: string;
  sessions: ResearchSession[];
  onCreateSession: () => Promise<string>;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  onCreateTask?: (sessionId: string, sessionTitle: string) => void | Promise<void>;
  onSaveAsNote?: (sessionId: string, sessionTitle: string) => void | Promise<void>;
  isLoading?: boolean;
}

export function ResearchChatList({
  projectId,
  sessions,
  onCreateSession,
  onDeleteSession,
  onCreateTask,
  onSaveAsNote,
  isLoading = false,
}: ResearchChatListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateSession = async () => {
    console.log('[ResearchChatList] Creating new session...');
    setIsCreating(true);
    try {
      const sessionId = await onCreateSession();
      console.log('[ResearchChatList] Session created:', sessionId);
      const targetUrl = `/project/${projectId}/research/${sessionId}`;
      console.log('[ResearchChatList] Navigating to:', targetUrl);
      router.push(targetUrl);
      console.log('[ResearchChatList] Navigation called');
    } catch (error) {
      console.error('[ResearchChatList] Failed to create research session:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenSession = (sessionId: string) => {
    router.push(`/project/${projectId}/research/${sessionId}`);
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border">
      {/* Header */}
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-violet-500" />
            <span className="font-medium">Research</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {sessions.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* New Chat Button */}
        <Button
          onClick={handleCreateSession}
          disabled={isCreating}
          size="sm"
          className="w-full"
        >
          {isCreating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          New Research Chat
        </Button>
      </div>

      {/* Chat Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No chats match your search' : 'No research chats yet'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Start a new chat to research your ideas
              </p>
            </div>
          ) : (
            filteredSessions.map((session) => (
              <ResearchChatItem
                key={session.id}
                session={session}
                onClick={() => handleOpenSession(session.id)}
                onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
                onCreateTask={onCreateTask ? () => onCreateTask(session.id, session.title) : undefined}
                onSaveAsNote={onSaveAsNote ? () => onSaveAsNote(session.id, session.title) : undefined}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ResearchChatItemProps {
  session: ResearchSession;
  onClick: () => void;
  onDelete?: () => void;
  onCreateTask?: () => void;
  onSaveAsNote?: () => void;
}

function ResearchChatItem({ session, onClick, onDelete, onCreateTask, onSaveAsNote }: ResearchChatItemProps) {
  const hasActions = onDelete || onCreateTask || onSaveAsNote;

  return (
    <div
      className={cn(
        'group flex items-center gap-2 p-2 rounded-md cursor-pointer',
        'hover:bg-accent transition-colors',
        session.status === 'completed' && 'opacity-70'
      )}
      onClick={onClick}
    >
      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{session.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
          {session.messageCount !== undefined && ` · ${session.messageCount} messages`}
        </p>
      </div>

      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onCreateTask && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateTask();
                }}
              >
                <ListTodo className="mr-2 h-4 w-4 text-blue-500" />
                Create Task
              </DropdownMenuItem>
            )}
            {onSaveAsNote && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveAsNote();
                }}
              >
                <FileText className="mr-2 h-4 w-4 text-green-500" />
                Save as Note
              </DropdownMenuItem>
            )}
            {onDelete && (onCreateTask || onSaveAsNote) && (
              <DropdownMenuSeparator />
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

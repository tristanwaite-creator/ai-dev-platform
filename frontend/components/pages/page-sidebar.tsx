'use client';

import { useState } from 'react';
import { usePages } from '@/providers/pages-provider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Folder,
  Plus,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Page } from '@/lib/types/pages';

interface PageSidebarProps {
  projectId: string;
}

interface PageTreeItemProps {
  page: Page;
  level: number;
  onSelect: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  selectedPageId: string | null;
  children?: Page[];
}

function PageTreeItem({
  page,
  level,
  onSelect,
  onDelete,
  selectedPageId,
  children = [],
}: PageTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = children.length > 0;
  const isSelected = selectedPageId === page.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
          isSelected ? 'bg-accent' : ''
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Expand/collapse button for folders */}
        {page.type === 'folder' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 shrink-0 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        )}

        {/* Icon */}
        <div className="shrink-0">
          {page.type === 'folder' ? (
            <Folder className="h-4 w-4 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Title - clickable */}
        <button
          onClick={() => page.type === 'document' && onSelect(page.id)}
          className="flex-1 truncate text-left hover:text-foreground"
        >
          {page.icon && <span className="mr-1">{page.icon}</span>}
          {page.title}
        </button>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 p-0 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDelete(page.id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Render children if expanded */}
      {isExpanded && hasChildren && (
        <div>
          {children.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              level={level + 1}
              onSelect={onSelect}
              onDelete={onDelete}
              selectedPageId={selectedPageId}
              children={[]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PageSidebar({ projectId }: PageSidebarProps) {
  const { pages, currentPage, createPage, deletePage, selectPage } = usePages();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreatePage = async () => {
    setIsCreating(true);
    try {
      const newPage = await createPage(projectId, {
        title: 'Untitled',
        type: 'document',
      });
      await selectPage(newPage.id);
      toast.success('Page created');
    } catch (error) {
      toast.error('Failed to create page');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFolder = async () => {
    setIsCreating(true);
    try {
      await createPage(projectId, {
        title: 'New Folder',
        type: 'folder',
      });
      toast.success('Folder created');
    } catch (error) {
      toast.error('Failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (pageId: string) => {
    try {
      await deletePage(pageId);
      toast.success('Page deleted');
    } catch (error) {
      toast.error('Failed to delete page');
    }
  };

  const handleSelect = async (pageId: string) => {
    try {
      await selectPage(pageId);
    } catch (error) {
      toast.error('Failed to load page');
    }
  };

  // Build tree structure
  const rootPages = pages.filter((p) => !p.parentId);
  const getChildren = (parentId: string) =>
    pages.filter((p) => p.parentId === parentId);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Pages</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              disabled={isCreating}
              className="h-8 gap-1"
            >
              <Plus className="h-4 w-4" />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCreatePage}>
              <FileText className="mr-2 h-4 w-4" />
              New Page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCreateFolder}>
              <Folder className="mr-2 h-4 w-4" />
              New Folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Page tree */}
      <ScrollArea className="flex-1 px-2 py-2">
        {rootPages.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No pages yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {rootPages.map((page) => (
              <PageTreeItem
                key={page.id}
                page={page}
                level={0}
                onSelect={handleSelect}
                onDelete={handleDelete}
                selectedPageId={currentPage?.id || null}
                children={getChildren(page.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

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
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Page } from '@/lib/types/pages';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PageSidebarProps {
  projectId: string;
}

interface PageTreeItemProps {
  page: Page;
  level: number;
  onSelect: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onCreateInFolder: (folderId: string, type: 'document' | 'folder') => void;
  selectedPageId: string | null;
  allPages: Page[];
  isDragging?: boolean;
}

function SortablePageTreeItem(props: PageTreeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <PageTreeItem {...props} isDragging={isDragging} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

interface PageTreeItemInnerProps extends PageTreeItemProps {
  dragHandleProps?: Record<string, unknown>;
}

function PageTreeItem({
  page,
  level,
  onSelect,
  onDelete,
  onCreateInFolder,
  selectedPageId,
  allPages,
  isDragging,
  dragHandleProps,
}: PageTreeItemInnerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Get children from all pages
  const children = allPages.filter((p) => p.parentId === page.id);
  const isSelected = selectedPageId === page.id;
  const isFolder = page.type === 'folder';

  const handleClick = () => {
    if (isFolder) {
      // Folders: toggle expand/collapse
      setIsExpanded(!isExpanded);
    } else {
      // Documents: select and load
      onSelect(page.id);
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer ${
          isSelected ? 'bg-accent' : ''
        } ${isDragging ? 'ring-2 ring-primary' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {/* Drag handle */}
        <div
          className="h-4 w-4 shrink-0 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-50 hover:!opacity-100"
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </div>

        {/* Expand/collapse indicator for folders */}
        {isFolder ? (
          <div className="h-4 w-4 shrink-0 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </div>
        ) : null}

        {/* Icon */}
        <div className="shrink-0">
          {isFolder ? (
            <Folder className={`h-4 w-4 ${isExpanded ? 'text-amber-500' : 'text-muted-foreground'}`} />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Title */}
        <span className="flex-1 truncate">
          {page.icon && <span className="mr-1">{page.icon}</span>}
          {page.title}
        </span>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 p-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {isFolder && (
              <>
                <DropdownMenuItem onClick={() => onCreateInFolder(page.id, 'document')}>
                  <FileText className="mr-2 h-4 w-4" />
                  New Page Inside
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCreateInFolder(page.id, 'folder')}>
                  <Folder className="mr-2 h-4 w-4" />
                  New Folder Inside
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => onDelete(page.id)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Render children if expanded (recursive) */}
      {isExpanded && (
        <div>
          {children.length === 0 ? (
            <div
              className="text-xs text-muted-foreground italic py-1"
              style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
            >
              Empty folder
            </div>
          ) : (
            <SortableContext
              items={children.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {children.map((child) => (
                <SortablePageTreeItem
                  key={child.id}
                  page={child}
                  level={level + 1}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onCreateInFolder={onCreateInFolder}
                  selectedPageId={selectedPageId}
                  allPages={allPages}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}

export function PageSidebar({ projectId }: PageSidebarProps) {
  const { pages, currentPage, createPage, deletePage, selectPage, movePage } = usePages();
  const [isCreating, setIsCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before starting drag
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activePageId = active.id as string;
    const overPageId = over.id as string;

    // Find the pages
    const activePage = pages.find((p) => p.id === activePageId);
    const overPage = pages.find((p) => p.id === overPageId);

    if (!activePage || !overPage) return;

    // If dropping on same parent level, reorder
    if (activePage.parentId === overPage.parentId) {
      try {
        // Calculate new order based on position
        const siblings = pages
          .filter((p) => p.parentId === activePage.parentId)
          .sort((a, b) => a.order - b.order);

        const overIndex = siblings.findIndex((p) => p.id === overPageId);
        const newOrder = overIndex >= 0 ? overIndex : 0;

        await movePage(activePageId, activePage.parentId, newOrder);
        toast.success('Page reordered');
      } catch (error) {
        toast.error('Failed to reorder');
      }
    }
    // If dropping on a folder, move into it
    else if (overPage.type === 'folder') {
      try {
        await movePage(activePageId, overPageId, 0);
        toast.success('Moved to folder');
      } catch (error) {
        toast.error('Failed to move');
      }
    }
  };

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

  const handleCreateInFolder = async (folderId: string, type: 'document' | 'folder') => {
    setIsCreating(true);
    try {
      const newPage = await createPage(projectId, {
        title: type === 'folder' ? 'New Folder' : 'Untitled',
        type,
        parentId: folderId,
      });
      if (type === 'document') {
        await selectPage(newPage.id);
      }
      toast.success(type === 'folder' ? 'Folder created' : 'Page created');
    } catch (error) {
      toast.error(`Failed to create ${type}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (pageId: string) => {
    try {
      await deletePage(pageId);
      toast.success('Deleted');
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const handleSelect = async (pageId: string) => {
    try {
      await selectPage(pageId);
    } catch (error) {
      toast.error('Failed to load page');
    }
  };

  // Get root pages (no parent)
  const rootPages = pages.filter((p) => !p.parentId).sort((a, b) => a.order - b.order);

  // Find active page for drag overlay
  const activePage = activeId ? pages.find((p) => p.id === activeId) : null;

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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={rootPages.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {rootPages.map((page) => (
                  <SortablePageTreeItem
                    key={page.id}
                    page={page}
                    level={0}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                    onCreateInFolder={handleCreateInFolder}
                    selectedPageId={currentPage?.id || null}
                    allPages={pages}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activePage ? (
                <div className="rounded-md bg-background px-2 py-1.5 text-sm shadow-lg ring-2 ring-primary">
                  <div className="flex items-center gap-2">
                    {activePage.type === 'folder' ? (
                      <Folder className="h-4 w-4 text-amber-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{activePage.title}</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  );
}

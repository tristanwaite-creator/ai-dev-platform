'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent as DndKitDragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

// Types
export type DragEndEvent = DndKitDragEndEvent;

interface KanbanColumn {
  id: string;
  name: string;
  color?: string;
}

export interface KanbanItem {
  id: string;
  name: string;
  column: string;
  [key: string]: unknown;
}

interface KanbanContextValue {
  columns: KanbanColumn[];
  data: KanbanItem[];
  activeId: string | null;
  activeItem: KanbanItem | null;
  setActiveId: (id: string | null) => void;
  moveItem: (itemId: string, newColumn: string) => void;
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

function useKanban() {
  const context = useContext(KanbanContext);
  if (!context) {
    throw new Error('useKanban must be used within a KanbanProvider');
  }
  return context;
}

// Provider
interface KanbanProviderProps<T extends KanbanItem = KanbanItem> {
  columns: KanbanColumn[];
  data: T[];
  onDataChange?: (data: T[]) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  children: (column: KanbanColumn) => React.ReactNode;
  className?: string;
}

export function KanbanProvider<T extends KanbanItem = KanbanItem>({
  columns,
  data,
  onDataChange,
  onDragEnd,
  children,
  className,
}: KanbanProviderProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState(data);

  // Sync items with props
  React.useEffect(() => {
    setItems(data);
  }, [data]);

  const activeItem = activeId ? items.find((item) => item.id === activeId) || null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const moveItem = useCallback(
    (itemId: string, newColumn: string) => {
      setItems((prev) => {
        const newItems = prev.map((item) =>
          item.id === itemId ? { ...item, column: newColumn } : item
        );
        onDataChange?.(newItems as T[]);
        return newItems;
      });
    },
    [onDataChange]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeItem = items.find((item) => item.id === activeId);
    if (!activeItem) return;

    // Check if we're over a column
    const overColumn = columns.find((col) => col.id === overId);
    if (overColumn && activeItem.column !== overId) {
      moveItem(activeId, overId);
      return;
    }

    // Check if we're over another item
    const overItem = items.find((item) => item.id === overId);
    if (overItem && activeItem.column !== overItem.column) {
      moveItem(activeId, overItem.column);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    onDragEnd?.(event);
  };

  return (
    <KanbanContext.Provider
      value={{
        columns,
        data: items,
        activeId,
        activeItem,
        setActiveId,
        moveItem,
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={cn('flex gap-4 overflow-x-auto', className)}>
          {columns.map((column) => children(column))}
        </div>
        <DragOverlay>
          {activeItem ? (
            <div className="rounded-lg border bg-card p-3 shadow-lg opacity-80">
              <p className="text-sm font-medium">{activeItem.name}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </KanbanContext.Provider>
  );
}

// Board (Column wrapper)
interface KanbanBoardProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

export function KanbanBoard({ id, children, className }: KanbanBoardProps) {
  const { data } = useKanban();
  const columnItems = data.filter((item) => item.column === id);
  const itemIds = columnItems.map((item) => item.id);

  return (
    <div
      className={cn(
        'flex min-w-[280px] flex-col rounded-lg bg-muted/30',
        className
      )}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

// Header
interface KanbanHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function KanbanHeader({ children, className }: KanbanHeaderProps) {
  return (
    <div className={cn('px-3 py-2 text-sm font-medium', className)}>
      {children}
    </div>
  );
}

// Cards container
interface KanbanCardsProps<T> {
  id: string;
  children: (item: T) => React.ReactNode;
  className?: string;
}

export function KanbanCards<T extends KanbanItem>({
  id,
  children,
  className,
}: KanbanCardsProps<T>) {
  const { data } = useKanban();
  const columnItems = data.filter((item) => item.column === id) as T[];

  return (
    <div className={cn('flex-1 space-y-2 p-2', className)}>
      {columnItems.map((item) => children(item))}
    </div>
  );
}

// Sortable card wrapper (internal)
interface SortableCardProps {
  id: string;
  children: React.ReactNode;
}

function SortableCard({ id, children }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

// KanbanCard - a styled card for individual items
interface KanbanCardProps {
  id: string;
  name: string;
  column: string;
  children: React.ReactNode;
  className?: string;
}

export function KanbanCard({ id, name, column, children, className }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-shadow',
        className
      )}
    >
      {children}
    </div>
  );
}

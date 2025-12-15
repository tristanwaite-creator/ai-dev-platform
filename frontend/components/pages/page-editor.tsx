'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { usePages } from '@/providers/pages-provider';
import { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/mantine/style.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { Block } from '@/lib/types/pages';

interface PageEditorProps {
  className?: string;
}

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Transform database blocks to BlockNote format
function blocksToBlockNote(blocks: Block[]): PartialBlock[] {
  if (!blocks || blocks.length === 0) {
    return [
      {
        type: 'paragraph',
        content: '',
      } as PartialBlock,
    ];
  }

  return blocks.map((block) => ({
    id: block.id,
    type: block.type as any,
    props: block.content.props || {},
    content: block.content.content || '',
    children: (block.content.children || []) as any,
  } as PartialBlock));
}

// Transform BlockNote format to database blocks
function blockNoteToBlocks(blocks: PartialBlock[]): Array<{ type: string; content: Record<string, unknown> }> {
  return blocks.map((block) => ({
    type: (block as any).type || 'paragraph',
    content: {
      props: (block as any).props || {},
      content: (block as any).content || '',
      children: (block as any).children || [],
    },
  }));
}

export function PageEditor({ className }: PageEditorProps) {
  const { currentPage, updatePage, isSaving } = usePages();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [isSavingBlocks, setIsSavingBlocks] = useState(false);

  // Initialize title when page changes
  useEffect(() => {
    if (currentPage) {
      setTitle(currentPage.title);
    }
  }, [currentPage?.id]);

  // Create BlockNote editor
  const editor = useCreateBlockNote({
    initialContent: currentPage?.blocks
      ? blocksToBlockNote(currentPage.blocks)
      : undefined,
  });

  // Debounced save function for blocks
  const saveBlocks = useMemo(
    () =>
      debounce(async (blocks: PartialBlock[], pageId: string) => {
        setIsSavingBlocks(true);
        try {
          const transformedBlocks = blockNoteToBlocks(blocks);
          await api.updateBlocks(pageId, transformedBlocks);
        } catch (error) {
          console.error('Failed to save blocks:', error);
        } finally {
          setIsSavingBlocks(false);
        }
      }, 1000),
    []
  );

  // Update editor content when page changes
  useEffect(() => {
    if (!currentPage || !editor) return;

    const blocks = currentPage.blocks
      ? blocksToBlockNote(currentPage.blocks)
      : ([{ type: 'paragraph', content: '' }] as PartialBlock[]);

    editor.replaceBlocks(editor.document, blocks as any);
  }, [currentPage?.id]);

  // Handle editor changes
  const handleEditorChange = useCallback(() => {
    if (!currentPage?.id) return;
    const blocks = editor.document;
    saveBlocks(blocks, currentPage.id);
  }, [currentPage?.id, editor, saveBlocks]);

  const handleTitleSave = async () => {
    if (!currentPage || !title.trim()) return;

    try {
      await updatePage(currentPage.id, { title: title.trim() });
      setIsEditingTitle(false);
      toast.success('Title updated');
    } catch (error) {
      toast.error('Failed to update title');
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setTitle(currentPage?.title || '');
      setIsEditingTitle(false);
    }
  };

  if (!currentPage) {
    return (
      <div className={`flex h-full items-center justify-center ${className}`}>
        <div className="text-center text-muted-foreground">
          <FileText className="mx-auto mb-2 h-12 w-12 opacity-20" />
          <p>Select a page to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Page header */}
      <div className="border-b px-8 py-4">
        <div className="flex items-center justify-between">
          {isEditingTitle ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="text-2xl font-bold"
              autoFocus
            />
          ) : (
            <h1
              className="flex-1 cursor-pointer text-2xl font-bold hover:text-muted-foreground"
              onClick={() => setIsEditingTitle(true)}
            >
              {currentPage.icon && <span className="mr-2">{currentPage.icon}</span>}
              {currentPage.title}
            </h1>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {(isSaving || isSavingBlocks) && (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* BlockNote Editor */}
      <div className="flex-1 overflow-auto px-8 py-4">
        <BlockNoteView
          editor={editor}
          onChange={handleEditorChange}
          theme="light"
          className="blocknote-editor"
        />
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { FileTree } from './file-tree';
import { CodeEditor, getLanguageFromExtension } from './code-editor';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Panel as ResizablePanel,
  PanelGroup as ResizablePanelGroup,
  PanelResizeHandle as ResizableHandle,
} from 'react-resizable-panels';
import { X, File, Loader2, AlertCircle } from 'lucide-react';

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
}

interface EditorPanelProps {
  projectId: string;
}

export function EditorPanel({ projectId }: EditorPanelProps) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (path: string) => {
    // Check if file is already open
    const existingFile = openFiles.find((f) => f.path === path);
    if (existingFile) {
      setActiveFile(path);
      return;
    }

    // Load file content
    setLoadingFile(path);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/projects/${projectId}/sandbox/file?path=${encodeURIComponent(path)}`,
        {
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load file');
      }

      const data = await response.json();
      const fileName = path.split('/').pop() || 'untitled';
      const language = getLanguageFromExtension(fileName);

      const newFile: OpenFile = {
        path,
        name: fileName,
        content: data.content || '',
        language,
      };

      setOpenFiles((prev) => [...prev, newFile]);
      setActiveFile(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setLoadingFile(null);
    }
  };

  const handleCloseFile = (path: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== path));

    if (activeFile === path) {
      // Switch to another file if available
      const remainingFiles = openFiles.filter((f) => f.path !== path);
      setActiveFile(remainingFiles.length > 0 ? remainingFiles[0].path : null);
    }
  };

  const activeFileData = openFiles.find((f) => f.path === activeFile);

  return (
    <div className="h-full flex flex-col border rounded-lg overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        {/* File Tree Sidebar */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
          <div className="h-full border-r bg-muted/30">
            <div className="p-3 border-b bg-background">
              <h3 className="text-sm font-medium">Files</h3>
            </div>
            <FileTree
              projectId={projectId}
              onFileSelect={handleFileSelect}
              selectedFile={activeFile}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Editor Area */}
        <ResizablePanel defaultSize={80}>
          <div className="h-full flex flex-col">
            {openFiles.length > 0 ? (
              <>
                {/* Tabs for open files */}
                <div className="border-b bg-muted/30">
                  <ScrollArea>
                    <div className="flex items-center min-w-0">
                      {openFiles.map((file) => (
                        <div
                          key={file.path}
                          className={`flex items-center gap-2 px-3 py-2 border-r text-sm cursor-pointer hover:bg-accent transition-colors ${
                            activeFile === file.path
                              ? 'bg-background'
                              : 'bg-muted/30'
                          }`}
                          onClick={() => setActiveFile(file.path)}
                        >
                          <File className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate max-w-[150px]">
                            {file.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0 hover:bg-background"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCloseFile(file.path);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Editor */}
                <div className="flex-1 relative">
                  {loadingFile && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {error && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-10">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">{error}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-2"
                        onClick={() => setError(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}

                  {activeFileData ? (
                    <CodeEditor
                      value={activeFileData.content}
                      language={activeFileData.language}
                      readOnly
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-sm text-muted-foreground">
                        Select a file to view
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <File className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No files open
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Select a file from the tree to view
                  </p>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

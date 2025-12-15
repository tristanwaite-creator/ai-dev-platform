'use client';

import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface FileTreeProps {
  projectId: string;
  onFileSelect?: (path: string) => void;
  selectedFile?: string | null;
}

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
    case 'go':
    case 'rs':
      return FileCode;
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return FileJson;
    case 'md':
    case 'txt':
    case 'log':
      return FileText;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return ImageIcon;
    default:
      return File;
  }
};

function FileTreeNode({
  node,
  depth = 0,
  onSelect,
  selectedFile,
}: {
  node: FileNode;
  depth?: number;
  onSelect: (path: string) => void;
  selectedFile?: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(depth === 0);

  const isSelected = selectedFile === node.path;
  const Icon =
    node.type === 'directory'
      ? isExpanded
        ? FolderOpen
        : Folder
      : getFileIcon(node.name);

  const handleClick = () => {
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center gap-1 w-full text-left px-2 py-1 text-sm hover:bg-accent rounded-sm transition-colors',
          isSelected && 'bg-accent'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'directory' && (
          <span className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
        <Icon
          className={cn(
            'h-4 w-4 flex-shrink-0',
            node.type === 'directory'
              ? 'text-blue-500 dark:text-blue-400'
              : 'text-muted-foreground'
          )}
        />
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ projectId, onFileSelect, selectedFile }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'}/projects/${projectId}/sandbox/files`,
        {
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load files');
      }

      const data = await response.json();
      const fileTree = buildFileTree(data.files || []);
      setTree(fileTree);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (files: string[]): FileNode[] => {
    const root: FileNode[] = [];
    const nodeMap = new Map<string, FileNode>();

    // Sort files to ensure directories come before their contents
    files.sort();

    files.forEach((filePath) => {
      // Remove leading slash and /home/user prefix if present
      const cleanPath = filePath
        .replace(/^\/home\/user\//, '')
        .replace(/^\//, '');

      const parts = cleanPath.split('/');
      let currentPath = '';

      parts.forEach((part, index) => {
        const previousPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;

        if (!nodeMap.has(currentPath)) {
          const node: FileNode = {
            name: part,
            path: `/home/user/${currentPath}`,
            type: isFile ? 'file' : 'directory',
            children: isFile ? undefined : [],
          };

          nodeMap.set(currentPath, node);

          if (previousPath) {
            const parent = nodeMap.get(previousPath);
            if (parent && parent.children) {
              parent.children.push(node);
            }
          } else {
            root.push(node);
          }
        }
      });
    });

    return root;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadFiles}>
          Retry
        </Button>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">No files found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Generate code to see files here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {tree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            onSelect={onFileSelect || (() => {})}
            selectedFile={selectedFile}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

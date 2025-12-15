export interface Page {
  id: string;
  projectId: string;
  title: string;
  icon: string | null;
  type: 'document' | 'folder';
  parentId: string | null;
  order: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  blocks?: Block[];
  children?: Page[];
}

export interface Block {
  id: string;
  pageId: string;
  type: string;
  content: Record<string, unknown>;
  order: number;
  parentBlockId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePageInput {
  title: string;
  type?: 'document' | 'folder';
  icon?: string;
  parentId?: string;
  order?: number;
}

export interface UpdatePageInput {
  title?: string;
  icon?: string;
  order?: number;
}

export interface CreateBlockInput {
  type: string;
  content: Record<string, unknown>;
  order?: number;
  parentBlockId?: string;
}

export interface UpdateBlockInput {
  content?: Record<string, unknown>;
  order?: number;
}

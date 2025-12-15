const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      return null;
    }

    const data = await response.json();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function fetchWithAuth(
  endpoint: string,
  options: RequestOptions = {}
): Promise<Response> {
  let token = await getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // If unauthorized, try to refresh token and retry once
  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders: HeadersInit = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      };

      return fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: retryHeaders,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }
  }

  return response;
}

// SSE Event types from the backend
export interface SSEStatusEvent {
  message: string;
  type?: string;
  sandboxId?: string;
}

export interface SSETextEvent {
  content: string;
}

export interface SSEToolEvent {
  name: string;
  action: string;
}

export interface SSEErrorEvent {
  message: string;
}

export interface SSECompleteEvent {
  message: string;
  sandboxId: string;
  sandboxUrl: string;
  filesCreated: string[];
}

export type SSEEvent =
  | { type: 'status'; data: SSEStatusEvent }
  | { type: 'text'; data: SSETextEvent }
  | { type: 'tool'; data: SSEToolEvent }
  | { type: 'error'; data: SSEErrorEvent }
  | { type: 'complete'; data: SSECompleteEvent };

// SSE streaming for code generation
export async function* streamGeneration(
  prompt: string,
  options?: {
    projectId?: string;
    taskId?: string;
    autoCommit?: boolean;
  }
): AsyncGenerator<SSEEvent> {
  const token = await getAccessToken();

  const response = await fetch(`${API_URL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({
      prompt,
      ...options,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Generation failed' }));
    throw new Error(error.message);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.substring(6).trim();
      } else if (line.startsWith('data:') && currentEvent) {
        try {
          const data = JSON.parse(line.substring(5));
          yield { type: currentEvent, data } as SSEEvent;
        } catch {
          // Skip invalid JSON
        }
        currentEvent = '';
      }
    }
  }
}

// API client with typed methods
export const api = {
  // Auth
  async login(email: string, password: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).message || 'Login failed');
    return res.json();
  },

  async register(email: string, password: string, name: string) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) throw new Error((await res.json()).message || 'Registration failed');
    return res.json();
  },

  getGitHubLoginUrl() {
    return `${API_URL}/auth/github/login`;
  },

  // Projects
  async getProjects() {
    const res = await fetchWithAuth('/projects');
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async getProject(id: string) {
    const res = await fetchWithAuth(`/projects/${id}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    return res.json();
  },

  async createProject(data: { name: string; description?: string }) {
    const res = await fetchWithAuth('/projects', {
      method: 'POST',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to create project');
    return res.json();
  },

  async updateProject(id: string, data: { name?: string; description?: string }) {
    const res = await fetchWithAuth(`/projects/${id}`, {
      method: 'PATCH',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to update project');
    return res.json();
  },

  async deleteProject(id: string) {
    const res = await fetchWithAuth(`/projects/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete project');
    return res.json();
  },

  // Tasks
  async getTasks(projectId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/tasks`);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  },

  async createTask(
    projectId: string,
    data: { title: string; description?: string; status?: string; priority?: string }
  ) {
    const res = await fetchWithAuth(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to create task');
    return res.json();
  },

  async updateTask(
    projectId: string,
    taskId: string,
    data: { title?: string; description?: string | null; status?: string; priority?: string; synthesizedPrompt?: string | null }
  ) {
    const res = await fetchWithAuth(`/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to update task');
    return res.json();
  },

  async deleteTask(projectId: string, taskId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete task');
    return res.json();
  },

  async startTaskPreview(projectId: string, taskId: string): Promise<{ sandboxId: string; sandboxUrl: string }> {
    const res = await fetchWithAuth(`/projects/${projectId}/tasks/${taskId}/preview`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to start preview');
    }
    return res.json();
  },

  async getSandboxFiles(projectId: string, path?: string) {
    const queryParams = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await fetchWithAuth(`/projects/${projectId}/sandbox/files${queryParams}`);
    if (!res.ok) throw new Error('Failed to fetch sandbox files');
    return res.json();
  },

  async getSandboxFile(projectId: string, path: string) {
    const res = await fetchWithAuth(
      `/projects/${projectId}/sandbox/file?path=${encodeURIComponent(path)}`
    );
    if (!res.ok) throw new Error('Failed to fetch file');
    return res.json();
  },

  // Sandbox
  async createSandbox(projectId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/sandbox`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to create sandbox');
    return res.json();
  },

  async getSandbox(projectId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/sandbox`);
    if (!res.ok) throw new Error('Failed to get sandbox');
    return res.json();
  },

  async closeSandbox(projectId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/sandbox`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to close sandbox');
    return res.json();
  },

  // GitHub
  async quickStart(data: {
    githubToken: string;
    projectName: string;
    repoName: string;
    description?: string;
    private?: boolean;
  }) {
    const res = await fetch(`${API_URL}/github/quick-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Quick start failed');
    return res.json();
  },

  async getGitHubRepos(page = 1, perPage = 50) {
    const res = await fetchWithAuth(`/github/repos?page=${page}&per_page=${perPage}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to fetch repos' }));
      throw new Error(error.error || 'Failed to fetch GitHub repositories');
    }
    return res.json();
  },

  async importGitHubRepo(repoId: number) {
    const res = await fetchWithAuth('/github/import-repo', {
      method: 'POST',
      body: { repoId },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to import repo' }));
      throw new Error(error.error || 'Failed to import repository');
    }
    return res.json();
  },

  // Agent / AI Assistant
  async createAgentSession(projectId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/agent/session`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to create agent session');
    return res.json();
  },

  async chatWithAgent(
    sessionId: string,
    message: string,
    options?: { searchEnabled?: boolean; thinkingEnabled?: boolean; codebaseEnabled?: boolean }
  ) {
    const res = await fetchWithAuth(`/agent/${sessionId}/chat`, {
      method: 'POST',
      body: {
        message,
        searchEnabled: options?.searchEnabled ?? true,
        thinkingEnabled: options?.thinkingEnabled ?? false,
        codebaseEnabled: options?.codebaseEnabled ?? false,
      },
    });
    if (!res.ok) throw new Error('Failed to chat with agent');
    return res.json();
  },

  async getAgentMessages(sessionId: string) {
    const res = await fetchWithAuth(`/agent/${sessionId}/messages`);
    if (!res.ok) throw new Error('Failed to get agent messages');
    return res.json();
  },

  async synthesizePrompt(sessionId: string) {
    const res = await fetchWithAuth(`/agent/${sessionId}/synthesize`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to synthesize prompt');
    return res.json();
  },

  async createBuildTask(sessionId: string, title: string, prompt: string) {
    const res = await fetchWithAuth(`/agent/${sessionId}/create-build-task`, {
      method: 'POST',
      body: { title, prompt },
    });
    if (!res.ok) throw new Error('Failed to create build task');
    return res.json();
  },

  // Pages
  async getPages(projectId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/pages`);
    if (!res.ok) throw new Error('Failed to fetch pages');
    return res.json();
  },

  async getPage(pageId: string) {
    const res = await fetchWithAuth(`/pages/${pageId}`);
    if (!res.ok) throw new Error('Failed to fetch page');
    return res.json();
  },

  async createPage(
    projectId: string,
    data: { title: string; type?: string; icon?: string; parentId?: string }
  ) {
    const res = await fetchWithAuth(`/projects/${projectId}/pages`, {
      method: 'POST',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to create page');
    return res.json();
  },

  async updatePage(pageId: string, data: { title?: string; icon?: string }) {
    const res = await fetchWithAuth(`/pages/${pageId}`, {
      method: 'PATCH',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to update page');
    return res.json();
  },

  async deletePage(pageId: string) {
    const res = await fetchWithAuth(`/pages/${pageId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete page');
    return res.json();
  },

  async movePage(pageId: string, data: { parentId?: string | null; order?: number }) {
    const res = await fetchWithAuth(`/pages/${pageId}/move`, {
      method: 'POST',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to move page');
    return res.json();
  },

  // Blocks
  async createBlock(
    pageId: string,
    data: { type: string; content: Record<string, unknown>; order?: number }
  ) {
    const res = await fetchWithAuth(`/pages/${pageId}/blocks`, {
      method: 'POST',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to create block');
    return res.json();
  },

  async updateBlock(
    blockId: string,
    data: { content?: Record<string, unknown>; order?: number }
  ) {
    const res = await fetchWithAuth(`/blocks/${blockId}`, {
      method: 'PATCH',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to update block');
    return res.json();
  },

  async deleteBlock(blockId: string) {
    const res = await fetchWithAuth(`/blocks/${blockId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete block');
    return res.json();
  },

  async updateBlocks(pageId: string, blocks: Array<{ type: string; content: Record<string, unknown> }>) {
    const res = await fetchWithAuth(`/pages/${pageId}/blocks/batch`, {
      method: 'PUT',
      body: { blocks },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to update blocks' }));
      // Don't throw for 404 (page deleted) or 403 (access changed) - just silently fail
      if (res.status === 404 || res.status === 403) {
        console.warn('Page no longer accessible:', error.error);
        return { blocks: [], blockCount: 0, skipped: true };
      }
      throw new Error(error.error || 'Failed to update blocks');
    }
    return res.json();
  },

  // Research Sessions
  async getResearchSessions(projectId: string) {
    const res = await fetchWithAuth(`/projects/${projectId}/agent/sessions`);
    if (!res.ok) throw new Error('Failed to fetch research sessions');
    return res.json();
  },

  async deleteResearchSession(sessionId: string) {
    const res = await fetchWithAuth(`/agent/${sessionId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete research session');
    return res.json();
  },

  async updateResearchSession(sessionId: string, data: { status?: string; title?: string }) {
    const res = await fetchWithAuth(`/agent/${sessionId}`, {
      method: 'PATCH',
      body: data,
    });
    if (!res.ok) throw new Error('Failed to update research session');
    return res.json();
  },

  async synthesizeWithCustomPrompt(
    sessionId: string,
    prompt: string,
    mode: 'task' | 'note'
  ): Promise<{ title: string; content: string; summary: string; projectId: string }> {
    const res = await fetchWithAuth(`/agent/${sessionId}/synthesize-custom`, {
      method: 'POST',
      body: { prompt, mode },
    });
    if (!res.ok) throw new Error('Failed to synthesize content');
    return res.json();
  },

  // Combined PR for multiple tasks
  async createCombinedPR(
    projectId: string,
    taskIds: string[]
  ): Promise<{ prUrl: string; prNumber: number; branchName: string }> {
    const res = await fetchWithAuth(`/projects/${projectId}/combined-pr`, {
      method: 'POST',
      body: { taskIds },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to create combined PR' }));
      throw new Error(error.error || 'Failed to create combined PR');
    }
    return res.json();
  },
};

export default api;

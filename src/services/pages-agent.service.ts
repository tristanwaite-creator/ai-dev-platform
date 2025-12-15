import Anthropic from '@anthropic-ai/sdk';
import { db } from '../lib/db.js';
import { e2bService } from '../lib/e2b.js';

interface ChatOptions {
  sessionId: string;
  userMessage: string;
  searchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codebaseEnabled?: boolean;
  onToolStart?: (toolName: string, input: any) => void;
  onToolComplete?: (toolName: string, result: any) => void;
}

interface ChatResponse {
  messageId: string;
  content: string;
  toolCalls?: any[];
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

class PagesAgentService {
  private anthropic: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Create a new agent session
   */
  async createSession(projectId: string, userId: string): Promise<string> {
    const session = await db.agentSession.create({
      data: {
        projectId,
        type: 'assistant',
        status: 'active',
        workspaceContext: {
          projectId,
          userId,
          recentPages: [],
        },
      },
    });

    console.log(`🤖 Created agent session: ${session.id}`);
    return session.id;
  }

  /**
   * Chat with the agent
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const {
      sessionId,
      userMessage,
      searchEnabled = true,
      thinkingEnabled = false,
      codebaseEnabled = false,
      onToolStart,
      onToolComplete,
    } = options;

    // Get session with context
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 20, // Last 20 messages for context
        },
        project: true,
      },
    });

    if (!session) {
      throw new Error('Agent session not found');
    }

    // Save user message
    await db.agentMessage.create({
      data: {
        sessionId,
        role: 'user',
        content: userMessage,
      },
    });

    // Build conversation history
    const conversationHistory: Anthropic.MessageParam[] = session.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add new user message
    conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build system prompt based on mode (Claude SDK Best Practices)
    const modes: string[] = [];
    if (searchEnabled) modes.push('Web Search');
    if (codebaseEnabled) modes.push('Codebase Analysis');
    if (!searchEnabled && !codebaseEnabled) modes.push('Quick Chat');

    const modeDescription = (() => {
      const parts: string[] = [];
      if (searchEnabled) parts.push('real-time web search');
      if (codebaseEnabled) parts.push('access to read and analyze the project codebase');
      if (parts.length === 0) return 'You are in Quick Chat mode - respond directly without web searches for faster responses.';
      return `You have access to ${parts.join(' and ')} and document management tools.`;
    })();

    const toolsDescription = (() => {
      const sections: string[] = [];

      if (searchEnabled) {
        sections.push(`- **search_web**: Search the web for current facts (use sparingly - one search is usually enough)`);
      }

      if (codebaseEnabled) {
        sections.push(`- **list_project_files**: Browse the project's file structure
- **read_project_file**: Read any file from the project codebase
- **search_project_code**: Search for patterns or text across the codebase`);
      }

      sections.push(`- **Workspace Tools**: list_pages, read_page, search_pages, create_page, update_page, create_folder
- **Workflow Integration**: create_task_from_research - Convert research pages into kanban board tasks`);

      if (!searchEnabled && !codebaseEnabled) {
        sections.push(`- Note: Web search and codebase access are disabled for faster responses.`);
      }

      return `### Tools at Your Disposal:\n${sections.join('\n')}`;
    })();

    const currentMode = modes.join(' + ');

    // Quick chat mode - no tools, faster responses
    const isQuickChatMode = !searchEnabled && !codebaseEnabled;

    const systemPrompt = isQuickChatMode
      ? `You are a helpful assistant for "${session.project.name}". Be concise and direct. You're in quick chat mode - no web search or codebase access, just helpful conversation.`
      : `You are a helpful research assistant for "${session.project.name}".

${modeDescription}

## Your Role

You are a conversational research assistant. Your job is to:
1. **Discuss ideas** with the user
2. **Search and research** topics when asked
3. **Present findings in chat** for discussion
4. **Help refine ideas** through conversation

## IMPORTANT: Do NOT auto-create pages or tasks

- **Do NOT use create_page, update_page, or create_task_from_research** unless the user EXPLICITLY asks you to create/save something
- Instead, share your research findings directly in the chat message
- Let the user read and discuss the research with you first
- The user has "Create Task" and "Save as Note" buttons - they will use those when ready

## Guidelines

1. **Be conversational** - Discuss, explain, and explore ideas with the user like a helpful colleague
2. **Show research in chat** - When you search, share the key findings in your response
3. **Search smartly** - One good search is usually enough. Don't over-search.
4. **Keep responses clear** - Format with headers and bullets for readability
5. **Ask follow-up questions** - Help clarify requirements through discussion

Current project: ${session.project.name}
Mode: ${currentMode}`;

    // Quick chat mode: simple API call without tools for faster response
    if (isQuickChatMode) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        system: systemPrompt,
        messages: conversationHistory,
      });

      const textContent = response.content.find((block) => block.type === 'text');
      const finalText = textContent && textContent.type === 'text' ? textContent.text : '';

      // Save assistant message
      const savedMessage = await db.agentMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: finalText,
        },
      });

      // Auto-generate title on first exchange
      const messageCount = session.messages.length + 2;
      if (messageCount === 2 && !session.title) {
        await this.generateSessionTitle(sessionId, userMessage, finalText);
      }

      console.log(`💬 Quick chat response complete for session ${sessionId}`);

      return {
        messageId: savedMessage.id,
        content: finalText,
      };
    }

    // Tool-enabled mode: use tools for search/codebase access
    const tools = this.getToolDefinitions(searchEnabled, codebaseEnabled);

    // Call Claude with tools
    let response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      messages: conversationHistory,
      tools,
    });

    // Agent loop: handle tool calls
    const allToolCalls: any[] = [];
    let finalText = '';

    while (response.stop_reason === 'tool_use') {
      // Extract tool uses from response
      const toolUses = response.content.filter((block) => block.type === 'tool_use');
      const textBlocks = response.content.filter((block) => block.type === 'text');

      // Collect any text before tool use
      if (textBlocks.length > 0) {
        finalText += textBlocks.map((b: any) => b.text).join('');
      }

      // Execute tools
      const toolResults: Anthropic.MessageParam['content'] = [];

      for (const toolUse of toolUses) {
        if (toolUse.type !== 'tool_use') continue;

        console.log(`🔧 Agent using tool: ${toolUse.name}`);

        // Notify tool start
        if (onToolStart) {
          onToolStart(toolUse.name, toolUse.input);
        }

        try {
          const result = await this.executeTool(
            toolUse.name,
            toolUse.input,
            sessionId,
            session.workspaceContext
          );

          // Notify tool complete
          if (onToolComplete) {
            onToolComplete(toolUse.name, result);
          }

          allToolCalls.push({
            name: toolUse.name,
            input: toolUse.input,
            output: result,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (error: any) {
          console.error(`❌ Tool execution failed: ${error.message}`);

          // Notify tool complete with error
          if (onToolComplete) {
            onToolComplete(toolUse.name, { error: error.message });
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: error.message }),
            is_error: true,
          });
        }
      }

      // Add assistant message and tool results to conversation
      conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });

      conversationHistory.push({
        role: 'user',
        content: toolResults,
      });

      // Continue conversation
      response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages: conversationHistory,
        tools,
      });
    }

    // Extract final text response
    const finalTextBlocks = response.content.filter((block) => block.type === 'text');
    finalText += finalTextBlocks.map((b: any) => b.text).join('');

    // Save assistant message
    const savedMessage = await db.agentMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: finalText,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      },
    });

    // Auto-generate title on first exchange (when we have 2+ messages)
    const messageCount = session.messages.length + 2; // +2 for user and assistant just added
    if (messageCount === 2 && !session.title) {
      await this.generateSessionTitle(sessionId, userMessage, finalText);
    }

    console.log(`💬 Agent response complete for session ${sessionId}`);

    return {
      messageId: savedMessage.id,
      content: finalText,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
  }

  /**
   * Generate a concise title for the session based on the first exchange
   */
  private async generateSessionTitle(sessionId: string, userMessage: string, assistantResponse: string): Promise<void> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 50,
        system: 'Generate a very short (2-5 words) title for this research conversation. Be concise and descriptive. Output only the title, nothing else.',
        messages: [
          {
            role: 'user',
            content: `User: ${userMessage.slice(0, 500)}\n\nAssistant: ${assistantResponse.slice(0, 500)}`,
          },
        ],
      });

      const title = response.content[0].type === 'text'
        ? response.content[0].text.trim().replace(/^["']|["']$/g, '') // Remove quotes
        : 'Research Chat';

      await db.agentSession.update({
        where: { id: sessionId },
        data: { title },
      });

      console.log(`📝 Generated session title: ${title}`);
    } catch (error) {
      console.error('Failed to generate session title:', error);
      // Don't fail the whole operation if title generation fails
    }
  }

  /**
   * Get tool definitions
   */
  private getToolDefinitions(searchEnabled: boolean = true, codebaseEnabled: boolean = false): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // Only include search tool if searchEnabled
    if (searchEnabled) {
      tools.push({
        name: 'search_web',
        description: 'Search the web for current facts or recent information. Use only when you need up-to-date data, not for common knowledge. One focused search is usually sufficient.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'A specific, focused search query. Be concise.',
            },
          },
          required: ['query'],
        },
      });
    }

    // Only include codebase tools if codebaseEnabled
    if (codebaseEnabled) {
      tools.push(
        {
          name: 'list_project_files',
          description: 'List files and directories in the project. Use this to explore the project structure and understand what files exist.',
          input_schema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The directory path to list. Use "/" for the root directory, or specify a subdirectory like "/src" or "/components".',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'read_project_file',
          description: 'Read the contents of a specific file from the project. Use this to understand existing code, configurations, or documentation.',
          input_schema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The path to the file to read, e.g., "/src/index.ts" or "/package.json".',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'search_project_code',
          description: 'Search for a pattern or text across the project codebase. Use this to find where certain functions, variables, or patterns are used.',
          input_schema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'The search pattern or text to find in the codebase.',
              },
              filePattern: {
                type: 'string',
                description: 'Optional file pattern to filter results, e.g., "*.ts" for TypeScript files or "*.tsx" for React components.',
              },
            },
            required: ['pattern'],
          },
        }
      );
    }

    // Always include workspace tools
    tools.push(
      {
        name: 'list_pages',
        description: 'List all pages in a folder or at the root level. Use this to explore the workspace structure.',
        input_schema: {
          type: 'object',
          properties: {
            parentId: {
              type: 'string',
              description: 'Optional parent folder ID. If not provided, lists root-level pages.',
            },
          },
        },
      },
      {
        name: 'read_page',
        description: 'Read the content of a specific page. Returns the title and text content.',
        input_schema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'The ID of the page to read',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'create_page',
        description: 'Create a new page with title and optional content. Can be nested in a folder.',
        input_schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new page',
            },
            content: {
              type: 'string',
              description: 'Optional initial content for the page',
            },
            parentId: {
              type: 'string',
              description: 'Optional parent folder ID to nest this page',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'update_page',
        description: 'Update an existing page\'s title or content.',
        input_schema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'The ID of the page to update',
            },
            title: {
              type: 'string',
              description: 'New title (optional)',
            },
            content: {
              type: 'string',
              description: 'New content (optional)',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'search_pages',
        description: 'Search for pages by title or content. Returns matching pages with previews.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_folder',
        description: 'Create a new folder to organize pages.',
        input_schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new folder',
            },
            parentId: {
              type: 'string',
              description: 'Optional parent folder ID for nesting',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'create_task_from_research',
        description: 'Convert research from one or more pages into a task in the kanban board. The task will be created in the "Research" column. Use this when the user wants to take their research findings and turn them into actionable work items.',
        input_schema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'The ID of the page containing research to convert into a task',
            },
            customTitle: {
              type: 'string',
              description: 'Optional custom title for the task. If not provided, will be auto-generated from page content.',
            },
            customDescription: {
              type: 'string',
              description: 'Optional custom description for the task. If not provided, will be auto-generated from page content.',
            },
          },
          required: ['pageId'],
        },
      }
    );

    return tools;
  }

  /**
   * Execute a tool
   */
  private async executeTool(
    toolName: string,
    input: any,
    sessionId: string,
    context: any
  ): Promise<any> {
    const projectId = context.projectId;
    const userId = context.userId;

    switch (toolName) {
      case 'search_web':
        return this.toolSearchWeb(input.query);

      // Codebase tools
      case 'list_project_files':
        return this.toolListProjectFiles(projectId, input.path);

      case 'read_project_file':
        return this.toolReadProjectFile(projectId, input.path);

      case 'search_project_code':
        return this.toolSearchProjectCode(projectId, input.pattern, input.filePattern);

      // Page management tools
      case 'list_pages':
        return this.toolListPages(projectId, input.parentId);

      case 'read_page':
        return this.toolReadPage(input.pageId);

      case 'create_page':
        return this.toolCreatePage(projectId, userId, input, sessionId);

      case 'update_page':
        return this.toolUpdatePage(input.pageId, input, sessionId);

      case 'search_pages':
        return this.toolSearchPages(projectId, input.query);

      case 'create_folder':
        return this.toolCreateFolder(projectId, userId, input, sessionId);

      case 'create_task_from_research':
        return this.toolCreateTaskFromResearch(projectId, input, sessionId);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Tool: List project files from E2B sandbox
   */
  private async toolListProjectFiles(projectId: string, path: string) {
    // Get project's sandbox ID
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { sandboxId: true },
    });

    if (!project?.sandboxId) {
      // If no sandbox exists, return a helpful message
      return {
        path,
        files: [],
        message: 'No active sandbox for this project. Start a build to create one.',
        success: false,
      };
    }

    try {
      const files = await e2bService.listFiles(project.sandboxId, `/home/user${path}`);

      console.log(`📂 Listed files at ${path}: ${files.length} items`);

      return {
        path,
        files: files.map((f: any) => ({
          name: f.name,
          type: f.isDir ? 'directory' : 'file',
          path: `${path}/${f.name}`.replace('//', '/'),
        })),
        count: files.length,
        success: true,
      };
    } catch (error: any) {
      console.error(`❌ Failed to list files at ${path}:`, error.message);
      return {
        path,
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Tool: Read project file from E2B sandbox
   */
  private async toolReadProjectFile(projectId: string, path: string) {
    // Get project's sandbox ID
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { sandboxId: true },
    });

    if (!project?.sandboxId) {
      return {
        path,
        content: null,
        message: 'No active sandbox for this project. Start a build to create one.',
        success: false,
      };
    }

    try {
      const content = await e2bService.readFile(project.sandboxId, `/home/user${path}`);

      // Truncate very long files
      const maxLength = 50000;
      const truncated = content.length > maxLength;
      const displayContent = truncated
        ? content.substring(0, maxLength) + '\n\n... (truncated)'
        : content;

      console.log(`📖 Read file ${path}: ${content.length} bytes`);

      return {
        path,
        content: displayContent,
        size: content.length,
        truncated,
        success: true,
      };
    } catch (error: any) {
      console.error(`❌ Failed to read file ${path}:`, error.message);
      return {
        path,
        content: null,
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Tool: Search project code in E2B sandbox
   */
  private async toolSearchProjectCode(projectId: string, pattern: string, filePattern?: string) {
    // Get project's sandbox ID
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { sandboxId: true },
    });

    if (!project?.sandboxId) {
      return {
        pattern,
        results: [],
        message: 'No active sandbox for this project. Start a build to create one.',
        success: false,
      };
    }

    try {
      // Get the sandbox
      const sandboxInfo = e2bService.getSandbox(project.sandboxId);
      if (!sandboxInfo) {
        return {
          pattern,
          results: [],
          message: 'Sandbox not currently active.',
          success: false,
        };
      }

      // Use grep to search for patterns
      let grepCommand = `grep -r -n "${pattern.replace(/"/g, '\\"')}" /home/user/`;
      if (filePattern) {
        grepCommand = `grep -r -n --include="${filePattern}" "${pattern.replace(/"/g, '\\"')}" /home/user/`;
      }

      const result = await sandboxInfo.sandbox.commands.run(grepCommand);

      // Parse grep output
      const matches: Array<{ file: string; line: number; content: string }> = [];
      const lines = (result.stdout || '').split('\n').filter((l: string) => l.trim());

      for (const line of lines.slice(0, 50)) { // Limit to 50 matches
        const match = line.match(/^(.+?):(\d+):(.+)$/);
        if (match) {
          matches.push({
            file: match[1].replace('/home/user', ''),
            line: parseInt(match[2]),
            content: match[3].trim().substring(0, 200),
          });
        }
      }

      console.log(`🔍 Search for "${pattern}": ${matches.length} matches`);

      return {
        pattern,
        filePattern,
        results: matches,
        count: matches.length,
        truncated: lines.length > 50,
        success: true,
      };
    } catch (error: any) {
      // grep returns exit code 1 if no matches found
      if (error.message?.includes('exit code 1')) {
        return {
          pattern,
          results: [],
          count: 0,
          message: 'No matches found',
          success: true,
        };
      }

      console.error(`❌ Failed to search for "${pattern}":`, error.message);
      return {
        pattern,
        results: [],
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Tool: Search Web (Perplexity)
   */
  private async toolSearchWeb(query: string) {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',  // Fast model for quick searches
          messages: [
            {
              role: 'system',
              content: 'Give a brief, factual answer. Be concise - max 2-3 paragraphs. Include key facts only.',
            },
            {
              role: 'user',
              content: query,
            },
          ],
          temperature: 0.1,
          max_tokens: 800,  // Reduced from 4000 for faster, more focused responses
          return_citations: true,
          return_images: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Perplexity API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as any;
      let answer = data.choices?.[0]?.message?.content || 'No results found';
      const citations = data.citations || [];

      // Truncate long answers to keep context manageable
      if (answer.length > 1500) {
        answer = answer.substring(0, 1500) + '...';
      }

      console.log(`🔍 Web search completed: "${query.substring(0, 50)}..." (${answer.length} chars)`);

      return {
        query,
        answer,
        citations: citations.slice(0, 3),  // Limit citations
        success: true,
      };
    } catch (error: any) {
      console.error(`❌ Web search failed: ${error.message}`);
      throw new Error(`Web search failed: ${error.message}`);
    }
  }

  /**
   * Tool: List pages
   */
  private async toolListPages(projectId: string, parentId?: string) {
    const pages = await db.page.findMany({
      where: {
        projectId,
        parentId: parentId || null,
        isArchived: false,
      },
      include: {
        _count: {
          select: { blocks: true, children: true },
        },
      },
      orderBy: { order: 'asc' },
    });

    return {
      pages: pages.map((p) => ({
        id: p.id,
        title: p.title,
        type: p.type,
        icon: p.icon,
        hasChildren: p._count.children > 0,
        blockCount: p._count.blocks,
      })),
      count: pages.length,
    };
  }

  /**
   * Tool: Read page
   */
  private async toolReadPage(pageId: string) {
    const page = await db.page.findUnique({
      where: { id: pageId },
      include: {
        blocks: {
          where: { parentBlockId: null },
          orderBy: { order: 'asc' },
        },
        parent: {
          select: { id: true, title: true },
        },
      },
    });

    if (!page) {
      throw new Error('Page not found');
    }

    // Extract text content
    const content = page.blocks.map((b: any) => b.content?.text || '').join('\n\n');

    return {
      id: page.id,
      title: page.title,
      type: page.type,
      icon: page.icon,
      content,
      parentTitle: page.parent?.title,
      blockCount: page.blocks.length,
    };
  }

  /**
   * Tool: Create page
   */
  private async toolCreatePage(
    projectId: string,
    userId: string,
    input: { title: string; content?: string; parentId?: string },
    sessionId: string
  ) {
    // Get max order
    const maxOrderPage = await db.page.findFirst({
      where: { projectId, parentId: input.parentId || null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const order = (maxOrderPage?.order || 0) + 1;

    // Create page
    const page = await db.page.create({
      data: {
        title: input.title,
        type: 'document',
        projectId,
        createdById: userId,
        lastEditedById: userId,
        parentId: input.parentId || null,
        order,
      },
    });

    // Create initial content block if provided
    if (input.content) {
      await db.block.create({
        data: {
          pageId: page.id,
          type: 'text',
          content: { text: input.content },
          order: 0,
        },
      });
    }

    // Log action
    await db.agentAction.create({
      data: {
        sessionId,
        actionType: 'create_page',
        targetId: page.id,
        targetType: 'page',
        details: {
          title: input.title,
          hasContent: !!input.content,
          parentId: input.parentId,
        },
        status: 'executed',
        executedAt: new Date(),
      },
    });

    console.log(`📄 Agent created page: ${page.id} - "${page.title}"`);

    return {
      id: page.id,
      title: page.title,
      success: true,
    };
  }

  /**
   * Tool: Update page
   */
  private async toolUpdatePage(
    pageId: string,
    input: { title?: string; content?: string },
    sessionId: string
  ) {
    const page = await db.page.findUnique({
      where: { id: pageId },
      include: { blocks: { orderBy: { order: 'asc' } } },
    });

    if (!page) {
      throw new Error('Page not found');
    }

    // Update title if provided
    if (input.title) {
      await db.page.update({
        where: { id: pageId },
        data: { title: input.title },
      });
    }

    // Update content if provided
    if (input.content !== undefined) {
      if (page.blocks.length > 0) {
        // Update first block
        await db.block.update({
          where: { id: page.blocks[0].id },
          data: { content: { text: input.content } },
        });
      } else {
        // Create new block
        await db.block.create({
          data: {
            pageId,
            type: 'text',
            content: { text: input.content },
            order: 0,
          },
        });
      }
    }

    // Log action
    await db.agentAction.create({
      data: {
        sessionId,
        actionType: 'update_page',
        targetId: pageId,
        targetType: 'page',
        details: {
          updatedTitle: !!input.title,
          updatedContent: input.content !== undefined,
        },
        status: 'executed',
        executedAt: new Date(),
      },
    });

    console.log(`✏️ Agent updated page: ${pageId}`);

    return {
      id: pageId,
      success: true,
    };
  }

  /**
   * Tool: Search pages
   */
  private async toolSearchPages(projectId: string, query: string) {
    // Search in titles and content
    const pages = await db.page.findMany({
      where: {
        projectId,
        isArchived: false,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          {
            blocks: {
              some: {
                content: {
                  path: ['text'],
                  string_contains: query,
                },
              },
            },
          },
        ],
      },
      include: {
        blocks: {
          take: 1,
          orderBy: { order: 'asc' },
        },
      },
      take: 10,
    });

    return {
      results: pages.map((p) => ({
        id: p.id,
        title: p.title,
        type: p.type,
        preview: (p.blocks[0]?.content as any)?.text?.substring(0, 150) || '',
      })),
      count: pages.length,
    };
  }

  /**
   * Tool: Create folder
   */
  private async toolCreateFolder(
    projectId: string,
    userId: string,
    input: { title: string; parentId?: string },
    sessionId: string
  ) {
    // Get max order
    const maxOrderPage = await db.page.findFirst({
      where: { projectId, parentId: input.parentId || null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const order = (maxOrderPage?.order || 0) + 1;

    // Create folder
    const folder = await db.page.create({
      data: {
        title: input.title,
        type: 'folder',
        icon: '📁',
        projectId,
        createdById: userId,
        lastEditedById: userId,
        parentId: input.parentId || null,
        order,
      },
    });

    // Log action
    await db.agentAction.create({
      data: {
        sessionId,
        actionType: 'create_folder',
        targetId: folder.id,
        targetType: 'folder',
        details: {
          title: input.title,
          parentId: input.parentId,
        },
        status: 'executed',
        executedAt: new Date(),
      },
    });

    console.log(`📁 Agent created folder: ${folder.id} - "${folder.title}"`);

    return {
      id: folder.id,
      title: folder.title,
      success: true,
    };
  }

  /**
   * Tool: Create task from research
   */
  private async toolCreateTaskFromResearch(
    projectId: string,
    input: { pageId: string; customTitle?: string; customDescription?: string },
    sessionId: string
  ) {
    // Read the page content
    const page = await db.page.findUnique({
      where: { id: input.pageId },
      include: {
        blocks: {
          where: { parentBlockId: null },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!page) {
      throw new Error('Page not found');
    }

    // Verify the page belongs to this project
    if (page.projectId !== projectId) {
      throw new Error('Page does not belong to this project');
    }

    // Extract text content from blocks
    const pageContent = page.blocks
      .map((b: any) => b.content?.text || '')
      .join('\n\n');

    // Use Claude to generate task title and description if not provided
    let taskTitle = input.customTitle;
    let taskDescription = input.customDescription;

    if (!taskTitle || !taskDescription) {
      const summarizationPrompt = `Based on this research content from a page titled "${page.title}", create a concise task for a development kanban board.

Research Content:
${pageContent.substring(0, 4000)} ${pageContent.length > 4000 ? '...' : ''}

Please provide:
1. A clear, actionable task title (max 60 characters)
2. A brief task description that summarizes what needs to be built/implemented (2-3 sentences)

Format your response as JSON:
{
  "title": "...",
  "description": "..."
}`;

      try {
        const response = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: summarizationPrompt,
            },
          ],
        });

        const textContent = response.content.find((block) => block.type === 'text');
        if (textContent && textContent.type === 'text') {
          const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            taskTitle = taskTitle || result.title;
            taskDescription = taskDescription || result.description;
          }
        }
      } catch (error) {
        console.error('❌ Failed to auto-generate task details:', error);
        // Fallback to simple defaults
        taskTitle = taskTitle || `Implement: ${page.title}`;
        taskDescription = taskDescription || `Based on research from "${page.title}":\n\n${pageContent.substring(0, 500)}...`;
      }
    }

    // Get max order for tasks in research column
    const maxOrderTask = await db.task.findFirst({
      where: { projectId, column: 'research' },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const order = (maxOrderTask?.order || 0) + 1;

    // Create the task in the research column
    const task = await db.task.create({
      data: {
        title: taskTitle!,
        description: `${taskDescription}\n\n---\n*Source: Research page "${page.title}" (${input.pageId})*`,
        column: 'research',
        status: 'todo',
        priority: 'medium',
        order,
        projectId,
      },
    });

    // Log action
    await db.agentAction.create({
      data: {
        sessionId,
        actionType: 'create_task',
        targetId: task.id,
        targetType: 'task',
        details: {
          sourcePageId: input.pageId,
          sourcePageTitle: page.title,
          taskTitle: task.title,
          autoGenerated: !input.customTitle || !input.customDescription,
        },
        status: 'executed',
        executedAt: new Date(),
      },
    });

    console.log(`✅ Agent created task from research: ${task.id} - "${task.title}"`);

    return {
      taskId: task.id,
      title: task.title,
      description: task.description,
      column: 'research',
      success: true,
      message: `Task created successfully in the Research column`,
    };
  }

  /**
   * Get messages for a session
   */
  async getMessages(sessionId: string) {
    return db.agentMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get actions for a session
   */
  async getActions(sessionId: string) {
    return db.agentAction.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Synthesize conversation into a buildable prompt
   */
  async synthesizePrompt(sessionId: string): Promise<{
    prompt: string;
    title: string;
    context: string[];
    messageCount: number;
  }> {
    // Get session with messages
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        project: true,
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.messages.length < 2) {
      throw new Error('Not enough conversation history to synthesize');
    }

    // Build conversation summary for Claude
    const conversationText = session.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    // Extract tool results for context
    const toolResults = session.messages
      .filter((m) => m.toolCalls)
      .flatMap((m) => {
        const calls = m.toolCalls as any[];
        return calls.map((tc) => ({
          tool: tc.name,
          output: tc.output,
        }));
      });

    // Build context from search results and page creations
    const context: string[] = [];
    for (const tr of toolResults) {
      if (tr.tool === 'search_web' && tr.output?.answer) {
        context.push(`Research: ${tr.output.answer.substring(0, 200)}...`);
      }
      if (tr.tool === 'create_page' && tr.output?.title) {
        context.push(`Created page: ${tr.output.title}`);
      }
    }

    // Use Claude to synthesize the conversation into a buildable prompt
    const synthesizePrompt = `You are synthesizing a research conversation into a clear, actionable code generation prompt.

## Research Conversation:
${conversationText}

## Your Task:
Based on this conversation, create:
1. A clear, specific prompt that can be used to generate code
2. A short title for this task (max 50 chars)

The prompt should:
- Be specific and actionable
- Include all technical requirements discussed
- Specify UI/UX preferences mentioned
- Include any constraints or requirements

Format your response as JSON:
{
  "title": "Short task title",
  "prompt": "Detailed prompt for code generation..."
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: synthesizePrompt,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log(`✨ Synthesized prompt from session ${sessionId}: "${result.title}"`);
          return {
            prompt: result.prompt,
            title: result.title,
            context,
            messageCount: session.messages.length,
          };
        }
      }

      throw new Error('Failed to parse synthesis result');
    } catch (error: any) {
      console.error('❌ Failed to synthesize prompt:', error.message);
      // Fallback: use last user message as prompt
      const lastUserMessage = session.messages
        .filter((m) => m.role === 'user')
        .pop();

      return {
        prompt: lastUserMessage?.content || 'Build based on research discussion',
        title: 'Build from Research',
        context,
        messageCount: session.messages.length,
      };
    }
  }

  /**
   * Create a task in Building column from synthesized prompt
   */
  async createBuildTask(
    sessionId: string,
    projectId: string,
    input: { title: string; prompt: string }
  ): Promise<{
    taskId: string;
    title: string;
    prompt: string;
    column: string;
  }> {
    // Get max order for tasks in building column
    const maxOrderTask = await db.task.findFirst({
      where: { projectId, column: 'building' },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const order = (maxOrderTask?.order || 0) + 1;

    // Create task in building column
    const task = await db.task.create({
      data: {
        title: input.title,
        description: input.prompt,
        column: 'building',
        status: 'in_progress',
        priority: 'high',
        order,
        projectId,
        agentSessionId: sessionId,
        synthesizedPrompt: input.prompt,
        buildStatus: 'pending',
      },
    });

    // Log action
    await db.agentAction.create({
      data: {
        sessionId,
        actionType: 'create_build_task',
        targetId: task.id,
        targetType: 'task',
        details: {
          title: task.title,
          column: 'building',
          synthesizedPrompt: input.prompt.substring(0, 500),
        },
        status: 'executed',
        executedAt: new Date(),
      },
    });

    console.log(`🚀 Created build task from research: ${task.id} - "${task.title}"`);

    return {
      taskId: task.id,
      title: task.title,
      prompt: input.prompt,
      column: 'building',
    };
  }

  /**
   * Synthesize content with a custom user prompt
   * Used for creating tasks or notes from research conversations
   */
  async synthesizeWithCustomPrompt(
    sessionId: string,
    userPrompt: string,
    mode: 'task' | 'note'
  ): Promise<{
    title: string;
    content: string;
    summary: string;
  }> {
    // Get session with messages
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        project: true,
      },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.messages.length < 1) {
      throw new Error('No conversation history to synthesize');
    }

    // Build conversation summary for Claude
    const conversationText = session.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const modeInstructions = mode === 'task'
      ? `Create a clear, actionable task based on the user's request.
The task should:
- Have a concise, action-oriented title (max 60 chars)
- Include specific requirements and acceptance criteria
- Be ready to hand off to a developer

Format your response as JSON:
{
  "title": "Short action-oriented title",
  "content": "Detailed task description with requirements, acceptance criteria, and any relevant technical details from the research",
  "summary": "One-sentence summary of what this task accomplishes"
}`
      : `Create a well-organized note capturing insights from the conversation.
The note should:
- Have a descriptive title (max 60 chars)
- Be formatted in Markdown with clear sections
- Extract key insights, decisions, and findings
- Include relevant quotes or data points

Format your response as JSON:
{
  "title": "Descriptive note title",
  "content": "Well-formatted Markdown note with sections, bullet points, and key takeaways",
  "summary": "One-sentence summary of what this note captures"
}`;

    const synthesizePrompt = `You are synthesizing a research conversation into ${mode === 'task' ? 'an actionable task' : 'a comprehensive note'}.

## Research Conversation:
${conversationText}

## User's Request:
"${userPrompt}"

## Your Task:
${modeInstructions}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: synthesizePrompt,
          },
        ],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log(`✨ Synthesized ${mode} from session ${sessionId}: "${result.title}"`);
          return {
            title: result.title,
            content: result.content,
            summary: result.summary,
          };
        }
      }

      throw new Error('Failed to parse synthesis result');
    } catch (error: any) {
      console.error(`❌ Failed to synthesize ${mode}:`, error.message);
      // Fallback
      return {
        title: mode === 'task' ? 'Task from Research' : 'Note from Research',
        content: userPrompt,
        summary: 'Created from research conversation',
      };
    }
  }
}

export const pagesAgentService = new PagesAgentService();

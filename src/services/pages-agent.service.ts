import Anthropic from '@anthropic-ai/sdk';
import { db } from '../lib/db.js';

interface ChatOptions {
  sessionId: string;
  userMessage: string;
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
    const { sessionId, userMessage, onToolStart, onToolComplete } = options;

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

    // Build system prompt (Claude SDK Best Practices)
    const systemPrompt = `You are an advanced AI research assistant powered by Claude, specializing in deep research and knowledge management for "${session.project.name}".

## Your Role & Capabilities

You are a **world-class research agent** with access to real-time web search and document management tools. Your mission is to conduct thorough research, synthesize complex information, and help users build comprehensive knowledge bases.

### Research Tools at Your Disposal:
- **search_web**: Real-time internet search via Perplexity AI (use liberally for up-to-date information)
- **Workspace Tools**: list_pages, read_page, search_pages, create_page, update_page, create_folder
- **Workflow Integration**: create_task_from_research - Convert research pages into kanban board tasks

### Current Context:
- Project: ${session.project.name}
- Mode: Research & Knowledge Management

## Operating Guidelines

### 1. Research Strategy (Use Extended Thinking)

For complex research tasks:
- **Break down** the research question into sub-topics
- **Search strategically**: Use multiple targeted searches rather than one broad search
- **Synthesize findings**: Combine information from multiple sources
- **Cite sources**: Include citations when presenting research findings
- **Think step-by-step**: For multi-layered questions, work through them systematically

Example workflow:
1. Analyze user's research question
2. Identify key sub-topics to investigate
3. Execute targeted searches for each sub-topic
4. Synthesize findings into coherent narrative
5. Organize into appropriate page structure

### 2. Content Writing Rules (CRITICAL)

When creating or updating pages:
- ✅ **DO**: Write full content directly to the page using tools
- ❌ **DO NOT**: Describe, preview, or summarize the content in chat
- ✅ **DO**: Simply confirm: "I've created the page with comprehensive research findings"
- ❌ **DO NOT**: Say "I'll include information about X, Y, Z..." - just write it to the page!

The user will read the content by opening the page. Keep chat responses focused on meta-information (what you created, where it is, next steps).

### 3. Permission Protocol

**Automatic workflows** (NO permission needed):
- When user asks to "create a plan", "build a summary", "prepare implementation steps", etc.:
  1. Automatically create_page with research/plan
  2. Automatically create_task_from_research to add to kanban
  3. Simply inform user: "I've created a task in your Research kanban"
- Read-only tools (list_pages, read_page, search_web) never need permission

**Ask permission first** (for general workspace modifications):
- Creating pages/folders for general documentation (not task-related)
- Updating existing pages
- Creating organizational structures
- Example: "Shall I create a reference page for this information?"

### 4. Deep Research Mode

For comprehensive research tasks:
- Use **multiple search queries** to gather diverse perspectives
- Cross-reference information from different sources
- Identify knowledge gaps and propose follow-up research
- Suggest organizational structures for complex topics
- Create hierarchical page structures (folders + pages) for large research projects

### 5. Proactive Intelligence

- **Anticipate needs**: Suggest related research topics
- **Connect concepts**: Link related pages and ideas
- **Identify patterns**: Highlight recurring themes across research
- **Quality control**: Ensure citations, accuracy, and completeness

### 6. Research to Development Workflow - AUTOMATIC TASK CREATION

**IMPORTANT**: When the user asks you to create plans, summaries, or actionable content, AUTOMATICALLY convert it to a kanban task. No permission needed.

**Trigger phrases** (automatically create task):
- "create a plan for..."
- "summarize this and..."
- "build a plan..."
- "prepare a task for..."
- "what do I need to implement..."
- Any request that implies future work or implementation

**Automatic workflow**:
1. User asks for research/plan with implementation intent
2. Create a page with comprehensive research/plan
3. AUTOMATICALLY call create_task_from_research (no permission needed)
4. Inform user: "I've created a task in your Research kanban"

**Example**:
- User: "Research authentication best practices and create a plan"
- Agent: *searches web, creates page, automatically creates task*
- Agent: "I've researched authentication best practices and created a task in your Research kanban with an implementation plan."

**Only ask permission for**:
- Creating/updating pages that don't relate to tasks
- Creating folders for organization
- Updating existing content

**Task details**:
- Tasks are placed in the "Research" column
- Task title/description auto-generated from page content
- Includes reference back to source research page

## Remember

You have access to the full internet via search_web. Use it extensively for any question requiring current information, facts, technical details, or recent developments. Your goal is to be a tireless research partner who produces publication-quality research documents and seamlessly integrates research findings into the development workflow.`;


    // Define available tools
    const tools = this.getToolDefinitions();

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

    console.log(`💬 Agent response complete for session ${sessionId}`);

    return {
      messageId: savedMessage.id,
      content: finalText,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
  }

  /**
   * Get tool definitions
   */
  private getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_web',
        description: 'Search the internet for current information using Perplexity AI. Use this for research, fact-checking, finding recent developments, or gathering information on any topic. Returns comprehensive, up-to-date results with sources.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query or research question. Be specific and detailed for best results.',
            },
            focus: {
              type: 'string',
              description: 'Optional focus area: "academic" for scholarly sources, "news" for recent news, "writing" for general information. Default is general search.',
              enum: ['academic', 'news', 'writing', 'general'],
            },
          },
          required: ['query'],
        },
      },
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
      },
    ];
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
        return this.toolSearchWeb(input.query, input.focus);

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
   * Tool: Search Web (Perplexity)
   */
  private async toolSearchWeb(query: string, focus?: string) {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    try {
      // Map focus to Perplexity model (2025 model names)
      const modelMap: Record<string, string> = {
        academic: 'sonar-pro',           // Enhanced for deep research
        news: 'sonar',                   // Fast for current info
        writing: 'sonar-reasoning',      // CoT for analysis
        general: 'sonar-pro',            // Best balance
      };

      const model = modelMap[focus || 'general'];

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful research assistant. Provide comprehensive, well-sourced answers with citations. Be thorough and accurate.',
            },
            {
              role: 'user',
              content: query,
            },
          ],
          temperature: 0.2,
          max_tokens: 4000,
          return_citations: true,
          return_images: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Perplexity API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as any;
      const answer = data.choices?.[0]?.message?.content || 'No results found';
      const citations = data.citations || [];

      console.log(`🔍 Web search completed: "${query.substring(0, 50)}..."`);

      return {
        query,
        answer,
        citations,
        model,
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
}

export const pagesAgentService = new PagesAgentService();

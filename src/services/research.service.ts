import Anthropic from '@anthropic-ai/sdk';
import { db } from '../lib/db.js';

interface ChatMessageOptions {
  sessionId: string;
  userMessage: string;
}

interface ChatResponse {
  assistantMessage: string;
  messageId: string;
}

interface GenerateDocumentOptions {
  sessionId: string;
  title?: string;
  format?: 'markdown' | 'text';
}

interface DocumentGenerationResult {
  documentId: string;
  title: string;
  content: string;
  format: string;
}

class ResearchService {
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
   * Generate a brief title for the session
   */
  private async generateTitle(sessionId: string): Promise<string> {
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 4, // First few messages for context
        },
      },
    });

    if (!session || session.messages.length === 0) {
      return session?.title || 'Untitled Session';
    }

    // Use first few messages to generate title
    const firstMessages = session.messages
      .slice(0, 4)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Ask Claude to generate a brief title
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: `Based on this conversation start, generate a short title (2-6 words) for this research session:\n\n${firstMessages}\n\nJust respond with the title, nothing else. No quotes or punctuation.`,
        },
      ],
    });

    const title = response.content
      .filter((block) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')
      .trim();

    return title || session.title;
  }

  /**
   * Generate a brief description/summary of the conversation
   */
  private async generateDescription(sessionId: string): Promise<string> {
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 20, // Last 20 messages for context
        },
      },
    });

    if (!session || session.messages.length === 0) {
      return 'Start chatting to auto-generate...';
    }

    // Build conversation context (last few messages)
    const recentMessages = session.messages
      .slice(-6) // Last 6 messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Ask Claude to generate a brief description
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Based on this conversation, generate a single brief sentence (max 15 words) describing what is being discussed:\n\n${recentMessages}\n\nJust respond with the description, nothing else.`,
        },
      ],
    });

    const description = response.content
      .filter((block) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')
      .trim();

    return description || 'Research session in progress';
  }

  /**
   * Send a chat message in a research session and get AI response
   */
  async chat(options: ChatMessageOptions): Promise<ChatResponse> {
    const { sessionId, userMessage } = options;

    // Verify session exists
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50, // Limit to last 50 messages for context
        },
        project: true,
      },
    });

    if (!session) {
      throw new Error('Research session not found');
    }

    // Save user message
    await db.researchMessage.create({
      data: {
        role: 'user',
        content: userMessage,
        sessionId: sessionId,
      },
    });

    // Build conversation history for Claude
    const conversationHistory: Anthropic.MessageParam[] = session.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add the new user message
    conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build system prompt based on session type
    let systemPrompt = '';
    if (session.type === 'research') {
      systemPrompt = `You are a helpful research assistant working on the project "${session.project.name}".

Your goal is to help the user conduct thorough research and gather requirements for their development task.

Ask clarifying questions, suggest considerations, and help organize thoughts into a clear, actionable plan.

Session: ${session.title}
${session.description ? `Context: ${session.description}` : ''}`;
    } else if (session.type === 'documentation') {
      systemPrompt = `You are a technical documentation assistant working on the project "${session.project.name}".

Your goal is to help the user create clear, comprehensive documentation.

Focus on clarity, completeness, and proper structure. Use markdown formatting when appropriate.

Session: ${session.title}
${session.description ? `Context: ${session.description}` : ''}`;
    } else {
      // notes type
      systemPrompt = `You are a helpful note-taking assistant for the project "${session.project.name}".

Help the user organize their thoughts, structure information, and keep clear notes about their project.

Session: ${session.title}
${session.description ? `Context: ${session.description}` : ''}`;
    }

    // Call Claude API
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      messages: conversationHistory,
    });

    // Extract assistant's response
    const assistantContent = response.content
      .filter((block) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    // Save assistant message
    const savedMessage = await db.researchMessage.create({
      data: {
        role: 'assistant',
        content: assistantContent,
        sessionId: sessionId,
      },
    });

    const messageCount = session.messages.length + 2; // +2 for the messages we just added

    // Auto-generate title from first message
    if (messageCount === 2) {
      try {
        const newTitle = await this.generateTitle(sessionId);
        await db.researchSession.update({
          where: { id: sessionId },
          data: { title: newTitle },
        });
        console.log(`📝 Updated session title: "${newTitle}"`);
      } catch (error) {
        console.error('Failed to auto-generate title:', error);
      }
    }

    // Auto-generate description every 2 messages (after each exchange)
    if (messageCount % 2 === 0) {
      try {
        const newDescription = await this.generateDescription(sessionId);
        await db.researchSession.update({
          where: { id: sessionId },
          data: { description: newDescription },
        });
        console.log(`📝 Updated session description: "${newDescription}"`);
      } catch (error) {
        console.error('Failed to auto-generate description:', error);
        // Don't fail the chat if description generation fails
      }
    }

    console.log(`💬 Research chat completed for session ${sessionId}`);

    return {
      assistantMessage: assistantContent,
      messageId: savedMessage.id,
    };
  }

  /**
   * Generate a document from the research session
   * This synthesizes all the conversation into a structured document
   */
  async generateDocument(options: GenerateDocumentOptions): Promise<DocumentGenerationResult> {
    const { sessionId, title, format = 'markdown' } = options;

    // Get session with all messages
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        project: true,
      },
    });

    if (!session) {
      throw new Error('Research session not found');
    }

    // Build conversation context
    const conversationText = session.messages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');

    // Ask Claude to synthesize the conversation into a document
    const systemPrompt = `You are a technical writer synthesizing a research conversation into a structured document.

Project: ${session.project.name}
Session: ${session.title}

Based on the conversation below, create a clear, well-organized document that captures:
- Key findings and insights
- Requirements and specifications
- Action items or recommendations
- Any important notes or considerations

Format the document in ${format === 'markdown' ? 'markdown' : 'plain text'} with appropriate headings and structure.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Please synthesize this conversation into a comprehensive document:\n\n${conversationText}`,
        },
      ],
    });

    const documentContent = response.content
      .filter((block) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    // Save document to database
    const document = await db.researchDocument.create({
      data: {
        title: title || `${session.title} - Document`,
        content: documentContent,
        format: format,
        sessionId: sessionId,
      },
    });

    // Update session with document content
    await db.researchSession.update({
      where: { id: sessionId },
      data: {
        documentTitle: document.title,
        documentContent: documentContent,
        documentFormat: format,
      },
    });

    console.log(`📄 Document generated for session ${sessionId}: ${document.id}`);

    return {
      documentId: document.id,
      title: document.title,
      content: documentContent,
      format: format,
    };
  }

  /**
   * Convert a research session to a task
   * This creates a new task in the kanban board's research column
   */
  async convertToTask(sessionId: string): Promise<string> {
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw new Error('Research session not found');
    }

    // Create a summary description from the session
    let description = session.description || '';

    // If there's a document, use that as the description
    if (session.documentContent) {
      description = session.documentContent;
    } else if (session.messages.length > 0) {
      // Otherwise, create a brief summary from messages
      description = `Research Notes:\n\n${session.messages
        .slice(0, 5)
        .map((msg) => `${msg.role}: ${msg.content.substring(0, 200)}...`)
        .join('\n\n')}`;
    }

    // Create task in research column
    const task = await db.task.create({
      data: {
        title: session.title,
        description: description,
        column: 'research',
        status: 'todo',
        priority: 'medium',
        projectId: session.projectId,
        researchSummary: {
          sessionId: session.id,
          messageCount: session.messages.length,
          hasDocument: !!session.documentContent,
        },
      },
    });

    // Update session status
    await db.researchSession.update({
      where: { id: sessionId },
      data: {
        status: 'converted_to_task',
        convertedTaskId: task.id,
      },
    });

    console.log(`✅ Converted research session ${sessionId} to task ${task.id}`);

    return task.id;
  }

  /**
   * Get all messages for a session
   */
  async getMessages(sessionId: string) {
    return db.researchMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get all documents for a session
   */
  async getDocuments(sessionId: string) {
    return db.researchDocument.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const researchService = new ResearchService();

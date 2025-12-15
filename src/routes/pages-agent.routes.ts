import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { pagesAgentService } from '../services/pages-agent.service.js';
import { db } from '../lib/db.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/projects/:projectId/agent/sessions
 * List all agent sessions for a project
 */
router.get(
  '/projects/:projectId/agent/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get all sessions for the project with message count
    const sessions = await db.agentSession.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    // Transform to the format expected by the frontend
    const formattedSessions = sessions.map((session) => ({
      id: session.id,
      title: session.title || `Research Chat`,
      status: session.status as 'active' | 'completed' | 'archived',
      messageCount: session._count.messages,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    }));

    res.json({ sessions: formattedSessions });
  })
);

/**
 * POST /api/projects/:projectId/agent/session
 * Create a new agent session
 */
router.post(
  '/projects/:projectId/agent/session',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const sessionId = await pagesAgentService.createSession(projectId, req.userId!);

    res.status(201).json({ sessionId });
  })
);

/**
 * POST /api/agent/:sessionId/chat
 * Send a message to the agent and get a response with streaming tool updates
 */
router.post(
  '/agent/:sessionId/chat',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { message, stream, searchEnabled = true, thinkingEnabled = false, codebaseEnabled = false } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // If streaming is requested, use SSE
    if (stream) {
      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send initial event
      res.write(`event: status\n`);
      res.write(`data: ${JSON.stringify({ status: 'thinking' })}\n\n`);

      // Tool callbacks for streaming
      const onToolStart = (toolName: string, input: any) => {
        res.write(`event: tool_start\n`);
        res.write(`data: ${JSON.stringify({ tool: toolName, input })}\n\n`);
      };

      const onToolComplete = (toolName: string, result: any) => {
        res.write(`event: tool_complete\n`);
        res.write(`data: ${JSON.stringify({ tool: toolName, success: !result.error })}\n\n`);
      };

      try {
        // Get agent response with callbacks
        const response = await pagesAgentService.chat({
          sessionId,
          userMessage: message,
          searchEnabled,
          thinkingEnabled,
          codebaseEnabled,
          onToolStart,
          onToolComplete,
        });

        // Send final response
        res.write(`event: complete\n`);
        res.write(`data: ${JSON.stringify({
          message: response.content,
          messageId: response.messageId,
          toolCalls: response.toolCalls,
        })}\n\n`);

        res.end();
      } catch (error: any) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming response (backward compatibility)
      const response = await pagesAgentService.chat({
        sessionId,
        userMessage: message,
        searchEnabled,
        thinkingEnabled,
        codebaseEnabled,
      });

      res.json({
        message: response.content,
        messageId: response.messageId,
        toolCalls: response.toolCalls,
      });
    }
  })
);

/**
 * GET /api/agent/:sessionId/messages
 * Get all messages in a session
 */
router.get(
  '/agent/:sessionId/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const messages = await pagesAgentService.getMessages(sessionId);

    res.json({ messages });
  })
);

/**
 * GET /api/agent/:sessionId/actions
 * Get all actions performed in a session
 */
router.get(
  '/agent/:sessionId/actions',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const actions = await pagesAgentService.getActions(sessionId);

    res.json({ actions });
  })
);

/**
 * POST /api/agent/:sessionId/synthesize
 * Synthesize research conversation into a buildable prompt
 */
router.post(
  '/agent/:sessionId/synthesize',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Synthesize the conversation into a prompt
    const result = await pagesAgentService.synthesizePrompt(sessionId);

    res.json(result);
  })
);

/**
 * POST /api/agent/:sessionId/synthesize-custom
 * Synthesize research conversation with a custom prompt for task or note creation
 */
router.post(
  '/agent/:sessionId/synthesize-custom',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { prompt, mode } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    if (!mode || !['task', 'note'].includes(mode)) {
      res.status(400).json({ error: 'Mode must be "task" or "note"' });
      return;
    }

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Synthesize with custom prompt
    const result = await pagesAgentService.synthesizeWithCustomPrompt(
      sessionId,
      prompt,
      mode as 'task' | 'note'
    );

    res.json({
      ...result,
      projectId: session.projectId,
    });
  })
);

/**
 * POST /api/agent/:sessionId/create-build-task
 * Create a task from synthesized prompt and move to Building column
 */
router.post(
  '/agent/:sessionId/create-build-task',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { prompt, title } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Create task in Building column with synthesized prompt
    const task = await pagesAgentService.createBuildTask(sessionId, session.projectId, {
      title: title || 'Build from Research',
      prompt,
    });

    res.status(201).json(task);
  })
);

/**
 * PATCH /api/agent/:sessionId
 * Update agent session (e.g., mark as completed)
 */
router.patch(
  '/agent/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { status } = req.body;

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Update session
    const updatedSession = await db.agentSession.update({
      where: { id: sessionId },
      data: {
        ...(status && { status }),
        ...(status === 'completed' && { completedAt: new Date() }),
      },
    });

    res.json({
      message: 'Session updated',
      session: updatedSession,
    });
  })
);

/**
 * DELETE /api/agent/:sessionId
 * Delete an agent session and all related messages/actions
 */
router.delete(
  '/agent/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Verify session access
    const session = await db.agentSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Agent session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Delete session (cascades to messages and actions)
    await db.agentSession.delete({
      where: { id: sessionId },
    });

    res.json({ message: 'Session deleted' });
  })
);

export default router;

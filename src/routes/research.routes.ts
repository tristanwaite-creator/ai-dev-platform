import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { db } from '../lib/db.js';
import { researchService } from '../services/research.service.js';

const router = Router();

// All research routes require authentication
router.use(authenticate);

/**
 * GET /projects/:projectId/research
 * Get all research sessions for a project
 */
router.get(
  '/projects/:projectId/research',
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

    const sessions = await db.researchSession.findMany({
      where: { projectId },
      include: {
        _count: {
          select: {
            messages: true,
            documents: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ sessions });
  })
);

/**
 * POST /projects/:projectId/research
 * Create a new research session
 */
router.post(
  '/projects/:projectId/research',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { title, description, type = 'research' } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Session title is required' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const validTypes = ['research', 'notes', 'documentation'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: 'Invalid session type. Must be: research, notes, or documentation' });
      return;
    }

    const session = await db.researchSession.create({
      data: {
        title,
        description,
        type,
        projectId,
      },
    });

    console.log(`📋 Created research session: ${session.id} for project ${projectId}`);

    res.status(201).json({
      message: 'Research session created successfully',
      session,
    });
  })
);

/**
 * GET /research/:sessionId
 * Get a specific research session with messages
 */
router.get(
  '/research/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        project: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            messages: true,
            documents: true,
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({ session });
  })
);

/**
 * PATCH /research/:sessionId
 * Update a research session
 */
router.patch(
  '/research/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { title, description, status } = req.body;

    const existingSession = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!existingSession) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: existingSession.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const session = await db.researchSession.update({
      where: { id: sessionId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
      },
    });

    res.json({
      message: 'Research session updated successfully',
      session,
    });
  })
);

/**
 * DELETE /research/:sessionId
 * Delete a research session
 */
router.delete(
  '/research/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const existingSession = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!existingSession) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: existingSession.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await db.researchSession.delete({
      where: { id: sessionId },
    });

    res.json({ message: 'Research session deleted successfully' });
  })
);

/**
 * POST /research/:sessionId/chat
 * Send a message in a research session and get AI response
 */
router.post(
  '/research/:sessionId/chat',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Verify session exists and user has access
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get AI response
    const response = await researchService.chat({
      sessionId,
      userMessage: message,
    });

    // Update session timestamp and get updated session
    const updatedSession = await db.researchSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    res.json({
      message: 'Chat message sent successfully',
      response: response.assistantMessage,
      messageId: response.messageId,
      sessionTitle: updatedSession.title, // Return updated title
      sessionDescription: updatedSession.description, // Return updated description
    });
  })
);

/**
 * GET /research/:sessionId/messages
 * Get all messages for a research session
 */
router.get(
  '/research/:sessionId/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Verify session exists and user has access
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const messages = await researchService.getMessages(sessionId);

    res.json({ messages });
  })
);

/**
 * POST /research/:sessionId/generate-document
 * Generate a document from the research session
 */
router.post(
  '/research/:sessionId/generate-document',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { title, format = 'markdown' } = req.body;

    // Verify session exists and user has access
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const validFormats = ['markdown', 'text'];
    if (!validFormats.includes(format)) {
      res.status(400).json({ error: 'Invalid format. Must be: markdown or text' });
      return;
    }

    const document = await researchService.generateDocument({
      sessionId,
      title,
      format,
    });

    res.status(201).json({
      message: 'Document generated successfully',
      document,
    });
  })
);

/**
 * GET /research/:sessionId/documents
 * Get all documents for a research session
 */
router.get(
  '/research/:sessionId/documents',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Verify session exists and user has access
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const documents = await researchService.getDocuments(sessionId);

    res.json({ documents });
  })
);

/**
 * POST /research/:sessionId/convert-to-task
 * Convert a research session to a task in the kanban board
 */
router.post(
  '/research/:sessionId/convert-to-task',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Verify session exists and user has access
    const session = await db.researchSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      res.status(404).json({ error: 'Research session not found' });
      return;
    }

    const project = await db.project.findFirst({
      where: { id: session.projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check if already converted
    if (session.status === 'converted_to_task') {
      res.status(400).json({
        error: 'Session already converted to task',
        taskId: session.convertedTaskId,
      });
      return;
    }

    const taskId = await researchService.convertToTask(sessionId);

    const task = await db.task.findUnique({
      where: { id: taskId },
    });

    res.status(201).json({
      message: 'Research session converted to task successfully',
      task,
    });
  })
);

export default router;

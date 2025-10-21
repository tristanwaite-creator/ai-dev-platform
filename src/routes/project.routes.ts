import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { db } from '../lib/db.js';
import { e2bService } from '../lib/e2b.js';
import { githubIntegrationService } from '../services/github-integration.service.js';

const router = Router();

// All project routes require authentication
router.use(authenticate);

/**
 * GET /projects
 * List all projects for the authenticated user
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const projects = await db.project.findMany({
      where: { userId: req.userId! },
      include: {
        _count: {
          select: {
            tasks: true,
            generations: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ projects });
  })
);

/**
 * GET /projects/:id
 * Get a single project by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const project = await db.project.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
      include: {
        tasks: {
          orderBy: { order: 'asc' },
        },
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Latest 10 generations
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ project });
  })
);

/**
 * GET /projects/:id/view
 * Get unified project view with research sessions and kanban board
 */
router.get(
  '/:id/view',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
      include: {
        researchSessions: {
          where: { status: 'active' },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          include: {
            _count: { select: { messages: true } }
          }
        },
        tasks: {
          orderBy: [{ column: 'asc' }, { order: 'asc' }],
          include: {
            generations: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        },
        _count: {
          select: {
            researchSessions: true,
            tasks: true,
            generations: true
          }
        }
      }
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Group tasks by column for Kanban
    const board = {
      research: project.tasks.filter(t => t.column === 'research'),
      building: project.tasks.filter(t => t.column === 'building'),
      testing: project.tasks.filter(t => t.column === 'testing'),
      done: project.tasks.filter(t => t.column === 'done')
    };

    res.json({
      project: {
        ...project,
        tasks: undefined // Remove to avoid duplication
      },
      researchSessions: project.researchSessions,
      board,
      stats: project._count
    });
  })
);

/**
 * POST /projects
 * Create a new project
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, githubRepoUrl, githubRepoId, defaultBranch, settings } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }

    const project = await db.project.create({
      data: {
        name,
        description,
        githubRepoUrl,
        githubRepoId,
        defaultBranch: defaultBranch || 'main',
        settings,
        userId: req.userId!,
      },
    });

    res.status(201).json({
      message: 'Project created successfully',
      project,
    });
  })
);

/**
 * POST /projects/create-with-github
 * Create a new project and GitHub repository in one step
 */
router.post(
  '/create-with-github',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, repoName, private: isPrivate } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }

    if (!repoName) {
      res.status(400).json({ error: 'Repository name is required' });
      return;
    }

    // Verify user has GitHub integration
    const user = await db.user.findUnique({
      where: { id: req.userId! },
    });

    if (!user?.githubAccessToken) {
      res.status(400).json({
        error: 'GitHub integration required. Please connect your GitHub account first.',
        requiresGitHub: true
      });
      return;
    }

    // Create project first
    const project = await db.project.create({
      data: {
        name,
        description,
        defaultBranch: 'main',
        userId: req.userId!,
      },
    });

    try {
      // Create GitHub repository and link it to the project
      await githubIntegrationService.createRepository(project.id, repoName, {
        description,
        private: isPrivate ?? true,
      });

      // Fetch updated project with GitHub details
      const updatedProject = await db.project.findUnique({
        where: { id: project.id },
      });

      res.status(201).json({
        message: 'Project and GitHub repository created successfully',
        project: updatedProject,
      });
    } catch (error: any) {
      // If GitHub repo creation fails, delete the project
      await db.project.delete({ where: { id: project.id } });

      res.status(500).json({
        error: error.message || 'Failed to create GitHub repository',
      });
    }
  })
);

/**
 * PATCH /projects/:id
 * Update a project
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, githubRepoUrl, githubRepoId, defaultBranch, settings, sandboxStatus } = req.body;

    // Verify ownership
    const existingProject = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existingProject) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = await db.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(githubRepoUrl !== undefined && { githubRepoUrl }),
        ...(githubRepoId !== undefined && { githubRepoId }),
        ...(defaultBranch && { defaultBranch }),
        ...(settings !== undefined && { settings }),
        ...(sandboxStatus && { sandboxStatus }),
      },
    });

    res.json({
      message: 'Project updated successfully',
      project,
    });
  })
);

/**
 * DELETE /projects/:id
 * Delete a project
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify ownership
    const existingProject = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existingProject) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await db.project.delete({
      where: { id },
    });

    res.json({ message: 'Project deleted successfully' });
  })
);

/**
 * GET /projects/:id/tasks
 * Get all tasks for a project
 */
router.get(
  '/:id/tasks',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const tasks = await db.task.findMany({
      where: { projectId: id },
      orderBy: [{ status: 'asc' }, { order: 'asc' }],
    });

    res.json({ tasks });
  })
);

/**
 * POST /projects/:id/tasks
 * Create a new task for a project
 */
router.post(
  '/:id/tasks',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, description, status, priority, order, column } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Task title is required' });
      return;
    }

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const task = await db.task.create({
      data: {
        title,
        description,
        status: status || 'todo',
        priority: priority || 'medium',
        order: order || 0,
        column: column || 'research', // New tasks default to research column
        projectId: id,
      },
    });

    res.status(201).json({
      message: 'Task created successfully',
      task,
    });
  })
);

/**
 * PATCH /projects/:projectId/tasks/:taskId
 * Update a task
 */
router.patch(
  '/:projectId/tasks/:taskId',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId, taskId } = req.params;
    const { title, description, status, priority, order } = req.body;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get existing task
    const existingTask = await db.task.findFirst({
      where: { id: taskId, projectId },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Track if status is changing to 'review'
    const isMovingToReview = status === 'review' && existingTask.status !== 'review';

    // Update task
    const task = await db.task.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(order !== undefined && { order }),
        ...(status === 'done' && { completedAt: new Date() }),
      },
    });

    // Auto-create PR if status changed to 'review' and project has GitHub integration
    let prUrl: string | undefined;
    let prNumber: number | undefined;

    if (isMovingToReview && project.githubRepoOwner && task.branchName) {
      try {
        console.log(`🐙 Auto-creating PR for task ${taskId} moving to review...`);
        const prResult = await githubIntegrationService.createPullRequest(taskId);
        prUrl = prResult.prUrl;
        prNumber = prResult.prNumber;
        console.log(`✅ PR created successfully: ${prUrl}`);
      } catch (error) {
        // Don't fail the update if PR creation fails
        console.error('⚠️ PR creation failed (non-fatal):', error);
        // Send warning in response but don't fail
      }
    }

    res.json({
      message: 'Task updated successfully',
      task,
      ...(prUrl && { pr: { url: prUrl, number: prNumber } }),
      ...(isMovingToReview && !prUrl && {
        warning: 'Task moved to review but PR creation failed. Please create PR manually or ensure the task has a branch with commits.'
      }),
    });
  })
);

/**
 * GET /projects/:id/board
 * Get all tasks grouped by Kanban board column
 */
router.get(
  '/:id/board',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get all tasks grouped by column
    const tasks = await db.task.findMany({
      where: { projectId: id },
      orderBy: [{ column: 'asc' }, { order: 'asc' }],
      include: {
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Latest generation only
        },
      },
    });

    // Group tasks by column
    const board = {
      research: tasks.filter(t => t.column === 'research'),
      building: tasks.filter(t => t.column === 'building'),
      testing: tasks.filter(t => t.column === 'testing'),
      done: tasks.filter(t => t.column === 'done'),
    };

    res.json({ board, project });
  })
);

/**
 * PATCH /projects/:projectId/tasks/:taskId/move
 * Move a task to a different column
 * Auto-triggers code generation when moving to "building" column
 * Auto-merges to main branch when moving to "done" column
 */
router.patch(
  '/:projectId/tasks/:taskId/move',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId, taskId } = req.params;
    const { column, order } = req.body;

    if (!column) {
      res.status(400).json({ error: 'Column is required' });
      return;
    }

    const validColumns = ['research', 'building', 'testing', 'done'];
    if (!validColumns.includes(column)) {
      res.status(400).json({ error: 'Invalid column. Must be one of: research, building, testing, done' });
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

    // Get existing task
    const existingTask = await db.task.findFirst({
      where: { id: taskId, projectId },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Detect if moving to "building" column
    const isMovingToBuilding = column === 'building' && existingTask.column !== 'building';

    // Detect if moving to "done" column
    const isMovingToDone = column === 'done' && existingTask.column !== 'done';

    // Update task column and buildStatus
    const task = await db.task.update({
      where: { id: taskId },
      data: {
        column,
        ...(order !== undefined && { order }),
        ...(isMovingToBuilding && { buildStatus: 'generating' }),
      },
    });

    // Auto-trigger code generation when moving to "building"
    if (isMovingToBuilding) {
      console.log(`🔨 Auto-triggering generation for task ${taskId} moving to Building...`);

      // Trigger generation asynchronously (don't wait for completion)
      // This will run in the background while we return the response
      const generationPrompt = task.description
        ? `${task.title}\n\n${task.description}`
        : task.title;

      // Import the generation service dynamically to avoid circular dependencies
      import('../services/generation.service.js')
        .then(({ generationService }) => {
          return generationService.generateCode({
            prompt: generationPrompt,
            projectId,
            taskId,
            autoCommit: true, // Auto-commit if GitHub is configured
          });
        })
        .then(() => {
          console.log(`✅ Generation completed for task ${taskId}`);
        })
        .catch(async (error) => {
          console.error(`❌ Generation failed for task ${taskId}:`, error);
          // Update task buildStatus to failed
          await db.task.update({
            where: { id: taskId },
            data: { buildStatus: 'failed' },
          });
        });
    }

    // Auto-merge to main branch when moving to "done"
    let mergeResult: { merged: boolean; prUrl?: string; prNumber?: number } | undefined;
    if (isMovingToDone && project.githubRepoOwner && task.branchName) {
      console.log(`✅ Auto-merging task ${taskId} to main branch...`);

      // Trigger merge asynchronously
      githubIntegrationService
        .mergeTaskToMain(taskId)
        .then((result) => {
          console.log(`🎉 Successfully merged task ${taskId} to main: ${result.prUrl}`);
        })
        .catch((error) => {
          console.error(`⚠️ Failed to merge task ${taskId} to main (non-fatal):`, error);
        });
    }

    res.json({
      message: 'Task moved successfully',
      task,
      ...(isMovingToBuilding && {
        generationTriggered: true,
        note: 'Code generation started in the background. Check back soon!'
      }),
      ...(isMovingToDone && project.githubRepoOwner && task.branchName && {
        mergeTriggered: true,
        note: 'Branch is being merged to main. Check GitHub for the merged PR!'
      }),
    });
  })
);

/**
 * PATCH /projects/:projectId/tasks/:taskId/reorder
 * Reorder a task within its column
 */
router.patch(
  '/:projectId/tasks/:taskId/reorder',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId, taskId } = req.params;
    const { order } = req.body;

    if (order === undefined) {
      res.status(400).json({ error: 'Order is required' });
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

    // Get existing task
    const existingTask = await db.task.findFirst({
      where: { id: taskId, projectId },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Update task order
    const task = await db.task.update({
      where: { id: taskId },
      data: { order },
    });

    res.json({
      message: 'Task reordered successfully',
      task,
    });
  })
);

/**
 * DELETE /projects/:projectId/tasks/:taskId
 * Delete a task
 */
router.delete(
  '/:projectId/tasks/:taskId',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId, taskId } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get existing task
    const existingTask = await db.task.findFirst({
      where: { id: taskId, projectId },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Delete task (cascades to generations and research messages)
    await db.task.delete({
      where: { id: taskId },
    });

    res.json({ message: 'Task deleted successfully' });
  })
);

/**
 * POST /projects/:id/sandbox
 * Create/activate E2B sandbox for a project
 */
router.post(
  '/:id/sandbox',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Check if sandbox already exists
    if (project.sandboxId && project.sandboxStatus === 'active') {
      const sandboxUrl = e2bService.getSandboxUrl(project.sandboxId);
      res.json({
        message: 'Sandbox already active',
        sandboxId: project.sandboxId,
        sandboxUrl,
        status: 'active',
      });
      return;
    }

    // Create new sandbox
    const sandboxInfo = await e2bService.createSandbox({ projectId: id });
    const sandboxUrl = e2bService.getSandboxUrl(sandboxInfo.sandboxId);

    res.status(201).json({
      message: 'Sandbox created successfully',
      sandboxId: sandboxInfo.sandboxId,
      sandboxUrl,
      status: 'active',
      expiresAt: sandboxInfo.expiresAt,
    });
  })
);

/**
 * DELETE /projects/:id/sandbox
 * Close/deactivate E2B sandbox for a project
 */
router.delete(
  '/:id/sandbox',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!project.sandboxId) {
      res.status(404).json({ error: 'No sandbox found for this project' });
      return;
    }

    // Close sandbox
    await e2bService.closeSandbox(project.sandboxId, id);

    res.json({ message: 'Sandbox closed successfully' });
  })
);

/**
 * GET /projects/:id/sandbox
 * Get sandbox information for a project
 */
router.get(
  '/:id/sandbox',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!project.sandboxId) {
      res.json({
        status: 'inactive',
        message: 'No sandbox created for this project',
      });
      return;
    }

    const sandboxInfo = e2bService.getSandbox(project.sandboxId);
    const sandboxUrl = e2bService.getSandboxUrl(project.sandboxId);

    if (!sandboxInfo) {
      // Sandbox expired or was cleaned up
      await db.project.update({
        where: { id },
        data: { sandboxStatus: 'inactive' },
      });

      res.json({
        status: 'inactive',
        message: 'Sandbox has expired',
        sandboxId: project.sandboxId,
      });
      return;
    }

    res.json({
      status: 'active',
      sandboxId: project.sandboxId,
      sandboxUrl,
      expiresAt: sandboxInfo.expiresAt,
    });
  })
);

/**
 * GET /projects/:id/sandbox/files
 * List files in the project's sandbox
 */
router.get(
  '/:id/sandbox/files',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { path = '/' } = req.query;

    // Verify project ownership
    const project = await db.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!project.sandboxId) {
      res.status(404).json({ error: 'No sandbox found for this project' });
      return;
    }

    const sandboxInfo = e2bService.getSandbox(project.sandboxId);
    if (!sandboxInfo) {
      res.status(404).json({ error: 'Sandbox not active or expired' });
      return;
    }

    try {
      const files = await e2bService.listFiles(project.sandboxId, path as string);
      res.json({ files, path });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list files',
      });
    }
  })
);

/**
 * GET /projects/:id/sandbox/stats
 * Get sandbox statistics
 */
router.get(
  '/:id/sandbox/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const stats = e2bService.getStats();
    res.json(stats);
  })
);

export default router;

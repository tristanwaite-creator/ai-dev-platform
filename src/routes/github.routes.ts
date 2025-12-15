import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { githubIntegrationService } from '../services/github-integration.service.js';
import { createGitHubService } from '../lib/github-factory.js';
import { db } from '../lib/db.js';

const router = Router();

// ============================================
// Repository Management
// ============================================

/**
 * Create new project with GitHub repo (no auth required - for anonymous users)
 * POST /api/github/quick-start
 */
router.post(
  '/github/quick-start',
  asyncHandler(async (req, res) => {
    const { githubToken, projectName, repoName, description, private: isPrivate } = req.body;

    if (!githubToken) {
      return res.status(400).json({ error: 'GitHub personal access token is required' });
    }

    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    if (!repoName) {
      return res.status(400).json({ error: 'Repository name is required' });
    }

    try {
      // Import Octokit for direct GitHub API access
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: githubToken });

      // Create repository
      const { data: repo } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: description || projectName,
        private: isPrivate ?? true,
        auto_init: true,
      });

      // Get authenticated user info
      const { data: githubUser } = await octokit.users.getAuthenticated();

      // Create anonymous user placeholder (or find existing by GitHub ID)
      let user = await db.user.findFirst({
        where: { githubId: String(githubUser.id) },
      });

      if (!user) {
        // Create temporary user for anonymous GitHub integration
        user = await db.user.create({
          data: {
            email: `github-${githubUser.id}@temp.local`,
            password: null, // No password for GitHub-only users
            name: githubUser.name || githubUser.login,
            githubId: String(githubUser.id),
            githubUsername: githubUser.login,
            githubAccessToken: githubToken,
          },
        });
      }

      // Create project
      const project = await db.project.create({
        data: {
          name: projectName,
          description: description || '',
          githubRepoUrl: repo.html_url,
          githubRepoId: String(repo.id),
          githubRepoOwner: githubUser.login,
          githubRepoName: repo.name,
          defaultBranch: repo.default_branch || 'main',
          userId: user.id,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Project and GitHub repository created successfully',
        project: {
          id: project.id,
          name: project.name,
          githubRepoUrl: repo.html_url,
        },
        repo: {
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          owner: githubUser.login,
          defaultBranch: repo.default_branch,
        },
      });
    } catch (error: any) {
      console.error('GitHub quick-start error:', error);
      res.status(500).json({
        error: error.message || 'Failed to create project and repository',
        details: error.response?.data?.message,
      });
    }
  })
);

/**
 * Create new project with GitHub repo (authenticated - uses OAuth session)
 * POST /api/github/create-project-auth
 */
router.post(
  '/github/create-project-auth',
  asyncHandler(async (req, res) => {
    const { projectName, repoName, description, private: isPrivate } = req.body;

    // Get session token from header or query
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.query.session;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Session token required' });
    }

    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    if (!repoName) {
      return res.status(400).json({ error: 'Repository name is required' });
    }

    try {
      // Verify session and get user
      const { default: jwt } = await import('jsonwebtoken');
      const decoded = jwt.verify(sessionToken as string, process.env.JWT_SECRET!) as { userId: string };

      const user = await db.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          githubId: true,
          githubUsername: true,
          githubAccessToken: true,
        },
      });

      if (!user || !user.githubAccessToken) {
        return res.status(401).json({ error: 'Invalid session or no GitHub access token' });
      }

      // Decrypt GitHub token
      const { decrypt } = await import('../lib/encryption.js');
      const githubToken = decrypt(user.githubAccessToken);

      // Import Octokit for direct GitHub API access
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: githubToken });

      // Create repository
      const { data: repo } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: description || projectName,
        private: isPrivate ?? true,
        auto_init: true,
      });

      // Get authenticated user info
      const { data: githubUser } = await octokit.users.getAuthenticated();

      // Create project
      const project = await db.project.create({
        data: {
          name: projectName,
          description: description || '',
          githubRepoUrl: repo.html_url,
          githubRepoId: String(repo.id),
          githubRepoOwner: githubUser.login,
          githubRepoName: repo.name,
          defaultBranch: repo.default_branch || 'main',
          userId: user.id,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Project and GitHub repository created successfully',
        project: {
          id: project.id,
          name: project.name,
          githubRepoUrl: repo.html_url,
        },
        repo: {
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          owner: githubUser.login,
          defaultBranch: repo.default_branch,
        },
      });
    } catch (error: any) {
      console.error('GitHub create-project-auth error:', error);
      res.status(500).json({
        error: error.message || 'Failed to create project and repository',
        details: error.response?.data?.message,
      });
    }
  })
);

/**
 * Create task for a project (no auth required)
 * POST /api/github/create-task
 */
router.post(
  '/github/create-task',
  asyncHandler(async (req, res) => {
    const { projectId, title, description } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    try {
      const project = await db.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const task = await db.task.create({
        data: {
          title,
          description: description || '',
          status: 'todo',
          priority: 'medium',
          order: 0,
          projectId,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Task created successfully',
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
        },
      });
    } catch (error: any) {
      console.error('Task creation error:', error);
      res.status(500).json({
        error: error.message || 'Failed to create task',
      });
    }
  })
);

/**
 * Link existing GitHub repo to project
 * POST /api/projects/:id/github
 */
router.post(
  '/projects/:id/github',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }

    await githubIntegrationService.linkRepository(projectId, repoUrl);

    const project = await db.project.findUnique({ where: { id: projectId } });

    res.json({ success: true, project });
  })
);

/**
 * Create new GitHub repo for project
 * POST /api/projects/:id/github/create
 */
router.post(
  '/projects/:id/github/create',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { name, description, private: isPrivate } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    await githubIntegrationService.createRepository(projectId, name, {
      description,
      private: isPrivate,
    });

    const project = await db.project.findUnique({ where: { id: projectId } });

    res.json({ success: true, project });
  })
);

/**
 * Get GitHub repo info for project
 * GET /api/projects/:id/github
 */
router.get(
  '/projects/:id/github',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { user: true },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.githubRepoOwner || !project.githubRepoName) {
      return res.json({ linked: false });
    }

    const github = await createGitHubService(project.userId);

    const [repo, branches, commits] = await Promise.all([
      github.getRepository(project.githubRepoOwner, project.githubRepoName),
      github.listBranches(project.githubRepoOwner, project.githubRepoName),
      github.listCommits(
        project.githubRepoOwner,
        project.githubRepoName,
        project.defaultBranch || 'main',
        5
      ),
    ]);

    res.json({
      linked: true,
      repo,
      branches,
      recentCommits: commits,
    });
  })
);

// ============================================
// Task Git Operations
// ============================================

/**
 * Create pull request for task
 * POST /api/tasks/:id/pr
 */
router.post(
  '/tasks/:id/pr',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id: taskId } = req.params;

    const { prUrl, prNumber } = await githubIntegrationService.createPullRequest(taskId);

    const task = await db.task.findUnique({ where: { id: taskId } });

    res.json({ success: true, task, prUrl, prNumber });
  })
);

/**
 * Get task's GitHub info
 * GET /api/tasks/:id/github
 */
router.get(
  '/tasks/:id/github',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id: taskId } = req.params;

    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        project: { include: { user: true } },
        generations: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!task.branchName) {
      return res.json({ hasBranch: false });
    }

    const project = task.project;

    if (!project.githubRepoOwner || !project.githubRepoName) {
      return res.json({ repoLinked: false });
    }

    const github = await createGitHubService(project.userId);

    const [branch, commits, pullRequest] = await Promise.all([
      github.getBranch(project.githubRepoOwner, project.githubRepoName, task.branchName),
      github.listCommits(project.githubRepoOwner, project.githubRepoName, task.branchName),
      task.prNumber
        ? github.getPullRequest(project.githubRepoOwner, project.githubRepoName, task.prNumber)
        : null,
    ]);

    res.json({
      hasBranch: true,
      repoLinked: true,
      branch,
      commits,
      pullRequest,
    });
  })
);

// ============================================
// GitHub Repository Import
// ============================================

/**
 * List user's GitHub repositories
 * GET /api/github/repos
 */
router.get(
  '/github/repos',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await db.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        githubAccessToken: true,
      },
    });

    if (!user || !user.githubAccessToken) {
      return res.status(400).json({ error: 'GitHub not connected. Please connect your GitHub account.' });
    }

    // Decrypt GitHub token
    const { decrypt } = await import('../lib/encryption.js');
    const githubToken = decrypt(user.githubAccessToken);

    // Import Octokit for direct GitHub API access
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: githubToken });

    // Fetch repositories
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 50;

    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      page,
      per_page: perPage,
      sort: 'updated',
      affiliation: 'owner,collaborator',
    });

    // Get list of already imported repos
    const existingProjects = await db.project.findMany({
      where: { userId: req.userId! },
      select: { githubRepoId: true },
    });
    const importedRepoIds = new Set(existingProjects.map(p => p.githubRepoId).filter(Boolean));

    // Format repos with import status
    const formattedRepos = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      owner: repo.owner.login,
      updatedAt: repo.updated_at,
      language: repo.language,
      imported: importedRepoIds.has(String(repo.id)),
    }));

    res.json({ repos: formattedRepos });
  })
);

/**
 * Import an existing GitHub repository as a project
 * POST /api/github/import-repo
 */
router.post(
  '/github/import-repo',
  authenticate,
  asyncHandler(async (req, res) => {
    const { repoId, repoFullName } = req.body;

    if (!repoId && !repoFullName) {
      return res.status(400).json({ error: 'Either repoId or repoFullName is required' });
    }

    const user = await db.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        githubAccessToken: true,
      },
    });

    if (!user || !user.githubAccessToken) {
      return res.status(400).json({ error: 'GitHub not connected. Please connect your GitHub account.' });
    }

    // Check if already imported
    if (repoId) {
      const existing = await db.project.findFirst({
        where: { userId: req.userId!, githubRepoId: String(repoId) },
      });
      if (existing) {
        return res.status(400).json({ error: 'Repository already imported', projectId: existing.id });
      }
    }

    // Decrypt GitHub token
    const { decrypt } = await import('../lib/encryption.js');
    const githubToken = decrypt(user.githubAccessToken);

    // Import Octokit for direct GitHub API access
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: githubToken });

    // Fetch repository details
    let repo;
    if (repoId) {
      const { data } = await octokit.request('GET /repositories/{repository_id}', {
        repository_id: repoId,
      });
      repo = data;
    } else {
      const [owner, name] = repoFullName.split('/');
      const { data } = await octokit.repos.get({ owner, repo: name });
      repo = data;
    }

    // Create project from repo
    const project = await db.project.create({
      data: {
        name: repo.name,
        description: repo.description || '',
        githubRepoUrl: repo.html_url,
        githubRepoId: String(repo.id),
        githubRepoOwner: repo.owner.login,
        githubRepoName: repo.name,
        defaultBranch: repo.default_branch || 'main',
        userId: user.id,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Repository imported successfully',
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        githubRepoUrl: project.githubRepoUrl,
      },
    });
  })
);

export default router;

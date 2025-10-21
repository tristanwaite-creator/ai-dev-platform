import { db } from '../lib/db.js';
import { createGitHubService } from '../lib/github-factory.js';
import { slugify, parseRepoUrl } from '../lib/github.js';
import { generateCommitMessage } from '../lib/commit-message-generator.js';
import { e2bService } from '../lib/e2b.js';
import type { FileChange } from '../lib/github.js';

export class GitHubIntegrationService {
  /**
   * Link existing GitHub repository to project
   */
  async linkRepository(projectId: string, repoUrl: string): Promise<void> {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { user: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      throw new Error('Invalid GitHub repository URL');
    }

    const github = await createGitHubService(project.userId);

    // Verify repository exists and user has access
    try {
      const repo = await github.getRepository(parsed.owner, parsed.name);

      await db.project.update({
        where: { id: projectId },
        data: {
          githubRepoUrl: repoUrl,
          githubRepoId: String(repo.id),
          githubRepoOwner: parsed.owner,
          githubRepoName: parsed.name,
          defaultBranch: repo.default_branch,
        },
      });
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error('Repository not found or you do not have access');
      }
      throw error;
    }
  }

  /**
   * Create new GitHub repository for project
   */
  async createRepository(
    projectId: string,
    name: string,
    options: { description?: string; private?: boolean } = {}
  ): Promise<void> {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { user: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const github = await createGitHubService(project.userId);

    const repo = await github.createRepository(name, {
      description: options.description || project.description || undefined,
      private: options.private ?? true,
      autoInit: true,
    });

    await db.project.update({
      where: { id: projectId },
      data: {
        githubRepoUrl: repo.html_url,
        githubRepoId: String(repo.id),
        githubRepoOwner: repo.owner.login,
        githubRepoName: repo.name,
        defaultBranch: repo.default_branch,
      },
    });
  }

  /**
   * Ensure task has a branch, create if needed
   */
  async ensureTaskBranch(taskId: string): Promise<string> {
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { user: true } } },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    // Return existing branch if present
    if (task.branchName) {
      return task.branchName;
    }

    const project = task.project;

    if (!project.githubRepoOwner || !project.githubRepoName) {
      throw new Error('Project not linked to GitHub repository');
    }

    const github = await createGitHubService(project.userId);

    // Create branch name
    const branchName = `task/${taskId}/${slugify(task.title)}`;

    // Create branch from default branch
    await github.createBranch(
      project.githubRepoOwner,
      project.githubRepoName,
      branchName,
      project.defaultBranch || 'main'
    );

    // Store branch name in task
    await db.task.update({
      where: { id: taskId },
      data: { branchName },
    });

    return branchName;
  }

  /**
   * Commit generated files to GitHub
   */
  async commitGeneratedFiles(
    generationId: string
  ): Promise<{ commitSha: string; commitUrl: string }> {
    const generation = await db.generation.findUnique({
      where: { id: generationId },
      include: {
        project: { include: { user: true } },
        task: true,
      },
    });

    if (!generation) {
      throw new Error('Generation not found');
    }

    const { project, task } = generation;

    if (!project.githubRepoOwner || !project.githubRepoName) {
      throw new Error('Project not linked to GitHub repository');
    }

    if (!task) {
      throw new Error('Generation not linked to a task');
    }

    // Ensure branch exists
    const branchName = await this.ensureTaskBranch(task.id);

    // Download files from E2B sandbox
    if (!generation.sandboxId) {
      throw new Error('Generation has no sandbox');
    }

    const files = await this.downloadFilesFromSandbox(generation.sandboxId);

    if (files.length === 0) {
      throw new Error('No files to commit');
    }

    // Generate semantic commit message
    const commitMessage = await generateCommitMessage(
      files,
      task.description || task.title,
      generation.prompt
    );

    // Create commit
    const github = await createGitHubService(project.userId);

    const commit = await github.createCommit(
      project.githubRepoOwner,
      project.githubRepoName,
      branchName,
      files,
      commitMessage
    );

    // Update generation with commit info
    await db.generation.update({
      where: { id: generationId },
      data: {
        commitSha: commit.sha,
        commitUrl: commit.html_url,
      },
    });

    return {
      commitSha: commit.sha,
      commitUrl: commit.html_url,
    };
  }

  /**
   * Download files from E2B sandbox (recursively)
   */
  private async downloadFilesFromSandbox(sandboxId: string): Promise<FileChange[]> {
    const files: FileChange[] = [];

    // Recursive function to list all files in directory tree
    const listFilesRecursively = async (directory: string): Promise<void> => {
      const entries = await e2bService.listFiles(sandboxId, directory);

      for (const entry of entries) {
        // Skip node_modules and hidden files
        if (entry.name.includes('node_modules') || entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = `${directory}/${entry.name}`.replace('//', '/');

        if (entry.isDirectory) {
          // Recursively list subdirectories
          await listFilesRecursively(fullPath);
        } else {
          // Read file content
          try {
            console.log(`📥 Reading file from E2B: ${fullPath}`);
            const content = await e2bService.readFile(sandboxId, fullPath);
            const relativePath = fullPath.replace('/home/user/', '');

            files.push({
              path: relativePath,
              content,
            });
            console.log(`✅ Added file: ${relativePath} (${content.length} bytes)`);
          } catch (error) {
            console.error(`❌ Failed to read file ${fullPath}:`, error);
          }
        }
      }
    };

    await listFilesRecursively('/home/user');

    console.log(`📦 Downloaded ${files.length} files from E2B sandbox`);
    return files;
  }

  /**
   * Create pull request for task
   */
  async createPullRequest(taskId: string): Promise<{ prUrl: string; prNumber: number }> {
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        project: { include: { user: true } },
        generations: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (!task.branchName) {
      throw new Error('Task has no branch. Generate code first.');
    }

    const project = task.project;

    if (!project.githubRepoOwner || !project.githubRepoName) {
      throw new Error('Project not linked to GitHub repository');
    }

    const github = await createGitHubService(project.userId);

    // Generate PR description
    const prBody = this.generatePRDescription(task, task.generations);

    // Create pull request
    const pr = await github.createPullRequest(project.githubRepoOwner, project.githubRepoName, {
      title: task.title,
      body: prBody,
      head: task.branchName,
      base: project.defaultBranch || 'main',
      draft: false,
    });

    // Update task with PR info
    await db.task.update({
      where: { id: taskId },
      data: {
        prUrl: pr.html_url,
        prNumber: pr.number,
      },
    });

    return {
      prUrl: pr.html_url,
      prNumber: pr.number,
    };
  }

  /**
   * Merge task branch to main branch
   */
  async mergeTaskToMain(
    taskId: string
  ): Promise<{ merged: boolean; prUrl?: string; prNumber?: number }> {
    const task = await db.task.findUnique({
      where: { id: taskId },
      include: {
        project: { include: { user: true } },
      },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (!task.branchName) {
      throw new Error('Task has no branch. Generate code first.');
    }

    const project = task.project;

    if (!project.githubRepoOwner || !project.githubRepoName) {
      throw new Error('Project not linked to GitHub repository');
    }

    const github = await createGitHubService(project.userId);

    // Check if PR already exists
    if (task.prUrl && task.prNumber) {
      // Merge existing PR
      console.log(`🔀 Merging existing PR #${task.prNumber} to main...`);
      await github.mergePullRequest(
        project.githubRepoOwner,
        project.githubRepoName,
        task.prNumber,
        'squash' // Use squash merge to keep history clean
      );

      return {
        merged: true,
        prUrl: task.prUrl,
        prNumber: task.prNumber,
      };
    } else {
      // Create PR and merge it immediately
      console.log(`🔀 Creating and merging PR for task ${taskId}...`);
      const prResult = await this.createPullRequest(taskId);

      // Merge the newly created PR
      await github.mergePullRequest(
        project.githubRepoOwner,
        project.githubRepoName,
        prResult.prNumber,
        'squash'
      );

      return {
        merged: true,
        prUrl: prResult.prUrl,
        prNumber: prResult.prNumber,
      };
    }
  }

  /**
   * Generate pull request description
   */
  private generatePRDescription(task: any, generations: any[]): string {
    const generationSummary = generations
      .map((g) => `- ${g.prompt} (${g.filesCreated.length} files created)`)
      .join('\n');

    const allFiles = [...new Set(generations.flatMap((g) => g.filesCreated))];

    return `
## Summary

${task.description || 'No description provided'}

## Changes

This pull request includes AI-generated code from ${generations.length} generation(s):

${generationSummary}

## Files Changed

${allFiles.map((f) => `- ${f}`).join('\n')}

## Task Details

- **Task ID:** \`${task.id}\`
- **Status:** ${task.status}
- **Priority:** ${task.priority}
- **Branch:** \`${task.branchName}\`

---

🤖 **Generated by AI Development Platform**
`;
  }
}

export const githubIntegrationService = new GitHubIntegrationService();

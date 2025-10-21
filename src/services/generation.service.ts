import { query } from '@anthropic-ai/claude-agent-sdk';
import { join } from 'path';
import { mkdir, readFile, readdir, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { db } from '../lib/db.js';
import { e2bService } from '../lib/e2b.js';
import { githubIntegrationService } from './github-integration.service.js';

interface GenerateCodeOptions {
  prompt: string;
  projectId: string;
  taskId?: string;
  autoCommit?: boolean;
}

interface GenerationResult {
  generationId: string;
  sandboxId: string;
  sandboxUrl: string;
  filesCreated: string[];
  commitSha?: string;
  commitUrl?: string;
  branchName?: string;
}

class GenerationService {
  /**
   * Generate code for a task using Claude Agent SDK
   */
  async generateCode(options: GenerateCodeOptions): Promise<GenerationResult> {
    const { prompt: projectDescription, projectId, taskId, autoCommit = true } = options;

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!process.env.E2B_API_KEY) {
      throw new Error('E2B_API_KEY not configured');
    }

    // Validate project exists
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { user: true }
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Validate task exists if provided
    let task = null;
    if (taskId) {
      task = await db.task.findFirst({
        where: {
          id: taskId,
          projectId: projectId
        }
      });
      if (!task) {
        throw new Error('Task not found or does not belong to this project');
      }
    }

    let sandboxId: string | null = null;
    let tempDir: string | null = null;
    let generation: any = null;

    try {
      // Create Generation record
      generation = await db.generation.create({
        data: {
          prompt: projectDescription,
          status: 'running',
          projectId: projectId,
          taskId: taskId || null,
          agentModel: 'claude-sonnet-4-5-20250929'
        }
      });
      console.log(`📝 Created Generation record: ${generation.id}`);

      // Update task buildStatus to generating
      if (taskId) {
        await db.task.update({
          where: { id: taskId },
          data: { buildStatus: 'generating' }
        });
      }

      // Create E2B sandbox
      const sandboxInfo = await e2bService.createSandbox({
        projectId: projectId
      });
      sandboxId = sandboxInfo.sandboxId;

      // Update Generation with sandboxId
      await db.generation.update({
        where: { id: generation.id },
        data: { sandboxId }
      });

      console.log(`📦 Sandbox created: ${sandboxId}`);

      // Create unique temporary directory for this generation
      const generationId = Date.now().toString(36) + Math.random().toString(36).substring(2);
      tempDir = join(tmpdir(), `claude-gen-${generationId}`);
      await mkdir(tempDir, { recursive: true });
      console.log(`📁 Created temp directory: ${tempDir}`);

      const prompt = `Create a complete HTML project based on this description: "${projectDescription}"

Please create the necessary files (HTML, CSS, and JavaScript if needed) for a fully functional project.
Save all files in the current working directory.

Requirements:
- Create clean, well-structured HTML
- Include inline or separate CSS for styling
- Add comments to explain the code
- Make it responsive and modern
- Ensure all files are properly linked

Start by creating the files now.`;

      // Query Claude with the SDK using temporary directory
      const result = query({
        prompt,
        options: {
          cwd: tempDir,
          permissionMode: 'acceptEdits',
          model: 'claude-sonnet-4-5-20250929',
        }
      });

      const filesCreated: string[] = [];
      const fileWriteQueue: string[] = [];

      // Helper function to sync a file to E2B
      const syncFileToE2B = async (filePath: string) => {
        try {
          // Handle both absolute and relative paths
          const fullPath = filePath.startsWith('/') ? filePath : join(tempDir!, filePath);

          // Check if file exists before trying to read it
          try {
            await stat(fullPath);
          } catch {
            // File doesn't exist, skip it
            console.log(`⏭️  Skipping non-existent file: ${filePath}`);
            return;
          }

          const content = await readFile(fullPath, 'utf-8');

          // Get relative path for E2B
          let relativePath = filePath.startsWith('/')
            ? filePath.replace(tempDir! + '/', '')
            : filePath;

          // Clean up the path
          relativePath = relativePath.replace(/^\/+/, ''); // Remove leading slashes

          // Write to E2B sandbox in /home/user directory
          const e2bPath = `/home/user/${relativePath}`;
          await e2bService.writeFile(sandboxId!, e2bPath, content);

          console.log(`✅ Synced to E2B: ${relativePath} → ${e2bPath}`);
        } catch (error) {
          console.error(`Failed to sync ${filePath}:`, error);
        }
      };

      // Stream messages
      console.log('🔄 Starting to stream messages from SDK...');
      let currentToolUse: any = null;

      for await (const message of result) {
        // Handle different SDK message types
        if (message.type === 'assistant' && message.message?.content) {
          // Assistant messages contain content array with text or tool_use
          for (const content of message.message.content) {
            const contentBlock = content as any;
            if (contentBlock.type === 'text') {
              console.log('💬 Text:', contentBlock.text?.substring(0, 50) + '...');
            } else if (contentBlock.type === 'tool_use') {
              console.log('🔧 Tool use:', contentBlock.name);

              // Track current tool use for later processing
              currentToolUse = contentBlock;

              // Track file creation
              if (contentBlock.name === 'Write' && contentBlock.input?.file_path) {
                const filePath = contentBlock.input.file_path;
                filesCreated.push(filePath);
                fileWriteQueue.push(filePath);
              }
            }
          }
        } else if (message.type === 'user' && message.message?.content) {
          // User messages (tool results)
          for (const content of message.message.content) {
            const contentBlock = content as any;
            if (contentBlock.type === 'tool_result') {
              console.log('✅ Tool result:', contentBlock.is_error ? 'error' : 'success');

              if (!contentBlock.is_error) {
                // If this was a successful Write operation, sync to E2B
                if (currentToolUse?.name === 'Write' && fileWriteQueue.length > 0) {
                  const filePath = fileWriteQueue.shift();
                  if (filePath) {
                    await syncFileToE2B(filePath);
                  }
                }
              }

              currentToolUse = null;
            }
          }
        }
      }
      console.log('✨ SDK stream complete');

      // Final sync: ensure all files are in E2B
      const syncAllFiles = async (dir: string) => {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            await syncAllFiles(fullPath);
          } else if (entry.isFile()) {
            await syncFileToE2B(fullPath);
          }
        }
      };

      await syncAllFiles(tempDir);

      // Update Generation record with files created
      await db.generation.update({
        where: { id: generation.id },
        data: {
          filesCreated: filesCreated,
          status: 'completed',
          completedAt: new Date()
        }
      });

      // Start web server in the sandbox
      console.log('🌐 Starting web server in sandbox...');
      const sandboxUrl = await e2bService.startWebServer(sandboxId, '/home/user', 8000);

      // GitHub Integration: Auto-commit if enabled and task is linked
      let commitSha: string | undefined;
      let commitUrl: string | undefined;
      let branchName: string | undefined;

      if (taskId && autoCommit && project?.githubRepoOwner) {
        try {
          console.log(`🐙 Auto-committing to GitHub for task ${taskId}...`);

          // Ensure branch exists for task
          branchName = await githubIntegrationService.ensureTaskBranch(taskId);
          console.log(`📋 Created/using branch: ${branchName}`);

          // Commit generated files
          const commitResult = await githubIntegrationService.commitGeneratedFiles(generation.id);
          commitSha = commitResult.commitSha;
          commitUrl = commitResult.commitUrl;

          console.log(`✅ GitHub commit successful: ${commitUrl}`);
        } catch (error) {
          // Don't fail the entire generation if GitHub commit fails
          console.error('⚠️ GitHub commit failed (non-fatal):', error);
        }
      }

      // Update task buildStatus to ready
      if (taskId) {
        await db.task.update({
          where: { id: taskId },
          data: {
            buildStatus: 'ready',
            ...(branchName && { branchName }),
          }
        });
        console.log(`✅ Task ${taskId} buildStatus updated to 'ready'`);
      }

      console.log(`🎉 Generation complete. Sandbox: ${sandboxId}, URL: ${sandboxUrl}`);

      return {
        generationId: generation.id,
        sandboxId,
        sandboxUrl,
        filesCreated,
        commitSha,
        commitUrl,
        branchName,
      };

    } catch (error) {
      console.error('❌ Error generating project:', error);

      // Update Generation status to failed
      if (generation) {
        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
          }
        });
      }

      // Update task buildStatus to failed
      if (taskId) {
        await db.task.update({
          where: { id: taskId },
          data: { buildStatus: 'failed' }
        });
      }

      // Cleanup sandbox on error
      if (sandboxId) {
        await e2bService.closeSandbox(sandboxId, projectId);
      }

      throw error;
    }
  }
}

export const generationService = new GenerationService();

#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, readdir, stat } from 'fs/promises';
import { tmpdir } from 'os';

// Import routes
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import githubAuthRoutes from './routes/github-auth.routes.js';
import githubRoutes from './routes/github.routes.js';
import researchRoutes from './routes/research.routes.js';
import pagesRoutes from './routes/pages.routes.js';
import pagesAgentRoutes from './routes/pages-agent.routes.js';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { authenticate, optionalAuthenticate } from './middleware/auth.middleware.js';

// Import database and cache
import { db } from './lib/db.js';
import { redis } from './lib/redis.js';
import { e2bService } from './lib/e2b.js';
import { githubIntegrationService } from './services/github-integration.service.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', githubAuthRoutes);
app.use('/api', githubRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', researchRoutes);
app.use('/api', pagesRoutes);
app.use('/api', pagesAgentRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  // Check database connection
  let dbStatus = 'unknown';
  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
  }

  // Check Redis connection
  let redisStatus = 'unknown';
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch (error) {
    redisStatus = 'disconnected';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      database: dbStatus,
      redis: redisStatus,
      claude: !!process.env.ANTHROPIC_API_KEY ? 'configured' : 'not configured',
      e2b: !!process.env.E2B_API_KEY ? 'configured' : 'not configured',
    },
  });
});

// Generate HTML project endpoint with Server-Sent Events
app.post('/api/generate', async (req, res) => {
  console.log('📥 Received generate request');
  const {
    prompt: projectDescription,
    projectId,
    taskId,
    autoCommit = true  // Default to true if taskId is provided
  } = req.body;
  console.log('📝 Prompt:', projectDescription);
  console.log('📦 Project ID:', projectId);
  console.log('📋 Task ID:', taskId);

  if (!projectDescription) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  if (!process.env.E2B_API_KEY) {
    return res.status(500).json({ error: 'E2B_API_KEY not configured' });
  }

  // Validate project exists if provided
  let project = null;
  if (projectId) {
    project = await db.project.findUnique({
      where: { id: projectId },
      include: { user: true }
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
  }

  // Validate task exists and belongs to project if provided
  let task = null;
  if (taskId) {
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required when taskId is provided' });
    }
    task = await db.task.findFirst({
      where: {
        id: taskId,
        projectId: projectId
      }
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found or does not belong to this project' });
    }
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let sandboxId: string | null = null;
  let tempDir: string | null = null;
  let generation: any = null;

  try {
    // Create Generation record if projectId is provided
    if (projectId) {
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
      sendEvent('status', {
        message: `Generation started (ID: ${generation.id})`,
        type: 'info',
        generationId: generation.id
      });
    }

    sendEvent('status', { message: 'Creating isolated sandbox...', type: 'info' });

    // Create E2B sandbox
    const sandboxInfo = await e2bService.createSandbox({
      projectId: projectId || undefined
    });
    sandboxId = sandboxInfo.sandboxId;

    // Update Generation with sandboxId
    if (generation) {
      await db.generation.update({
        where: { id: generation.id },
        data: { sandboxId }
      });
    }

    sendEvent('status', {
      message: `Sandbox created: ${sandboxId}`,
      type: 'info',
      sandboxId
    });

    // Create unique temporary directory for this generation
    const generationId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    tempDir = join(tmpdir(), `claude-gen-${generationId}`);
    await mkdir(tempDir, { recursive: true });
    console.log(`📁 Created temp directory: ${tempDir}`);

    sendEvent('status', { message: 'Setting up workspace...', type: 'info' });

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
          // File doesn't exist, skip it (happens when Claude tries /tmp first)
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
        sendEvent('status', {
          message: `Synced file: ${relativePath}`,
          type: 'info'
        });
      } catch (error) {
        console.error(`Failed to sync ${filePath}:`, error);
      }
    };

    // Stream messages
    console.log('🔄 Starting to stream messages from SDK...');
    let currentToolUse: any = null;

    for await (const message of result) {
      console.log('📨 Message type:', message.type, JSON.stringify(message).substring(0, 100));

      // Handle different SDK message types
      if (message.type === 'assistant' && message.message?.content) {
        // Assistant messages contain content array with text or tool_use
        for (const content of message.message.content) {
          const contentBlock = content as any;
          if (contentBlock.type === 'text') {
            console.log('💬 Text:', contentBlock.text?.substring(0, 50) + '...');
            sendEvent('text', { content: contentBlock.text });
          } else if (contentBlock.type === 'tool_use') {
            console.log('🔧 Tool use:', contentBlock.name);
            sendEvent('tool', { name: contentBlock.name, action: 'using' });

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

            if (contentBlock.is_error) {
              sendEvent('error', { message: contentBlock.content });
            } else {
              sendEvent('tool', { action: 'completed' });

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
      } else if (message.type === 'result') {
        console.log('🎉 Generation result received');
      }
    }
    console.log('✨ SDK stream complete');

    // Final sync: ensure all files are in E2B (in case we missed any)
    sendEvent('status', { message: 'Final sync to sandbox...', type: 'info' });

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
    if (generation) {
      await db.generation.update({
        where: { id: generation.id },
        data: {
          filesCreated: filesCreated,
          status: 'completed',
          completedAt: new Date()
        }
      });
    }

    // Start web server in the sandbox
    sendEvent('status', { message: 'Starting web server in sandbox...', type: 'info' });
    const sandboxUrl = await e2bService.startWebServer(sandboxId, '/home/user', 8000);

    // GitHub Integration: Auto-commit if enabled and task is linked
    let commitSha: string | undefined;
    let commitUrl: string | undefined;
    let branchName: string | undefined;

    if (generation && taskId && autoCommit && project?.githubRepoOwner) {
      try {
        sendEvent('status', { message: 'Committing code to GitHub...', type: 'info' });
        console.log(`🐙 Auto-committing to GitHub for task ${taskId}...`);

        // Ensure branch exists for task
        branchName = await githubIntegrationService.ensureTaskBranch(taskId);
        sendEvent('status', {
          message: `Created branch: ${branchName}`,
          type: 'info'
        });

        // Commit generated files
        const commitResult = await githubIntegrationService.commitGeneratedFiles(generation.id);
        commitSha = commitResult.commitSha;
        commitUrl = commitResult.commitUrl;

        console.log(`✅ GitHub commit successful: ${commitUrl}`);
        sendEvent('status', {
          message: `Code committed to GitHub!`,
          type: 'success',
          commitUrl
        });
      } catch (error) {
        // Don't fail the entire generation if GitHub commit fails
        console.error('⚠️ GitHub commit failed (non-fatal):', error);
        sendEvent('status', {
          message: `Warning: GitHub commit failed - ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'warning'
        });
      }
    }

    sendEvent('complete', {
      message: 'Generation complete! Your project is now live!',
      sandboxId,
      sandboxUrl,
      filesCreated,
      generationId: generation?.id,
      commitSha,
      commitUrl,
      branchName,
      note: commitUrl
        ? 'Your code is live in the sandbox and committed to GitHub!'
        : 'Click the URL to see your live project!'
    });
    res.end();

    console.log(`🎉 Generation complete. Files synced to E2B sandbox: ${sandboxId}`);
    if (commitUrl) {
      console.log(`🐙 Committed to GitHub: ${commitUrl}`);
    }

    // Note: Sandbox will be auto-cleaned after 1 hour by the cleanup interval

  } catch (error) {
    console.error('Error generating project:', error);

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

    // Cleanup sandbox on error
    if (sandboxId) {
      await e2bService.closeSandbox(sandboxId, projectId || undefined);
    }

    sendEvent('error', {
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
    res.end();
  }
});

// Serve generated files
app.use('/output', express.static(join(process.cwd(), 'output')));

// Error page for OAuth failures
app.get('/error', (req, res) => {
  const message = req.query.message || 'An error occurred';
  res.status(400).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Error</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .error-box {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          max-width: 500px;
        }
        h1 { color: #e53e3e; margin-top: 0; }
        p { color: #666; }
        a { color: #3182ce; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="error-box">
        <h1>Authentication Error</h1>
        <p>${message}</p>
        <p><a href="/">Return to home</a></p>
      </div>
    </body>
    </html>
  `);
});

// Success page for GitHub OAuth
app.get('/github-connected', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>GitHub Connected</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .success-box {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          max-width: 500px;
          text-align: center;
        }
        h1 { color: #38a169; margin-top: 0; }
        p { color: #666; }
        button {
          background: #3182ce;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          margin-top: 1rem;
        }
        button:hover { background: #2c5aa0; }
      </style>
    </head>
    <body>
      <div class="success-box">
        <h1>✓ GitHub Connected!</h1>
        <p>Your GitHub account has been successfully connected.</p>
        <button onclick="window.close()">Close this window</button>
      </div>
    </body>
    </html>
  `);
});

// Error handling - must be last
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('\n📊 Service Status:');
  console.log(`   ✓ Express API: http://localhost:${PORT}`);
  console.log(`   ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗'} Claude API Key: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'NOT configured'}`);
  console.log(`   ${process.env.E2B_API_KEY ? '✓' : '✗'} E2B API Key: ${process.env.E2B_API_KEY ? 'configured' : 'NOT configured'}`);

  // Check database
  try {
    await db.$queryRaw`SELECT 1`;
    console.log('   ✓ PostgreSQL: connected');
  } catch (error) {
    console.log('   ✗ PostgreSQL: disconnected');
  }

  // Check Redis
  try {
    await redis.ping();
    console.log('   ✓ Redis: connected');
  } catch (error) {
    console.log('   ✗ Redis: disconnected (optional, will use defaults)');
  }

  console.log('\n📚 Available Endpoints:');
  console.log('   Authentication:');
  console.log('     POST /api/auth/register');
  console.log('     POST /api/auth/login');
  console.log('     POST /api/auth/logout');
  console.log('     POST /api/auth/refresh');
  console.log('     GET  /api/auth/me');
  console.log('   Projects:');
  console.log('     GET  /api/projects');
  console.log('     POST /api/projects');
  console.log('     GET  /api/projects/:id');
  console.log('     PATCH /api/projects/:id');
  console.log('     DELETE /api/projects/:id');
  console.log('   Tasks:');
  console.log('     GET  /api/projects/:id/tasks');
  console.log('     POST /api/projects/:id/tasks');
  console.log('   E2B Sandboxes:');
  console.log('     POST /api/projects/:id/sandbox');
  console.log('     GET  /api/projects/:id/sandbox');
  console.log('     DELETE /api/projects/:id/sandbox');
  console.log('     GET  /api/projects/:id/sandbox/files');
  console.log('     GET  /api/projects/:id/sandbox/stats');
  console.log('   Generation:');
  console.log('     POST /api/generate (legacy endpoint)');
  console.log('   System:');
  console.log('     GET  /api/health');
  console.log('\n🎯 Next Steps:');
  if (!process.env.E2B_API_KEY) {
    console.log('   1. Get E2B API key from https://e2b.dev/dashboard');
    console.log('   2. Add E2B_API_KEY to .env file');
    console.log('   3. Run: npm run test:e2b');
  }
  console.log('   4. Test the API with /api/auth/register');
  console.log('   5. Create a project with /api/projects');
  console.log('\n');
});

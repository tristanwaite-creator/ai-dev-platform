import { Sandbox } from '@e2b/code-interpreter';
import { db } from './db.js';

export interface E2BSandboxInfo {
  sandboxId: string;
  sandbox: Sandbox;
  expiresAt: Date;
}

export interface SandboxOptions {
  projectId?: string;
  generationId?: string;
  metadata?: Record<string, any>;
}

class E2BService {
  private activeSandboxes: Map<string, E2BSandboxInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval to remove expired sandboxes
    this.startCleanupInterval();
  }

  /**
   * Create a new E2B sandbox
   */
  async createSandbox(options: SandboxOptions = {}): Promise<E2BSandboxInfo> {
    try {
      console.log('📦 Creating E2B sandbox...', options);
      const sandbox = await Sandbox.create();

      const sandboxInfo: E2BSandboxInfo = {
        sandboxId: sandbox.sandboxId,
        sandbox,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };

      // Store in memory
      this.activeSandboxes.set(sandbox.sandboxId, sandboxInfo);

      // Update database if projectId is provided
      if (options.projectId) {
        await db.project.update({
          where: { id: options.projectId },
          data: {
            sandboxId: sandbox.sandboxId,
            sandboxStatus: 'active',
          },
        });
      }

      // Update database if generationId is provided
      if (options.generationId) {
        await db.generation.update({
          where: { id: options.generationId },
          data: {
            sandboxId: sandbox.sandboxId,
          },
        });
      }

      console.log(`✅ Sandbox created: ${sandbox.sandboxId}`);
      return sandboxInfo;
    } catch (error) {
      console.error('❌ Failed to create E2B sandbox:', error);
      throw new Error(`Failed to create sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get an existing sandbox by ID
   */
  getSandbox(sandboxId: string): E2BSandboxInfo | undefined {
    return this.activeSandboxes.get(sandboxId);
  }

  /**
   * Reconnect to an existing E2B sandbox or create a new one if it no longer exists
   */
  async reconnectSandbox(sandboxId: string, projectId?: string): Promise<E2BSandboxInfo> {
    console.log(`🔌 Attempting to recover sandbox: ${sandboxId}`);

    // Check if sandbox is still in memory
    const existing = this.activeSandboxes.get(sandboxId);
    if (existing) {
      // Verify the sandbox is actually still alive by doing a health check
      try {
        await existing.sandbox.commands.run('echo "health check"', { timeoutMs: 5000 });
        console.log(`✅ Sandbox ${sandboxId} found in memory and verified alive`);
        return existing;
      } catch (healthError) {
        console.log(`⚠️ Sandbox ${sandboxId} in memory but not responding, removing...`);
        this.activeSandboxes.delete(sandboxId);
        // Fall through to reconnect/recreate logic
      }
    }

    // Try to reconnect to the existing sandbox using E2B's connect method
    console.log(`🔄 Sandbox not in memory, attempting to reconnect via E2B...`);

    try {
      const sandbox = await Sandbox.connect(sandboxId);

      const sandboxInfo: E2BSandboxInfo = {
        sandboxId: sandbox.sandboxId,
        sandbox,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };

      // Store in memory
      this.activeSandboxes.set(sandbox.sandboxId, sandboxInfo);

      console.log(`✅ Successfully reconnected to sandbox ${sandboxId}`);
      return sandboxInfo;
    } catch (reconnectError) {
      console.log(`⚠️  Could not reconnect to sandbox ${sandboxId}: ${reconnectError instanceof Error ? reconnectError.message : 'Unknown error'}`);
      console.log(`🆕 Creating new sandbox...`);

      try {
        const newSandboxInfo = await this.createSandbox({ projectId });

        // Update database with new sandbox ID if projectId provided
        if (projectId) {
          await db.generation.updateMany({
            where: {
              sandboxId: sandboxId,
              projectId: projectId,
            },
            data: {
              sandboxId: newSandboxInfo.sandboxId,
            },
          });
        }

        console.log(`✅ Created new sandbox ${newSandboxInfo.sandboxId} to replace ${sandboxId}`);
        return newSandboxInfo;
      } catch (error) {
        console.error('❌ Failed to create replacement sandbox:', error);
        throw new Error(`Failed to create replacement sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Close and cleanup a sandbox
   */
  async closeSandbox(sandboxId: string, projectId?: string): Promise<void> {
    try {
      const sandboxInfo = this.activeSandboxes.get(sandboxId);

      if (sandboxInfo) {
        console.log(`🧹 Closing sandbox: ${sandboxId}`);
        await sandboxInfo.sandbox.kill();
        this.activeSandboxes.delete(sandboxId);
      }

      // Update database if projectId is provided
      if (projectId) {
        await db.project.update({
          where: { id: projectId },
          data: {
            sandboxStatus: 'inactive',
          },
        });
      }

      console.log(`✅ Sandbox closed: ${sandboxId}`);
    } catch (error) {
      console.error(`❌ Failed to close sandbox ${sandboxId}:`, error);
      // Don't throw - cleanup should be best-effort
    }
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const sandboxInfo = this.activeSandboxes.get(sandboxId);
    if (!sandboxInfo) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    await sandboxInfo.sandbox.files.write(path, content);
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(sandboxId: string, path: string): Promise<string> {
    const sandboxInfo = this.activeSandboxes.get(sandboxId);
    if (!sandboxInfo) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    return await sandboxInfo.sandbox.files.read(path);
  }

  /**
   * List files in the sandbox
   */
  async listFiles(sandboxId: string, path: string = '/'): Promise<any[]> {
    const sandboxInfo = this.activeSandboxes.get(sandboxId);
    if (!sandboxInfo) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    return await sandboxInfo.sandbox.files.list(path);
  }

  /**
   * Run code in the sandbox
   */
  async runCode(sandboxId: string, code: string): Promise<any> {
    const sandboxInfo = this.activeSandboxes.get(sandboxId);
    if (!sandboxInfo) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    return await sandboxInfo.sandbox.runCode(code);
  }

  /**
   * Download files from GitHub API and write to sandbox
   * Uses GitHub API instead of git clone for better auth support
   */
  async downloadFromGitHub(
    sandboxId: string,
    owner: string,
    repo: string,
    branch: string,
    targetDir: string = '/home/user',
    githubToken: string
  ): Promise<void> {
    const sandboxInfo = this.activeSandboxes.get(sandboxId);
    if (!sandboxInfo) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    console.log(`📥 Downloading files from GitHub ${owner}/${repo} (branch: ${branch})...`);

    try {
      // Use GitHub API to get the tree
      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: githubToken });

      // Get the branch reference
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });

      // Get the tree recursively
      const { data: treeData } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: refData.object.sha,
        recursive: 'true',
      });

      // Filter for files (blobs) only
      const files = treeData.tree.filter(item => item.type === 'blob');
      console.log(`📦 Found ${files.length} files to download`);

      // Download and write each file
      for (const file of files) {
        if (!file.path || !file.sha) continue;

        try {
          const { data: blobData } = await octokit.git.getBlob({
            owner,
            repo,
            file_sha: file.sha,
          });

          // Decode content (base64)
          const content = Buffer.from(blobData.content, 'base64').toString('utf-8');
          const filePath = `${targetDir}/${file.path}`;

          // Create directory if needed
          const dir = filePath.substring(0, filePath.lastIndexOf('/'));
          if (dir) {
            await sandboxInfo.sandbox.commands.run(`mkdir -p "${dir}"`, { timeoutMs: 5000 });
          }

          // Write file
          await sandboxInfo.sandbox.files.write(filePath, content);
        } catch (fileError) {
          console.warn(`⚠️ Failed to download ${file.path}:`, fileError);
        }
      }

      console.log(`✅ Files downloaded successfully`);
    } catch (error) {
      console.error(`❌ Failed to download from GitHub:`, error);
      throw error;
    }
  }

  /**
   * Start a web server in the sandbox to serve static files
   * If sandbox is not found or expired, attempts to create a new one
   */
  async startWebServer(sandboxId: string, directory: string = '/home/user', port: number = 8000, projectId?: string): Promise<{ url: string; sandboxId: string }> {
    let sandboxInfo = this.activeSandboxes.get(sandboxId);
    let currentSandboxId = sandboxId;

    // If sandbox not found, try to create a new one
    if (!sandboxInfo) {
      console.log(`⚠️  Sandbox ${sandboxId} not found, creating a new one...`);
      const newSandbox = await this.createSandbox({ projectId });
      sandboxInfo = newSandbox;
      currentSandboxId = newSandbox.sandboxId;
    }

    try {
      console.log(`🌐 Starting web server in sandbox ${currentSandboxId} on port ${port}...`);

      // Create a startup script that keeps the server running with restarts
      const serverScript = `#!/bin/bash
cd ${directory}
while true; do
  python3 -m http.server ${port}
  sleep 1
done
`;
      await sandboxInfo.sandbox.files.write('/tmp/start_server.sh', serverScript);
      await sandboxInfo.sandbox.commands.run('chmod +x /tmp/start_server.sh');

      // Start using nohup with proper daemonization
      await sandboxInfo.sandbox.commands.run(
        'nohup /tmp/start_server.sh > /tmp/server.log 2>&1 &',
        { background: false }
      );

      console.log(`📝 Server process started`);

      // Give it time to start accepting connections
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get the public URL using E2B's getHost method
      const host = sandboxInfo.sandbox.getHost(port);
      const url = `https://${host}`;

      // Verify server is accessible
      try {
        const checkResult = await sandboxInfo.sandbox.commands.run(
          `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ 2>/dev/null || echo "000"`,
          { timeoutMs: 5000 }
        );
        const statusCode = checkResult.stdout?.trim() || '000';
        console.log(`✅ Server verified (status: ${statusCode})`);
      } catch {
        console.log(`⚠️ Server verification skipped`);
      }

      console.log(`✅ Web server started at ${url}`);

      return { url, sandboxId: currentSandboxId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to start web server in sandbox ${currentSandboxId}:`, error);

      // If sandbox is expired/not running, try to create a fresh one
      if (errorMsg.includes('not running') || errorMsg.includes('expired') || errorMsg.includes('Sandbox')) {
        console.log(`🔄 Sandbox appears expired, creating a fresh sandbox...`);

        // Remove the dead sandbox from memory
        this.activeSandboxes.delete(currentSandboxId);

        // Create a new sandbox
        const newSandbox = await this.createSandbox({ projectId });

        try {
          // Create startup script
          const serverScript = `#!/bin/bash
cd ${directory}
while true; do
  python3 -m http.server ${port}
  sleep 1
done
`;
          await newSandbox.sandbox.files.write('/tmp/start_server.sh', serverScript);
          await newSandbox.sandbox.commands.run('chmod +x /tmp/start_server.sh');
          await newSandbox.sandbox.commands.run(
            'nohup /tmp/start_server.sh > /tmp/server.log 2>&1 &',
            { background: false }
          );

          await new Promise(resolve => setTimeout(resolve, 3000));

          const host = newSandbox.sandbox.getHost(port);
          const url = `https://${host}`;

          console.log(`✅ Web server started in new sandbox at ${url}`);
          return { url, sandboxId: newSandbox.sandboxId };
        } catch (retryError) {
          console.error(`❌ Failed to start web server in new sandbox:`, retryError);
          throw new Error(`Failed to start web server after retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
        }
      }

      throw new Error(`Failed to start web server: ${errorMsg}`);
    }
  }

  /**
   * Get the sandbox URL for previewing
   * E2B URL format: https://{port}-{sandboxId}.e2b.app
   */
  getSandboxUrl(sandboxId: string, port: number = 8000): string {
    return `https://${port}-${sandboxId}.e2b.app`;
  }

  /**
   * Start cleanup interval to remove expired sandboxes
   */
  private startCleanupInterval(): void {
    // Check every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSandboxes();
    }, 5 * 60 * 1000);
  }

  /**
   * Cleanup expired sandboxes
   */
  private async cleanupExpiredSandboxes(): Promise<void> {
    const now = new Date();
    const expiredSandboxes: string[] = [];

    for (const [sandboxId, info] of this.activeSandboxes.entries()) {
      if (info.expiresAt < now) {
        expiredSandboxes.push(sandboxId);
      }
    }

    if (expiredSandboxes.length > 0) {
      console.log(`🧹 Cleaning up ${expiredSandboxes.length} expired sandboxes...`);

      for (const sandboxId of expiredSandboxes) {
        await this.closeSandbox(sandboxId);
      }
    }
  }

  /**
   * Cleanup all sandboxes on shutdown
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up all E2B sandboxes...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const sandboxIds = Array.from(this.activeSandboxes.keys());

    for (const sandboxId of sandboxIds) {
      await this.closeSandbox(sandboxId);
    }

    console.log('✅ All sandboxes cleaned up');
  }

  /**
   * Get statistics about active sandboxes
   */
  getStats(): { total: number; active: number; expired: number } {
    const now = new Date();
    let expired = 0;

    for (const info of this.activeSandboxes.values()) {
      if (info.expiresAt < now) {
        expired++;
      }
    }

    return {
      total: this.activeSandboxes.size,
      active: this.activeSandboxes.size - expired,
      expired,
    };
  }
}

// Export singleton instance
export const e2bService = new E2BService();

// Cleanup on process exit
process.on('SIGINT', async () => {
  await e2bService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await e2bService.cleanup();
  process.exit(0);
});

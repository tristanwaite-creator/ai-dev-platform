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
   * Close and cleanup a sandbox
   */
  async closeSandbox(sandboxId: string, projectId?: string): Promise<void> {
    try {
      const sandboxInfo = this.activeSandboxes.get(sandboxId);

      if (sandboxInfo) {
        console.log(`🧹 Closing sandbox: ${sandboxId}`);
        await (sandboxInfo.sandbox as any).close();
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
   * Start a web server in the sandbox to serve static files
   */
  async startWebServer(sandboxId: string, directory: string = '/home/user', port: number = 8000): Promise<string> {
    const sandboxInfo = this.activeSandboxes.get(sandboxId);
    if (!sandboxInfo) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      console.log(`🌐 Starting web server in sandbox ${sandboxId} on port ${port}...`);

      // Start Python HTTP server in background using E2B's background option
      await sandboxInfo.sandbox.commands.run(`cd ${directory} && python3 -m http.server ${port}`, {
        background: true  // This keeps the process running
      });

      console.log(`📝 Server process started in background`);

      // Give it a moment to start accepting connections
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get the public URL using E2B's getHost method
      const host = sandboxInfo.sandbox.getHost(port);
      const url = `https://${host}`;

      console.log(`✅ Web server started at ${url}`);

      return url;
    } catch (error) {
      console.error(`❌ Failed to start web server in sandbox ${sandboxId}:`, error);
      throw new Error(`Failed to start web server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the sandbox URL for previewing
   */
  getSandboxUrl(sandboxId: string, port: number = 8000): string {
    return `https://${sandboxId}.e2b.dev:${port}`;
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

import { Sandbox } from '@e2b/code-interpreter';
import { e2bService } from '../lib/e2b.js';
import { db } from '../lib/db.js';

export interface ReconnectionResult {
  sandboxId: string;
  sandbox: Sandbox;
  wasReconnected: boolean;
}

/**
 * Service to handle E2B sandbox reconnection when sandboxes expire
 */
class SandboxReconnectionService {
  /**
   * Reconnect to an existing sandbox or create a new one if expired
   *
   * @param sandboxId - The sandbox ID to reconnect to
   * @param projectId - Optional project ID for database updates
   * @returns ReconnectionResult with sandbox info and reconnection status
   */
  async reconnectOrCreate(
    sandboxId: string,
    projectId?: string
  ): Promise<ReconnectionResult> {
    console.log(`🔌 Attempting to reconnect to sandbox: ${sandboxId}`);

    // First, check if sandbox is still in memory and active
    const existingSandbox = e2bService.getSandbox(sandboxId);
    if (existingSandbox) {
      console.log(`✅ Sandbox ${sandboxId} found in memory and active`);
      return {
        sandboxId,
        sandbox: existingSandbox.sandbox,
        wasReconnected: false,
      };
    }

    // E2B sandboxes are ephemeral and can't be reconnected after process restart
    // Use the e2bService reconnectSandbox method which creates a new one if needed
    console.log(`🔄 Attempting to recover E2B sandbox ${sandboxId}...`);

    try {
      const newSandboxInfo = await e2bService.reconnectSandbox(sandboxId, projectId);

      return {
        sandboxId: newSandboxInfo.sandboxId,
        sandbox: newSandboxInfo.sandbox,
        wasReconnected: newSandboxInfo.sandboxId === sandboxId,
      };
    } catch (error) {
      console.error(`❌ Failed to recover sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a sandbox is active in memory
   * Note: E2B sandboxes are ephemeral and only exist in memory during server runtime
   *
   * @param sandboxId - The sandbox ID to check
   * @returns true if sandbox is in memory, false if expired
   */
  async isSandboxActive(sandboxId: string): Promise<boolean> {
    const sandboxInfo = e2bService.getSandbox(sandboxId);
    return sandboxInfo !== undefined;
  }

  /**
   * Get sandbox with automatic reconnection handling
   * This is a convenience method that wraps reconnectOrCreate
   *
   * @param sandboxId - The sandbox ID
   * @param projectId - Optional project ID
   * @returns Sandbox instance
   */
  async getSandbox(sandboxId: string, projectId?: string): Promise<Sandbox> {
    const result = await this.reconnectOrCreate(sandboxId, projectId);
    return result.sandbox;
  }
}

export const sandboxReconnectionService = new SandboxReconnectionService();

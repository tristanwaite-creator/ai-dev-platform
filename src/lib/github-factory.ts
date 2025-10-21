import { db } from './db.js';
import { decrypt } from './encryption.js';
import { GitHubService } from './github.js';

/**
 * Create GitHub service for a specific user
 * Fetches and decrypts the user's GitHub access token
 */
export async function createGitHubService(userId: string): Promise<GitHubService> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true, githubId: true },
  });

  if (!user?.githubAccessToken) {
    throw new Error(
      'GitHub not connected. Please authorize GitHub access at /api/auth/github'
    );
  }

  try {
    const accessToken = decrypt(user.githubAccessToken);
    return new GitHubService(accessToken);
  } catch (error) {
    throw new Error('Failed to decrypt GitHub token. Please reconnect your GitHub account.');
  }
}

/**
 * Check if user has GitHub connected
 */
export async function hasGitHubConnected(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  });

  return !!user?.githubAccessToken;
}

/**
 * Validate user's GitHub token is still valid
 */
export async function validateGitHubToken(userId: string): Promise<boolean> {
  try {
    const github = await createGitHubService(userId);
    return await github.validateToken();
  } catch {
    return false;
  }
}

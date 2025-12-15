# Phase 3 Implementation Guide - Step by Step

This guide provides step-by-step instructions with ready-to-use code for implementing GitHub integration. Follow the steps in order for a smooth implementation.

## Prerequisites

1. Create GitHub OAuth App at https://github.com/settings/developers
   - Application name: "Your Platform Name"
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
   - Note your Client ID and Client Secret

2. Generate encryption key:
```bash
openssl rand -base64 32
```

## Step 1: Install Dependencies

```bash
npm install @octokit/rest
npm install --save-dev @types/node
```

## Step 2: Update Environment Variables

Add to `.env`:
```env
# GitHub OAuth
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# Encryption (from: openssl rand -base64 32)
ENCRYPTION_KEY=your_32_byte_base64_encryption_key_here

# GitHub Webhook Secret (generate with: openssl rand -hex 20)
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

Update `.env.example`:
```env
# GitHub OAuth - Get from: https://github.com/settings/developers
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# Token encryption - Generate with: openssl rand -base64 32
ENCRYPTION_KEY=your_32_byte_base64_encryption_key_here

# GitHub Webhook - Generate with: openssl rand -hex 20
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

## Step 3: Database Migration

Create migration file:
```bash
npx prisma migrate dev --name add_github_commit_fields
```

Update `prisma/schema.prisma`:

```prisma
model Generation {
  id            String    @id @default(cuid())
  prompt        String
  status        String    @default("pending")

  // Output
  outputPath    String?
  filesCreated  String[]  @default([])
  errorMessage  String?

  // E2B sandbox
  sandboxId     String?

  // GitHub integration - NEW
  commitSha     String?
  commitUrl     String?

  // Agent info
  agentModel    String?   @default("claude-sonnet-4-5-20250929")
  tokenUsage    Int?

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?

  // Relations
  projectId     String
  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  taskId        String?
  task          Task?     @relation(fields: [taskId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([status])
}

model Project {
  id            String    @id @default(cuid())
  name          String
  description   String?

  // GitHub integration
  githubRepoUrl String?
  githubRepoId  String?
  githubRepoOwner String?  // NEW - extract from URL
  githubRepoName  String?  // NEW - extract from URL
  defaultBranch String?   @default("main")

  // E2B sandbox
  sandboxId     String?
  sandboxStatus String?   @default("inactive")

  // Settings
  settings      Json?

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks         Task[]
  generations   Generation[]

  @@index([userId])
  @@index([githubRepoId])
}
```

Apply migration:
```bash
npx prisma migrate dev
npx prisma generate
```

## Step 4: Create Token Encryption Module

Create `src/lib/encryption.ts`:

```typescript
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64');
const ALGORITHM = 'aes-256-gcm';

if (ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (256 bits). Generate with: openssl rand -base64 32');
}

/**
 * Encrypt sensitive data (like GitHub access tokens)
 * Format: iv:authTag:encryptedData (all hex encoded)
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt previously encrypted data
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format. Expected: iv:authTag:encryptedData');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedData = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Test encryption/decryption
 */
export function testEncryption(): boolean {
  try {
    const testData = 'test-github-token-12345';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    return testData === decrypted;
  } catch (error) {
    console.error('Encryption test failed:', error);
    return false;
  }
}
```

Test it:
```bash
npx tsx -e "import { testEncryption } from './src/lib/encryption.js'; console.log('Encryption test:', testEncryption() ? 'PASSED ✓' : 'FAILED ✗')"
```

## Step 5: Create GitHub Service

Create `src/lib/github.ts`:

```typescript
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';

// Type aliases for better readability
type Repository = RestEndpointMethodTypes['repos']['get']['response']['data'];
type Branch = RestEndpointMethodTypes['repos']['getBranch']['response']['data'];
type Commit = RestEndpointMethodTypes['repos']['getCommit']['response']['data'];
type PullRequest = RestEndpointMethodTypes['pulls']['create']['response']['data'];
type GitHubUser = RestEndpointMethodTypes['users']['getAuthenticated']['response']['data'];

export interface FileChange {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface CreateRepoOptions {
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}

export interface CreatePROptions {
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
}

export class GitHubService {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  // ============================================
  // User Operations
  // ============================================

  async getCurrentUser(): Promise<GitHubUser> {
    const { data } = await this.octokit.users.getAuthenticated();
    return data;
  }

  async validateToken(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // Repository Operations
  // ============================================

  async createRepository(name: string, options: CreateRepoOptions = {}): Promise<Repository> {
    const { data } = await this.octokit.repos.createForAuthenticatedUser({
      name,
      description: options.description,
      private: options.private ?? true,
      auto_init: options.autoInit ?? true,
    });
    return data;
  }

  async getRepository(owner: string, repo: string): Promise<Repository> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data;
  }

  async listUserRepositories(page = 1, perPage = 30): Promise<Repository[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({
      page,
      per_page: perPage,
      sort: 'updated',
    });
    return data;
  }

  async deleteRepository(owner: string, repo: string): Promise<void> {
    await this.octokit.repos.delete({ owner, repo });
  }

  // ============================================
  // Branch Operations
  // ============================================

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromBranch: string = 'main'
  ): Promise<Branch> {
    // Get the SHA of the base branch
    const { data: baseBranch } = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch: fromBranch,
    });

    // Create new branch from base SHA
    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseBranch.commit.sha,
    });

    // Return the newly created branch
    const { data } = await this.octokit.repos.getBranch({ owner, repo, branch: branchName });
    return data;
  }

  async getBranch(owner: string, repo: string, branchName: string): Promise<Branch> {
    const { data } = await this.octokit.repos.getBranch({ owner, repo, branch: branchName });
    return data;
  }

  async listBranches(owner: string, repo: string): Promise<Branch[]> {
    const { data } = await this.octokit.repos.listBranches({ owner, repo });
    return data;
  }

  async deleteBranch(owner: string, repo: string, branchName: string): Promise<void> {
    await this.octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
  }

  // ============================================
  // Commit Operations
  // ============================================

  async createCommit(
    owner: string,
    repo: string,
    branch: string,
    files: FileChange[],
    message: string
  ): Promise<Commit> {
    // Get current branch reference
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const currentCommitSha = ref.object.sha;

    // Get current commit to access tree
    const { data: currentCommit } = await this.octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha,
    });

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.git.createBlob({
          owner,
          repo,
          content: file.content,
          encoding: file.encoding || 'utf-8',
        });
        return { path: file.path, sha: blob.sha, mode: '100644' as const, type: 'blob' as const };
      })
    );

    // Create new tree
    const { data: tree } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: currentCommit.tree.sha,
      tree: blobs,
    });

    // Create new commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.sha,
      parents: [currentCommitSha],
    });

    // Update branch reference
    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    // Return full commit object
    const { data: fullCommit } = await this.octokit.repos.getCommit({
      owner,
      repo,
      ref: newCommit.sha,
    });

    return fullCommit;
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<Commit> {
    const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: sha });
    return data;
  }

  async listCommits(owner: string, repo: string, branch: string, perPage = 10): Promise<Commit[]> {
    const { data } = await this.octokit.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: perPage,
    });
    return data;
  }

  // ============================================
  // Pull Request Operations
  // ============================================

  async createPullRequest(
    owner: string,
    repo: string,
    options: CreatePROptions
  ): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: options.draft,
    });
    return data;
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: prNumber });
    return data;
  }

  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequest[]> {
    const { data } = await this.octokit.pulls.list({ owner, repo, state });
    return data;
  }

  async mergePullRequest(owner: string, repo: string, prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<void> {
    await this.octokit.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: mergeMethod,
    });
  }

  async closePullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
    await this.octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    });
  }

  // ============================================
  // File Operations
  // ============================================

  async readFile(owner: string, repo: string, path: string, branch: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  async writeFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    branch: string,
    message: string
  ): Promise<void> {
    // Check if file exists to get SHA
    let sha: string | undefined;
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
      if (!Array.isArray(data) && data.type === 'file') {
        sha = data.sha;
      }
    } catch {
      // File doesn't exist, which is fine
    }

    await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha,
    });
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    message: string
  ): Promise<void> {
    // Get file SHA
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    await this.octokit.repos.deleteFile({
      owner,
      repo,
      path,
      message,
      sha: data.sha,
      branch,
    });
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse GitHub repo URL to extract owner and name
 * Supports: https://github.com/owner/repo or git@github.com:owner/repo.git
 */
export function parseRepoUrl(url: string): { owner: string; name: string } | null {
  // HTTPS format
  const httpsMatch = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }

  // SSH format
  const sshMatch = url.match(/git@github\.com:([^\/]+)\/(.+)\.git/);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  return null;
}

/**
 * Create slug from text (for branch names)
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}
```

## Step 6: Create GitHub Service Factory

Create `src/lib/github-factory.ts`:

```typescript
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
```

## Step 7: Create GitHub OAuth Routes

Create `src/routes/github-auth.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { db } from '../lib/db.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { sessionManager } from '../lib/redis.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL!;

// ============================================
// GitHub OAuth Flow
// ============================================

/**
 * Step 1: Initiate OAuth flow
 * GET /api/auth/github
 */
router.get('/github', authenticate, asyncHandler(async (req, res) => {
  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString('hex');

  // Store state in Redis with 10-minute expiration
  await sessionManager.set(`github_oauth_state:${state}`, req.user!.id, 600);

  // Redirect to GitHub OAuth
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: 'repo user:email',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}));

/**
 * Step 2: OAuth callback
 * GET /api/auth/github/callback
 */
router.get('/github/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.redirect('/error?message=Missing code or state parameter');
  }

  // Verify CSRF state token
  const userId = await sessionManager.get<string>(`github_oauth_state:${state}`);
  if (!userId) {
    return res.redirect('/error?message=Invalid or expired state token');
  }

  // Delete used state token
  await sessionManager.delete(`github_oauth_state:${state}`);

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userResponse.json();

    // Encrypt and store token
    const encryptedToken = encrypt(accessToken);

    await db.user.update({
      where: { id: userId },
      data: {
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubAccessToken: encryptedToken,
        avatarUrl: githubUser.avatar_url,
      },
    });

    // Redirect to frontend success page
    res.redirect('/github-connected?success=true');
  } catch (error: any) {
    console.error('GitHub OAuth error:', error);
    res.redirect(`/error?message=${encodeURIComponent(error.message)}`);
  }
}));

/**
 * Disconnect GitHub
 * POST /api/auth/github/disconnect
 */
router.post('/github/disconnect', authenticate, asyncHandler(async (req, res) => {
  await db.user.update({
    where: { id: req.user!.id },
    data: {
      githubId: null,
      githubUsername: null,
      githubAccessToken: null,
    },
  });

  res.json({ success: true, message: 'GitHub disconnected successfully' });
}));

/**
 * Get GitHub connection status
 * GET /api/auth/github/status
 */
router.get('/github/status', authenticate, asyncHandler(async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: req.user!.id },
    select: {
      githubId: true,
      githubUsername: true,
      avatarUrl: true,
    },
  });

  res.json({
    connected: !!user?.githubId,
    username: user?.githubUsername,
    avatarUrl: user?.avatarUrl,
  });
}));

export default router;
```

## Step 8: Add GitHub Routes to Server

Update `src/server.ts` to include GitHub routes:

```typescript
// Add this import
import githubAuthRoutes from './routes/github-auth.routes.js';

// Add this route (after other auth routes)
app.use('/api/auth', githubAuthRoutes);
```

## Step 9: Test GitHub OAuth

1. Start server:
```bash
npm run server
```

2. In browser:
   - Login to your platform
   - Navigate to: http://localhost:3000/api/auth/github
   - Authorize the app on GitHub
   - You should be redirected back with success

3. Verify in database:
```bash
npx prisma studio
```
Check that your user record has `githubId`, `githubUsername`, and `githubAccessToken` (encrypted).

## Step 10: Create Semantic Commit Generator

Create `src/lib/commit-message-generator.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { FileChange } from './github.js';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Generate semantic commit message using Claude
 */
export async function generateCommitMessage(
  files: FileChange[],
  taskDescription: string,
  prompt: string
): Promise<string> {
  const filesSummary = files
    .map((f) => `- ${f.path} (${f.content.length} bytes)`)
    .join('\n');

  const filesContent = files
    .map((f) => {
      const preview = f.content.substring(0, 500);
      return `\n--- ${f.path} ---\n${preview}${f.content.length > 500 ? '\n...(truncated)' : ''}`;
    })
    .join('\n');

  const analysisPrompt = `
Analyze these code changes and generate a semantic commit message.

Task Description: ${taskDescription}
User Prompt: ${prompt}

Files Changed:
${filesSummary}

File Content Preview:
${filesContent}

Generate a semantic commit message following this format:

type(scope): subject

body

Generated by Claude AI

Guidelines:
- Types: feat, fix, docs, style, refactor, test, chore
  - Use "feat" for new features
  - Use "fix" for bug fixes
  - Use "refactor" for code restructuring
  - Use "style" for UI/styling changes
  - Use "docs" for documentation
- Keep subject line under 50 characters
- Use present tense ("add" not "added")
- Include helpful details in body (bullet points)
- End with "Generated by Claude AI"

Example:
feat(ui): add responsive navigation menu

- Implemented hamburger menu for mobile devices
- Added smooth slide-in animation with CSS transitions
- Integrated accessibility features (ARIA labels)

Generated by Claude AI
`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const messageContent = response.content[0];
    if (messageContent.type === 'text') {
      return messageContent.text.trim();
    }

    throw new Error('Unexpected response format from Claude');
  } catch (error) {
    console.error('Failed to generate commit message:', error);
    // Fallback to basic commit message
    return `chore: update project files\n\n${taskDescription}\n\nGenerated by Claude AI`;
  }
}
```

## Step 11: Create GitHub Integration Service

Create `src/services/github-integration.service.ts`:

```typescript
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
   * Download files from E2B sandbox
   */
  private async downloadFilesFromSandbox(sandboxId: string): Promise<FileChange[]> {
    const fileList = await e2bService.listFiles(sandboxId, '/home/user');
    const files: FileChange[] = [];

    for (const file of fileList) {
      if (file.isFile && !file.path.includes('node_modules')) {
        try {
          const content = await e2bService.readFile(sandboxId, file.path);
          const relativePath = file.path.replace('/home/user/', '');

          files.push({
            path: relativePath,
            content,
          });
        } catch (error) {
          console.error(`Failed to read file ${file.path}:`, error);
        }
      }
    }

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
```

## Step 12: Update Generation Flow

Now update `src/server.ts` or create `src/routes/generate.routes.ts` to integrate GitHub commits:

Add after successful generation:

```typescript
// After Claude SDK completes generation and files are in E2B...

if (taskId) {
  try {
    sendEvent('status', { message: 'Committing to GitHub...', type: 'info' });

    const { commitSha, commitUrl } = await githubIntegrationService.commitGeneratedFiles(
      generation.id
    );

    sendEvent('status', {
      message: 'Code committed to GitHub',
      type: 'success',
      commitUrl,
      commitSha,
    });
  } catch (error: any) {
    sendEvent('error', {
      message: `GitHub commit failed: ${error.message}`,
      continueAnyway: true,
    });
  }
}
```

## Step 13: Create GitHub API Routes

Create `src/routes/github.routes.ts`:

```typescript
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

export default router;
```

Add to `src/server.ts`:

```typescript
import githubRoutes from './routes/github.routes.js';

app.use('/api', githubRoutes);
```

## Next Steps

You now have:
- ✅ GitHub OAuth authentication
- ✅ Token encryption
- ✅ GitHub service layer
- ✅ Repository linking and creation
- ✅ Automatic branch creation per task
- ✅ Semantic commit message generation
- ✅ Auto-commit after generation
- ✅ Pull request creation

To continue:
1. Implement webhook handlers (see PHASE3_ARCHITECTURE.md section 7)
2. Test full workflow end-to-end
3. Add error handling and retry logic
4. Implement caching for GitHub API calls
5. Add rate limiting
6. Build frontend UI for GitHub features

## Testing Checklist

- [ ] GitHub OAuth flow works
- [ ] Token is encrypted in database
- [ ] Can link existing repository
- [ ] Can create new repository
- [ ] Branch created on first generation
- [ ] Code committed after generation
- [ ] Commit message is semantic and helpful
- [ ] PR created when task set to review
- [ ] Multiple concurrent tasks work
- [ ] Error handling is graceful

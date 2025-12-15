# Phase 3: Git Automation - Deep Architecture Design

## Executive Summary

This document provides the complete technical architecture for integrating GitHub automation into the AI development platform. The implementation will transform the platform from a sandbox-based prototyping tool into a production-grade development workflow with full version control, team collaboration, and professional git practices.

## Key Features

1. **GitHub OAuth Authentication** - Secure user authorization with encrypted token storage
2. **Automatic Repository Management** - Create/link repos, manage branches per task
3. **Intelligent Commit Automation** - AI-generated semantic commits after each generation
4. **Pull Request Automation** - Auto-create PRs when tasks enter review status
5. **Webhook Integration** - Real-time sync of GitHub events back to platform

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│  (Connect GitHub → Create Project → Generate Code → Auto PR)    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Express API Layer                           │
│  /api/auth/github/* | /api/projects/:id/github | /api/tasks/pr │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────────┐    ┌─────────────────────┐
│  GitHub Service  │    │   E2B Service       │
│  (git operations)│    │   (sandbox files)   │
└────────┬─────────┘    └──────────┬──────────┘
         │                         │
         │    ┌───────────────────┘
         │    │
         ▼    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Generation Flow Enhanced                     │
│                                                                   │
│  1. User submits prompt                                          │
│  2. Create E2B sandbox + GitHub branch                           │
│  3. Claude generates code → E2B sandbox                          │
│  4. Download files from E2B                                      │
│  5. Generate semantic commit message (via Claude)                │
│  6. Commit + push to GitHub branch                               │
│  7. Store commit SHA in database                                 │
│  8. Return sandbox URL + GitHub commit URL                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Repository                           │
│  • Branches per task                                             │
│  • Semantic commits                                              │
│  • Pull requests with AI summaries                               │
│  • Webhooks notify platform of changes                           │
└─────────────────────────────────────────────────────────────────┘
```

## 1. GitHub OAuth Implementation

### 1.1 OAuth Flow

```
┌──────┐                                                      ┌────────┐
│ User │                                                      │ GitHub │
└──┬───┘                                                      └───┬────┘
   │                                                              │
   │ 1. Click "Connect GitHub"                                   │
   │────────────────────────────────────────────────────────────▶│
   │                                                              │
   │ 2. GET /api/auth/github                                     │
   │    (creates state token, stores in session)                 │
   │                                                              │
   │ 3. Redirect to GitHub OAuth                                 │
   │    https://github.com/login/oauth/authorize                 │
   │    ?client_id=xxx                                           │
   │    &redirect_uri=http://localhost:3000/api/auth/github/callback │
   │    &scope=repo,user:email                                   │
   │    &state={csrf_token}                                      │
   │────────────────────────────────────────────────────────────▶│
   │                                                              │
   │ 4. User authorizes app                                      │
   │                                                              │
   │ 5. GitHub redirects back                                    │
   │    /api/auth/github/callback?code=xxx&state=xxx             │
   │◀────────────────────────────────────────────────────────────│
   │                                                              │
   │ 6. Validate state token (CSRF protection)                   │
   │                                                              │
   │ 7. Exchange code for access token                           │
   │    POST https://github.com/login/oauth/access_token         │
   │────────────────────────────────────────────────────────────▶│
   │                                                              │
   │ 8. Receive access token                                     │
   │◀────────────────────────────────────────────────────────────│
   │                                                              │
   │ 9. Fetch user profile                                       │
   │    GET https://api.github.com/user                          │
   │────────────────────────────────────────────────────────────▶│
   │                                                              │
   │ 10. Encrypt + store token in database                       │
   │     Update user record with githubId, githubUsername        │
   │                                                              │
   │ 11. Redirect to frontend with success message               │
   │                                                              │
```

### 1.2 Required Environment Variables

```env
# GitHub OAuth App credentials
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# Token encryption (generate with: openssl rand -base64 32)
ENCRYPTION_KEY=your-32-byte-encryption-key-here
```

### 1.3 Required GitHub Scopes

- `repo` - Full control of private repositories (create, read, write, delete)
- `user:email` - Read user email addresses
- `read:user` - Read user profile data

### 1.4 Security Measures

**CSRF Protection**
- Generate random state token before OAuth redirect
- Store in Redis/session with 10-minute expiration
- Validate on callback to prevent CSRF attacks

**Token Encryption**
- GitHub access tokens encrypted at rest using AES-256-GCM
- Encryption key stored in environment variable (never in code)
- IV and auth tag stored with encrypted data

**Token Refresh**
- GitHub tokens don't expire but can be revoked
- Implement token validation before each API call
- Handle revocation gracefully with re-authorization prompt

## 2. GitHub Service Layer Architecture

### 2.1 Service Structure

```typescript
// src/lib/github.ts

import { Octokit } from '@octokit/rest';
import { db } from './db.js';
import { encryptToken, decryptToken } from './encryption.js';

export class GitHubService {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  // Repository Operations
  async createRepository(name: string, options: CreateRepoOptions): Promise<Repository>
  async getRepository(owner: string, repo: string): Promise<Repository>
  async listUserRepositories(): Promise<Repository[]>
  async deleteRepository(owner: string, repo: string): Promise<void>

  // Branch Operations
  async createBranch(owner: string, repo: string, branchName: string, fromBranch: string): Promise<Branch>
  async getBranch(owner: string, repo: string, branchName: string): Promise<Branch>
  async listBranches(owner: string, repo: string): Promise<Branch[]>
  async deleteBranch(owner: string, repo: string, branchName: string): Promise<void>

  // Commit Operations
  async createCommit(owner: string, repo: string, branch: string, files: FileChange[], message: string): Promise<Commit>
  async getCommit(owner: string, repo: string, sha: string): Promise<Commit>
  async listCommits(owner: string, repo: string, branch: string): Promise<Commit[]>

  // Pull Request Operations
  async createPullRequest(owner: string, repo: string, options: CreatePROptions): Promise<PullRequest>
  async updatePullRequest(owner: string, repo: string, prNumber: number, options: UpdatePROptions): Promise<PullRequest>
  async mergePullRequest(owner: string, repo: string, prNumber: number): Promise<void>
  async closePullRequest(owner: string, repo: string, prNumber: number): Promise<void>

  // File Operations
  async readFile(owner: string, repo: string, path: string, branch: string): Promise<string>
  async writeFile(owner: string, repo: string, path: string, content: string, branch: string, message: string): Promise<void>
  async deleteFile(owner: string, repo: string, path: string, branch: string, message: string): Promise<void>

  // User Operations
  async getCurrentUser(): Promise<GitHubUser>
  async validateToken(): Promise<boolean>
}
```

### 2.2 Token Management

```typescript
// src/lib/encryption.ts

import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');
const ALGORITHM = 'aes-256-gcm';

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
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
```

### 2.3 GitHub Service Factory

```typescript
// src/lib/github-factory.ts

import { db } from './db.js';
import { decryptToken } from './encryption.js';
import { GitHubService } from './github.js';

export async function createGitHubService(userId: string): Promise<GitHubService> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true, githubId: true }
  });

  if (!user?.githubAccessToken) {
    throw new Error('GitHub not connected. Please authorize GitHub access first.');
  }

  const accessToken = decryptToken(user.githubAccessToken);
  return new GitHubService(accessToken);
}
```

## 3. Branch Strategy

### 3.1 Branch Naming Convention

```
Format: task/{taskId}/{slug}

Examples:
- task/cm3x1y2z3/add-login-page
- task/cm3x1y2z4/fix-navbar-responsive
- task/cm3x1y2z5/refactor-api-client
```

### 3.2 Branch Lifecycle

```
1. Task Created
   └─▶ status = "todo"

2. User Starts Task / AI Generation Requested
   └─▶ Create branch from main
   └─▶ Store branchName in task
   └─▶ status = "in_progress"

3. AI Generates Code
   └─▶ Commit to task branch
   └─▶ Store commit SHA in generation
   └─▶ Multiple commits allowed per task

4. Task Ready for Review
   └─▶ status = "review"
   └─▶ Auto-create Pull Request
   └─▶ Store prUrl and prNumber in task

5. PR Merged (via webhook)
   └─▶ status = "done"
   └─▶ completedAt = now()
   └─▶ Optional: Delete branch

6. PR Closed Without Merge (via webhook)
   └─▶ status = "todo" (revert to todo)
   └─▶ Keep branch for potential re-work
```

### 3.3 Concurrent Task Handling

Multiple tasks can have in_progress branches simultaneously. Each task maintains its own isolated branch.

## 4. Commit Automation

### 4.1 Semantic Commit Message Generation

Use Claude to analyze generated files and create semantic commit messages:

```typescript
async function generateCommitMessage(
  files: FileChange[],
  taskDescription: string,
  prompt: string
): Promise<string> {
  const filesSummary = files.map(f => `${f.path} (${f.status})`).join('\n');

  const analysisPrompt = `
Analyze these code changes and generate a semantic commit message.

Task Description: ${taskDescription}
User Prompt: ${prompt}

Files Changed:
${filesSummary}

File Contents:
${files.map(f => `\n--- ${f.path} ---\n${f.content}`).join('\n')}

Generate a semantic commit message following this format:

type(scope): subject

body

footer

Types: feat, fix, docs, style, refactor, test, chore
- Use "feat" for new features
- Use "fix" for bug fixes
- Use "refactor" for code restructuring
- Use "style" for UI/styling changes
- Use "docs" for documentation

Keep subject line under 50 characters.
Include helpful details in body.
End with: "Generated by Claude AI"
`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 500,
    messages: [{ role: 'user', content: analysisPrompt }]
  });

  return response.content[0].text;
}
```

**Example Output:**
```
feat(ui): add responsive navigation menu

- Implemented hamburger menu for mobile devices
- Added smooth slide-in animation with CSS transitions
- Integrated accessibility features (ARIA labels, keyboard navigation)
- Styled with modern gradient theme matching design system

Generated by Claude AI
```

### 4.2 Commit Workflow

```typescript
async function commitGeneratedFiles(
  projectId: string,
  taskId: string,
  generationId: string,
  sandboxId: string
): Promise<string> {
  // 1. Get project and task details
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { user: true }
  });

  const task = await db.task.findUnique({
    where: { id: taskId }
  });

  // 2. Initialize GitHub service
  const github = await createGitHubService(project.userId);

  // 3. Ensure branch exists
  if (!task.branchName) {
    const branchName = `task/${taskId}/${slugify(task.title)}`;
    await github.createBranch(
      project.githubRepoOwner!,
      project.githubRepoName!,
      branchName,
      project.defaultBranch || 'main'
    );

    await db.task.update({
      where: { id: taskId },
      data: { branchName }
    });
  }

  // 4. Download files from E2B sandbox
  const files = await e2bService.listFiles(sandboxId, '/home/user');
  const fileChanges: FileChange[] = [];

  for (const file of files) {
    if (file.isFile) {
      const content = await e2bService.readFile(sandboxId, file.path);
      fileChanges.push({
        path: file.path.replace('/home/user/', ''),
        content,
        status: 'modified' // or 'added' if new file
      });
    }
  }

  // 5. Generate semantic commit message
  const generation = await db.generation.findUnique({
    where: { id: generationId }
  });

  const commitMessage = await generateCommitMessage(
    fileChanges,
    task.description || task.title,
    generation.prompt
  );

  // 6. Create commit on GitHub
  const commit = await github.createCommit(
    project.githubRepoOwner!,
    project.githubRepoName!,
    task.branchName,
    fileChanges,
    commitMessage
  );

  // 7. Update generation record with commit SHA
  await db.generation.update({
    where: { id: generationId },
    data: {
      outputPath: commit.html_url,
      // Store commit SHA in a new field (need migration)
    }
  });

  return commit.sha;
}
```

## 5. Pull Request Automation

### 5.1 Auto-PR Creation

Trigger: Task status changes to "review"

```typescript
async function createPullRequestForTask(taskId: string): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      project: { include: { user: true } },
      generations: { orderBy: { createdAt: 'desc' } }
    }
  });

  if (!task.branchName) {
    throw new Error('Task has no branch. Generate code first.');
  }

  const github = await createGitHubService(task.project.userId);

  // Generate PR description
  const prBody = await generatePRDescription(task);

  // Create pull request
  const pr = await github.createPullRequest(
    task.project.githubRepoOwner!,
    task.project.githubRepoName!,
    {
      title: task.title,
      body: prBody,
      head: task.branchName,
      base: task.project.defaultBranch || 'main',
      draft: false
    }
  );

  // Update task with PR info
  await db.task.update({
    where: { id: taskId },
    data: {
      prUrl: pr.html_url,
      prNumber: pr.number
    }
  });
}
```

### 5.2 PR Description Generation

```typescript
async function generatePRDescription(task: Task & {
  project: Project,
  generations: Generation[]
}): Promise<string> {
  const generationSummary = task.generations
    .map(g => `- ${g.prompt} (${g.filesCreated.length} files)`)
    .join('\n');

  return `
## Summary

${task.description || 'No description provided'}

## Changes

This pull request includes AI-generated code from ${task.generations.length} generation(s):

${generationSummary}

## Files Changed

${task.generations.flatMap(g => g.filesCreated).join('\n')}

## Task Details

- **Task ID:** ${task.id}
- **Status:** ${task.status}
- **Priority:** ${task.priority}
- **Branch:** ${task.branchName}

---

🤖 Generated by [Your Platform Name](https://yourplatform.com/projects/${task.projectId}/tasks/${task.id})
`;
}
```

## 6. Enhanced Generation Flow

### 6.1 Updated POST /api/generate

```typescript
router.post('/generate', authenticate, asyncHandler(async (req, res) => {
  const { prompt, projectId, taskId } = req.body;

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Create E2B sandbox
    sendEvent('status', { message: 'Creating sandbox...', type: 'info' });
    const { sandboxId, sandbox } = await e2bService.createSandbox({ projectId });

    // 2. Create GitHub branch (if task specified and no branch exists)
    let branchName: string | null = null;
    if (taskId) {
      const task = await db.task.findUnique({ where: { id: taskId } });

      if (!task.branchName) {
        sendEvent('status', { message: 'Creating GitHub branch...', type: 'info' });

        const project = await db.project.findUnique({
          where: { id: projectId },
          include: { user: true }
        });

        const github = await createGitHubService(project.userId);
        branchName = `task/${taskId}/${slugify(task.title)}`;

        await github.createBranch(
          project.githubRepoOwner!,
          project.githubRepoName!,
          branchName,
          project.defaultBranch || 'main'
        );

        await db.task.update({
          where: { id: taskId },
          data: { branchName }
        });

        sendEvent('status', { message: `Created branch: ${branchName}`, type: 'success' });
      } else {
        branchName = task.branchName;
      }
    }

    // 3. Create generation record
    const generation = await db.generation.create({
      data: {
        prompt,
        projectId,
        taskId,
        sandboxId,
        status: 'running'
      }
    });

    // 4. Run Claude SDK generation
    sendEvent('status', { message: 'Generating code...', type: 'info' });

    // ... existing Claude SDK streaming logic ...

    // 5. After successful generation, commit to GitHub
    if (taskId && branchName) {
      sendEvent('status', { message: 'Committing to GitHub...', type: 'info' });

      try {
        const commitSha = await commitGeneratedFiles(
          projectId,
          taskId,
          generation.id,
          sandboxId
        );

        const project = await db.project.findUnique({
          where: { id: projectId }
        });

        const commitUrl = `https://github.com/${project.githubRepoOwner}/${project.githubRepoName}/commit/${commitSha}`;

        sendEvent('status', {
          message: 'Code committed to GitHub',
          type: 'success',
          commitUrl,
          branchName
        });
      } catch (error) {
        sendEvent('error', {
          message: `Failed to commit to GitHub: ${error.message}`,
          continueAnyway: true
        });
      }
    }

    // 6. Return complete event
    sendEvent('complete', {
      message: 'Generation complete',
      sandboxId,
      sandboxUrl,
      branchName,
      filesCreated: generation.filesCreated
    });

  } catch (error) {
    sendEvent('error', { message: error.message });
  } finally {
    res.end();
  }
}));
```

## 7. Webhook Integration

### 7.1 GitHub Webhook Events

Listen for:
- `pull_request` - PR opened/closed/merged
- `push` - Commits pushed to branch
- `pull_request_review` - Review submitted

### 7.2 Webhook Handler

```typescript
// POST /api/webhooks/github
router.post('/webhooks/github', asyncHandler(async (req, res) => {
  // Verify webhook signature
  const signature = req.headers['x-hub-signature-256'];
  const isValid = verifyWebhookSignature(req.body, signature);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  switch (event) {
    case 'pull_request':
      await handlePullRequestEvent(payload);
      break;

    case 'push':
      await handlePushEvent(payload);
      break;

    case 'pull_request_review':
      await handlePullRequestReviewEvent(payload);
      break;
  }

  res.status(200).json({ received: true });
}));

async function handlePullRequestEvent(payload: any): Promise<void> {
  const { action, pull_request } = payload;

  // Find task by PR number
  const task = await db.task.findFirst({
    where: { prNumber: pull_request.number }
  });

  if (!task) return;

  switch (action) {
    case 'opened':
      // PR was created (already handled by our auto-PR)
      break;

    case 'closed':
      if (pull_request.merged) {
        // PR was merged - mark task as done
        await db.task.update({
          where: { id: task.id },
          data: {
            status: 'done',
            completedAt: new Date()
          }
        });
      } else {
        // PR was closed without merge - revert to todo
        await db.task.update({
          where: { id: task.id },
          data: { status: 'todo' }
        });
      }
      break;

    case 'reopened':
      // PR was reopened - set back to review
      await db.task.update({
        where: { id: task.id },
        data: { status: 'review' }
      });
      break;
  }
}
```

### 7.3 Webhook Signature Verification

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: any, signature: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET!;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

## 8. Database Schema Updates

### 8.1 Required Migrations

Add missing fields:

```prisma
model Generation {
  // ... existing fields

  // GitHub integration
  commitSha     String?
  commitUrl     String?

  // ... rest of model
}

model Project {
  // ... existing fields

  // Parse repo owner/name from URL
  githubRepoOwner String?
  githubRepoName  String?

  // ... rest of model
}
```

Migration command:
```bash
npx prisma migrate dev --name add_github_commit_fields
```

## 9. API Endpoints

### 9.1 GitHub Auth Routes

```typescript
// Start OAuth flow
GET /api/auth/github
  Response: Redirect to GitHub OAuth

// OAuth callback
GET /api/auth/github/callback?code=xxx&state=xxx
  Response: Redirect to frontend with success/error

// Disconnect GitHub
POST /api/auth/github/disconnect
  Auth: Required
  Response: { success: true }
```

### 9.2 GitHub Repository Routes

```typescript
// Link existing GitHub repo to project
POST /api/projects/:id/github
  Auth: Required
  Body: { repoUrl: string } | { repoOwner: string, repoName: string }
  Response: { project: Project }

// Create new GitHub repo for project
POST /api/projects/:id/github/create
  Auth: Required
  Body: { name: string, description?: string, private?: boolean }
  Response: { project: Project, repo: Repository }

// Unlink GitHub repo
DELETE /api/projects/:id/github
  Auth: Required
  Response: { success: true }

// Get GitHub repo info
GET /api/projects/:id/github
  Auth: Required
  Response: { repo: Repository, branches: Branch[], recent_commits: Commit[] }
```

### 9.3 Task Git Routes

```typescript
// Create PR for task
POST /api/tasks/:id/pr
  Auth: Required
  Body: { title?: string, description?: string }
  Response: { task: Task, pullRequest: PullRequest }

// Manual commit trigger
POST /api/tasks/:id/commit
  Auth: Required
  Body: { message?: string }
  Response: { commit: Commit }

// Get task's GitHub info
GET /api/tasks/:id/github
  Auth: Required
  Response: { branch: Branch, commits: Commit[], pullRequest?: PullRequest }
```

## 10. Implementation Phases

### Phase 3.1: Foundation (Week 1)
- [ ] Set up GitHub OAuth App
- [ ] Implement token encryption
- [ ] Create GitHub service layer
- [ ] Add OAuth routes
- [ ] Test token storage and retrieval

### Phase 3.2: Repository Management (Week 1-2)
- [ ] Implement repository linking
- [ ] Add repository creation
- [ ] Build branch management
- [ ] Test with real GitHub repos

### Phase 3.3: Commit Automation (Week 2-3)
- [ ] Integrate commit generation into generation flow
- [ ] Implement semantic commit message AI
- [ ] Add file download from E2B
- [ ] Test full commit workflow

### Phase 3.4: Pull Request Automation (Week 3-4)
- [ ] Auto-create PRs on task review status
- [ ] Generate PR descriptions
- [ ] Link PRs to tasks
- [ ] Test PR workflow

### Phase 3.5: Webhook Integration (Week 4)
- [ ] Set up webhook endpoint
- [ ] Implement signature verification
- [ ] Handle PR events
- [ ] Sync task status from GitHub

## 11. Testing Strategy

### 11.1 Unit Tests

Test each service method:
```typescript
describe('GitHubService', () => {
  it('should create a new repository', async () => {
    const github = new GitHubService(testToken);
    const repo = await github.createRepository('test-repo', {
      description: 'Test repository',
      private: true
    });
    expect(repo.name).toBe('test-repo');
  });

  it('should create a branch from main', async () => {
    // ...
  });
});
```

### 11.2 Integration Tests

Test full workflows:
```typescript
describe('Generation with GitHub', () => {
  it('should generate code and commit to GitHub', async () => {
    // 1. Create project with GitHub repo
    // 2. Create task
    // 3. Trigger generation
    // 4. Verify commit created
    // 5. Verify files on GitHub match E2B sandbox
  });
});
```

### 11.3 Manual Testing Checklist

- [ ] GitHub OAuth flow works
- [ ] Can create new repo
- [ ] Can link existing repo
- [ ] Branch created on first generation
- [ ] Code committed after generation
- [ ] Commit message is semantic
- [ ] PR created when task set to review
- [ ] Webhook updates task status
- [ ] Multiple tasks work in parallel
- [ ] Token encryption/decryption works

## 12. Security Considerations

### 12.1 Token Security
- ✅ Encrypt tokens at rest with AES-256-GCM
- ✅ Store encryption key in environment variable
- ✅ Never log decrypted tokens
- ✅ Rotate encryption key periodically
- ✅ Use HTTPS only in production

### 12.2 Webhook Security
- ✅ Verify webhook signatures
- ✅ Use timing-safe comparison
- ✅ Validate payload structure
- ✅ Rate limit webhook endpoint
- ✅ Log all webhook events

### 12.3 OAuth Security
- ✅ CSRF protection with state parameter
- ✅ Validate redirect URI
- ✅ Short-lived state tokens
- ✅ HTTPS callback URL in production
- ✅ Scope minimization

## 13. Error Handling

### 13.1 GitHub API Errors

```typescript
try {
  await github.createBranch(owner, repo, branchName, baseBranch);
} catch (error) {
  if (error.status === 422) {
    // Branch already exists
    logger.warn(`Branch ${branchName} already exists`);
  } else if (error.status === 404) {
    throw new Error('Repository not found. Check permissions.');
  } else if (error.status === 403) {
    throw new Error('Rate limit exceeded or insufficient permissions');
  } else {
    throw error;
  }
}
```

### 13.2 Graceful Degradation

If GitHub operations fail, generation should still succeed:

```typescript
try {
  await commitGeneratedFiles(...);
  sendEvent('status', { message: 'Code committed to GitHub', type: 'success' });
} catch (error) {
  logger.error('GitHub commit failed:', error);
  sendEvent('error', {
    message: `GitHub commit failed: ${error.message}. Files available in sandbox.`,
    continueAnyway: true
  });
  // Don't throw - allow generation to complete
}
```

## 14. Performance Optimization

### 14.1 Caching

Cache GitHub data in Redis:
```typescript
// Cache repository info for 5 minutes
const cacheKey = `github:repo:${owner}/${repo}`;
let repoData = await cache.get(cacheKey);

if (!repoData) {
  repoData = await github.getRepository(owner, repo);
  await cache.set(cacheKey, repoData, 300);
}
```

### 14.2 Batch Operations

Commit multiple files in single commit instead of one commit per file:
```typescript
// ✅ Good: Single commit with all files
await github.createCommit(owner, repo, branch, [
  { path: 'index.html', content: '...' },
  { path: 'style.css', content: '...' },
  { path: 'script.js', content: '...' }
], message);

// ❌ Bad: Multiple commits
for (const file of files) {
  await github.createCommit(owner, repo, branch, [file], message);
}
```

### 14.3 Parallel Operations

When safe, run operations in parallel:
```typescript
// Fetch user info and repos simultaneously
const [user, repos] = await Promise.all([
  github.getCurrentUser(),
  github.listUserRepositories()
]);
```

## 15. Future Enhancements

### 15.1 Advanced Features (Phase 4+)

- **Code Review Agent** - AI reviews code before committing
- **Auto-fix Linting** - Automatically fix ESLint/Prettier issues
- **Test Generation** - Generate tests for new code
- **Deployment Integration** - Auto-deploy on merge to main
- **Multi-agent Collaboration** - Planning → Development → Testing → Review agents

### 15.2 GitHub Advanced Features

- **GitHub Actions Integration** - Trigger CI/CD on commits
- **Issue Linking** - Link commits/PRs to GitHub issues
- **Project Boards** - Sync with GitHub Projects
- **Code Owners** - Auto-assign reviewers
- **Protected Branches** - Handle branch protection rules

## 16. Success Metrics

Track these metrics to measure success:

- **Adoption:** % of users who connect GitHub
- **Engagement:** # of commits/PRs created per user
- **Quality:** # of PRs merged vs. closed
- **Performance:** Time from generation to commit
- **Reliability:** GitHub API success rate
- **Security:** # of token encryption/decryption operations

## 17. Conclusion

This architecture transforms the platform from a prototyping tool into a production-ready development workflow. By integrating deeply with GitHub, we enable:

1. **Persistent Storage** - Code lives beyond 1-hour sandbox lifetime
2. **Version Control** - Full git history and collaboration
3. **Professional Workflow** - Branches, PRs, code review
4. **Team Collaboration** - Multiple developers working together
5. **Production Deployment** - Direct path from generation to production

The implementation is designed to be:
- **Secure** - Encrypted tokens, verified webhooks, CSRF protection
- **Reliable** - Graceful error handling, fallback mechanisms
- **Performant** - Caching, batching, parallel operations
- **Scalable** - Service-oriented architecture, rate limiting
- **Maintainable** - Clean abstractions, comprehensive testing

This sets the foundation for Phase 4 (multi-agent collaboration) and Phase 5 (advanced frontend features).

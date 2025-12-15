# Phase 3: Git Automation - Implementation Guide

## Overview

Phase 3 enhances the AI Dev Platform with advanced GitHub automation capabilities, including:

1. **Sandbox Reconnection Service** - Handles expired E2B sandboxes gracefully
2. **GitHub Webhook Integration** - Automatic task status updates based on PR events
3. **Enhanced Error Handling** - Retry logic with exponential backoff for GitHub API calls

## Features

### 1. Sandbox Reconnection Service

**Location**: `/src/services/sandbox-reconnection.service.ts`

**Purpose**: Automatically reconnect to expired E2B sandboxes or create new ones when necessary.

**Key Methods**:

```typescript
// Reconnect to existing sandbox or create new one
await sandboxReconnectionService.reconnectOrCreate(sandboxId, projectId);

// Check if sandbox is still active
await sandboxReconnectionService.isSandboxActive(sandboxId);

// Get sandbox with automatic reconnection
await sandboxReconnectionService.getSandbox(sandboxId, projectId);
```

**Use Cases**:
- Server restarts (sandboxes expire from memory)
- Long-running tasks where sandbox may have timed out
- Downloading files from sandbox for GitHub commits

**How It Works**:

1. Checks if sandbox exists in memory
2. If not, attempts to reconnect using E2B's `Sandbox.reconnect()`
3. If reconnection fails, creates a new sandbox
4. Updates database with new sandbox ID
5. Migrates any generation records to new sandbox

### 2. E2B Service Reconnection

**Location**: `/src/lib/e2b.ts`

**New Method**: `reconnectSandbox(sandboxId, projectId?)`

**Integration**:

```typescript
// In github-integration.service.ts
private async downloadFilesFromSandbox(sandboxId: string, projectId?: string) {
  // Try to reconnect to sandbox if it expired
  const sandboxInfo = e2bService.getSandbox(sandboxId);
  if (!sandboxInfo) {
    await e2bService.reconnectSandbox(sandboxId, projectId);
  }

  // Continue with file downloads...
}
```

**Benefits**:
- No manual intervention needed for expired sandboxes
- Seamless file downloads even after server restarts
- Automatic database updates

### 3. GitHub Webhook Integration

**Location**: `/src/routes/webhook.routes.ts`

**Endpoint**: `POST /api/webhooks/github`

**Supported Events**:

#### Pull Request Merged
```json
{
  "action": "closed",
  "pull_request": {
    "merged": true,
    "number": 42
  }
}
```
**Action**: Task moved to "done" status

#### Pull Request Closed (Not Merged)
```json
{
  "action": "closed",
  "pull_request": {
    "merged": false,
    "number": 42
  }
}
```
**Action**: Task reverted to "todo" status

#### Pull Request Reopened
```json
{
  "action": "reopened",
  "pull_request": {
    "number": 42
  }
}
```
**Action**: Task moved to "review" status

#### Pull Request Ready for Review
```json
{
  "action": "ready_for_review",
  "pull_request": {
    "number": 42
  }
}
```
**Action**: Task moved to "review" status

### 4. Webhook Security

**Signature Verification**:

The webhook endpoint verifies GitHub's HMAC-SHA256 signature to ensure authenticity:

```typescript
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Benefits**:
- Prevents unauthorized webhook calls
- Protects against tampering
- Timing-safe comparison prevents timing attacks

### 5. Enhanced GitHub API Error Handling

**Location**: `/src/lib/github.ts`

**Retry Configuration**:

```typescript
const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
```

**Retryable Errors**:
- HTTP 408 (Request Timeout)
- HTTP 429 (Rate Limit)
- HTTP 500 (Internal Server Error)
- HTTP 502 (Bad Gateway)
- HTTP 503 (Service Unavailable)
- HTTP 504 (Gateway Timeout)
- Network errors (ECONNRESET, ETIMEDOUT)

**Methods with Retry Logic**:
- `createRepository()`
- `getRepository()`
- `createBranch()`
- `createCommit()`
- `createPullRequest()`
- `mergePullRequest()`

**Example Usage**:

```typescript
// Automatic retry on failure
const repo = await github.createRepository('my-repo', {
  description: 'Auto-retries on network errors',
  private: true
});

// Logs on retry:
// ⚠️  GitHub API createRepository failed (attempt 1/4): Network timeout
// ⏳ Retrying in 1000ms...
// ✅ Successfully created repository
```

**Benefits**:
- Resilient to transient network issues
- Handles GitHub API rate limits gracefully
- Exponential backoff prevents overwhelming the API
- Detailed logging for debugging

## Setup Instructions

### 1. Configure GitHub Webhook Secret

Generate a secure webhook secret:

```bash
openssl rand -hex 20
```

Add to `.env`:

```env
GITHUB_WEBHOOK_SECRET=your_generated_secret_here
```

### 2. Set Up GitHub Webhook

1. Go to your GitHub repository
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-domain.com/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Use the same value from `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select "Pull requests"
   - **Active**: ✓ Enabled

4. Click **Add webhook**

### 3. Test Webhook

```bash
# Check webhook health
curl https://your-domain.com/api/webhooks/health

# Response:
# {
#   "status": "ok",
#   "webhookSecret": true
# }
```

### 4. Verify Integration

1. Create a task with code generation
2. Generate code (creates branch + commits)
3. Create pull request
4. Merge PR in GitHub
5. Check task status in platform - should automatically move to "done"

## Database Updates

The webhook integration updates the following task fields:

```typescript
// On PR merged
{
  status: 'done',
  column: 'done',
  buildStatus: 'ready',
  completedAt: new Date()
}

// On PR closed (not merged)
{
  status: 'todo',
  column: 'research',
  buildStatus: 'pending'
}

// On PR reopened
{
  status: 'review',
  column: 'testing',
  buildStatus: 'ready'
}
```

## Error Handling

### Sandbox Reconnection Failures

If a sandbox cannot be reconnected, a new one is automatically created:

```typescript
try {
  await sandboxReconnectionService.reconnectOrCreate(sandboxId, projectId);
} catch (error) {
  // New sandbox created automatically
  // Old sandbox ID updated in database
  // Generation records migrated to new sandbox
}
```

### GitHub API Failures

All critical GitHub operations use retry logic:

```typescript
// Retries 3 times with exponential backoff
// Logs detailed error information
// Throws error only after all retries exhausted
```

### Webhook Signature Verification

Invalid signatures are rejected immediately:

```typescript
if (!verifyGitHubSignature(payload, signature, secret)) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

## Monitoring and Logging

### Sandbox Reconnection Logs

```
🔌 Attempting to reconnect to sandbox: abc123
✅ Sandbox abc123 found in memory and active

OR

⚠️  Sandbox abc123 not in memory, attempting reconnection...
🔄 Attempting to reconnect to E2B sandbox abc123...
✅ Successfully reconnected to sandbox abc123

OR

⚠️  Failed to reconnect to sandbox abc123: Sandbox expired
🆕 Creating new sandbox as replacement...
✅ Created new sandbox xyz789 to replace abc123
```

### GitHub API Retry Logs

```
⚠️  GitHub API createCommit failed (attempt 1/4): Rate limit exceeded
⏳ Retrying in 1000ms...
⚠️  GitHub API createCommit failed (attempt 2/4): Rate limit exceeded
⏳ Retrying in 2000ms...
✅ Successfully created commit: abc123def
```

### Webhook Event Logs

```
📥 GitHub webhook received: pull_request (ID: 12345-67890)
🔔 Pull Request closed: #42 in user/repo
🌿 Branch: task/123/feature-name
📋 Found task: Implement feature (ID: 123)
✅ PR #42 merged - updating task to 'done'
✅ Task 123 moved to 'done'
```

## Testing

### Test Sandbox Reconnection

```typescript
// Create a sandbox
const { sandboxId } = await e2bService.createSandbox({ projectId: 'test-123' });

// Simulate server restart (clear from memory)
e2bService['activeSandboxes'].clear();

// Test reconnection
const result = await sandboxReconnectionService.reconnectOrCreate(sandboxId, 'test-123');

console.log('Was reconnected:', result.wasReconnected); // true or false
console.log('Sandbox ID:', result.sandboxId);
```

### Test GitHub Webhooks Locally

Use ngrok to expose local server:

```bash
ngrok http 3000

# Use the ngrok URL in GitHub webhook settings
# Example: https://abc123.ngrok.io/api/webhooks/github
```

### Simulate Webhook Event

```bash
# Get the webhook secret
WEBHOOK_SECRET="your_secret_here"

# Create payload
PAYLOAD='{"action":"closed","pull_request":{"merged":true,"number":42}}'

# Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

# Send webhook
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -H "X-GitHub-Delivery: test-123" \
  -d "$PAYLOAD"
```

## Troubleshooting

### Webhook Not Receiving Events

1. Check GitHub webhook settings → Recent Deliveries
2. Verify payload URL is accessible
3. Check webhook secret matches `.env`
4. Review server logs for errors

### Sandbox Reconnection Fails

1. Check E2B API key is valid
2. Verify sandbox hasn't been manually deleted
3. Check E2B dashboard for sandbox status
4. Review E2B API rate limits

### GitHub API Retries Exhausted

1. Check GitHub API rate limits
2. Verify GitHub token has correct permissions
3. Check network connectivity
4. Review GitHub status page

## Future Enhancements

### Planned Features

1. **Cleanup on Partial Failures**
   - Rollback branch creation if commit fails
   - Delete PR if merge fails
   - Revert task status on error

2. **Advanced Webhook Events**
   - PR comments trigger code reviews
   - Issue creation triggers task generation
   - Push events trigger tests

3. **Sandbox Persistence**
   - Save sandbox state to S3/cloud storage
   - Restore sandbox from snapshot
   - Share sandboxes between sessions

4. **Rate Limit Management**
   - Queue GitHub operations
   - Respect rate limit headers
   - Automatic backoff on 429

## API Reference

### Sandbox Reconnection Service

```typescript
class SandboxReconnectionService {
  // Reconnect or create new sandbox
  async reconnectOrCreate(
    sandboxId: string,
    projectId?: string
  ): Promise<ReconnectionResult>

  // Check if sandbox is active
  async isSandboxActive(sandboxId: string): Promise<boolean>

  // Get sandbox with automatic reconnection
  async getSandbox(sandboxId: string, projectId?: string): Promise<Sandbox>
}
```

### Webhook Routes

```typescript
// Main webhook endpoint
POST /api/webhooks/github
Headers:
  - X-GitHub-Event: pull_request
  - X-Hub-Signature-256: sha256=<hmac>
  - X-GitHub-Delivery: <uuid>

// Health check
GET /api/webhooks/health

// Ping test
POST /api/webhooks/github/ping
```

### GitHub Service with Retry

```typescript
class GitHubService {
  // All methods automatically retry on failure
  async createRepository(name: string, options?: CreateRepoOptions): Promise<Repository>
  async createBranch(owner: string, repo: string, branchName: string, fromBranch?: string): Promise<Branch>
  async createCommit(owner: string, repo: string, branch: string, files: FileChange[], message: string): Promise<Commit>
  async createPullRequest(owner: string, repo: string, options: CreatePROptions): Promise<PullRequest>
  async mergePullRequest(owner: string, repo: string, prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase'): Promise<void>
}
```

## Conclusion

Phase 3 Git Automation significantly improves the reliability and automation of the AI Dev Platform's GitHub integration. The combination of sandbox reconnection, webhook automation, and enhanced error handling creates a robust, production-ready system that gracefully handles failures and keeps task status synchronized with GitHub PR states.

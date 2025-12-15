# Phase 3 Git Automation - Quick Start Guide

## Prerequisites

- AI Dev Platform running
- PostgreSQL database running (`npx prisma dev`)
- GitHub repository connected to project
- Node.js environment with all dependencies installed

## Setup (5 minutes)

### Step 1: Configure Webhook Secret

Generate a secure webhook secret:

```bash
openssl rand -hex 20
```

Add to `.env`:

```env
GITHUB_WEBHOOK_SECRET=<your_generated_secret>
```

### Step 2: Restart Server

```bash
npm run server
```

### Step 3: Set Up GitHub Webhook

1. Go to your GitHub repository
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-domain.com/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Use the value from `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select "Pull requests" only
   - **Active**: ✓ Enabled
4. Click **Add webhook**

### Step 4: Test Webhook

```bash
curl http://localhost:3000/api/webhooks/health
```

Expected response:

```json
{
  "status": "ok",
  "webhookSecret": true
}
```

## Usage Examples

### Automatic Task Status Updates

#### Scenario 1: Merge PR (Task → Done)

1. Create a task in your project
2. Generate code (creates branch + commits)
3. Create pull request in GitHub
4. Merge the PR
5. ✅ Task automatically moves to "done" status

**What happens behind the scenes**:
```
GitHub: PR merged
  ↓
Webhook: POST /api/webhooks/github
  ↓
Verify signature
  ↓
Find task by branch name + PR number
  ↓
Update task: status='done', column='done', completedAt=now()
```

#### Scenario 2: Close PR Without Merging (Task → Todo)

1. Close PR without merging
2. ✅ Task automatically reverts to "todo" status

#### Scenario 3: Reopen PR (Task → Review)

1. Reopen a closed PR
2. ✅ Task automatically moves to "review" status

### Sandbox Reconnection (Automatic)

#### Scenario: Server Restart

```bash
# 1. Generate code for a task
POST /api/generate
{
  "prompt": "Create landing page",
  "projectId": "abc123",
  "taskId": "task789"
}

# 2. Server creates sandbox and commits to GitHub
# sandboxId: "sandbox-xyz"

# 3. Server restarts (sandbox lost from memory)
npm run server

# 4. Commit more code to same task
POST /api/generate
{
  "prompt": "Add contact form",
  "projectId": "abc123",
  "taskId": "task789"
}

# ✅ System automatically:
#   - Detects sandbox-xyz not in memory
#   - Creates new sandbox: sandbox-new
#   - Updates database: generation.sandboxId = sandbox-new
#   - Continues with commit
```

**Logs**:
```
🔌 Attempting to recover sandbox: sandbox-xyz
⚠️  Sandbox sandbox-xyz not in memory (likely expired after server restart)
🆕 Creating new sandbox to replace sandbox-xyz...
✅ Created new sandbox sandbox-new to replace sandbox-xyz
📥 Reading file from E2B: /home/user/index.html
✅ Synced to E2B: index.html → /home/user/index.html
```

### GitHub API Retry (Automatic)

#### Scenario: GitHub Rate Limit

```typescript
// Creating commit when rate limited
const commit = await github.createCommit(
  owner,
  repo,
  branch,
  files,
  'feat: add feature'
);

// ✅ Automatically retries with exponential backoff
```

**Logs**:
```
⚠️  GitHub API createCommit failed (attempt 1/4): API rate limit exceeded
⏳ Retrying in 1000ms...
⚠️  GitHub API createCommit failed (attempt 2/4): API rate limit exceeded
⏳ Retrying in 2000ms...
✅ Commit created successfully: abc123def
```

## Testing Your Setup

### Test 1: Webhook Delivery

1. Go to GitHub → Settings → Webhooks → Your webhook
2. Click on webhook
3. Scroll to "Recent Deliveries"
4. Click "Redeliver" on a past delivery
5. Check server logs for webhook received message

### Test 2: Webhook Signature

Try sending webhook without signature:

```bash
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{"action":"opened"}'
```

Expected response:

```json
{
  "error": "Invalid signature"
}
```

### Test 3: Full Workflow

1. Create project:
```bash
POST /api/projects
{
  "name": "Test Project"
}
```

2. Link GitHub repository:
```bash
POST /api/projects/:projectId/github
{
  "repoUrl": "https://github.com/user/repo"
}
```

3. Create task:
```bash
POST /api/projects/:projectId/tasks
{
  "title": "Add homepage"
}
```

4. Generate code:
```bash
POST /api/generate
{
  "prompt": "Create simple homepage",
  "projectId": "...",
  "taskId": "...",
  "autoCommit": true
}
```

5. Check GitHub - should see:
   - New branch: `task/<id>/add-homepage`
   - Commit with generated files

6. Create PR in GitHub UI

7. Merge PR

8. Check task status:
```bash
GET /api/projects/:projectId/tasks
```

Expected:
```json
{
  "tasks": [
    {
      "id": "...",
      "title": "Add homepage",
      "status": "done",
      "column": "done",
      "completedAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

## Troubleshooting

### Webhook Not Receiving Events

**Problem**: GitHub shows webhook delivery failed

**Solution**:
1. Check server is publicly accessible
2. Verify URL in webhook settings
3. Check firewall/port forwarding
4. Test with ngrok for local development:
```bash
ngrok http 3000
# Use ngrok URL in GitHub webhook settings
```

### Invalid Signature Error

**Problem**: Webhook returns 401 Invalid signature

**Solution**:
1. Verify `GITHUB_WEBHOOK_SECRET` matches GitHub webhook secret exactly
2. Check for trailing spaces in `.env` file
3. Restart server after changing secret

### Sandbox Reconnection Fails

**Problem**: Error "Failed to create replacement sandbox"

**Solution**:
1. Check E2B API key is valid
2. Verify E2B account has available quota
3. Check E2B service status
4. Review E2B dashboard for limits

### GitHub API Retry Exhausted

**Problem**: "GitHub API failed after 4 attempts"

**Solution**:
1. Check GitHub API rate limits:
```bash
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/rate_limit
```

2. Wait for rate limit to reset
3. Consider implementing request queue
4. Check GitHub token has correct permissions

### Task Not Found for PR

**Problem**: Webhook logs "No task found for branch"

**Solution**:
1. Verify task has `branchName` field set
2. Check task has `prNumber` field matching PR
3. Ensure code generation completed successfully
4. Verify branch name format: `task/<id>/<slug>`

## Monitoring

### Check Webhook Health

```bash
# Check webhook endpoint
curl http://localhost:3000/api/webhooks/health

# Check overall system health
curl http://localhost:3000/api/health
```

### View Recent Webhook Deliveries

1. GitHub → Repository Settings
2. Webhooks → Click on your webhook
3. View "Recent Deliveries" section
4. Check response code and payload

### Monitor Server Logs

```bash
# Watch for webhook events
tail -f logs/server.log | grep "webhook"

# Watch for sandbox operations
tail -f logs/server.log | grep "sandbox"

# Watch for GitHub API calls
tail -f logs/server.log | grep "GitHub API"
```

## Best Practices

### 1. Keep Webhook Secret Secure

- Never commit `.env` to version control
- Use different secrets for dev/staging/prod
- Rotate secrets periodically
- Store in secure secret management system (e.g., AWS Secrets Manager)

### 2. Monitor Webhook Deliveries

- Regularly check GitHub webhook delivery status
- Set up alerting for failed deliveries
- Review webhook logs for anomalies

### 3. Handle Rate Limits

- The retry logic helps but doesn't eliminate rate limits
- Consider implementing request queues for high-volume operations
- Monitor rate limit headers
- Use authenticated requests (higher limits)

### 4. Test in Development

- Use ngrok for local webhook testing
- Test all webhook event types
- Verify signature verification works
- Test with expired sandboxes

### 5. Production Deployment

- Use HTTPS for webhook endpoint
- Set up monitoring/alerting
- Configure proper error tracking
- Set up database backups
- Monitor E2B quota usage

## Additional Resources

- [Phase 3 Full Documentation](./PHASE3_GIT_AUTOMATION.md)
- [Phase 3 Summary](./PHASE3_SUMMARY.md)
- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [E2B Documentation](https://e2b.dev/docs)

## Support

If you encounter issues:

1. Check logs: Look for error messages in server logs
2. Verify configuration: Ensure all environment variables are set
3. Test endpoints: Use curl to test webhook and API endpoints
4. Review documentation: Check full documentation for detailed troubleshooting
5. Check GitHub status: https://www.githubstatus.com/

## Next Steps

- Explore Phase 4: Multi-Agent System
- Set up production monitoring
- Configure CI/CD pipelines
- Add custom webhook handlers
- Implement advanced error recovery

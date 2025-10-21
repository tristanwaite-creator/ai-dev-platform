# GitHub Integration - Setup Guide

All code has been implemented! Follow these steps to complete the setup.

## What's Been Implemented

✅ **All Phase 3 Code Created:**
- Token encryption module (AES-256-GCM)
- GitHub service layer (full API wrapper)
- GitHub service factory (token management)
- OAuth authentication routes
- Semantic commit message generator
- GitHub integration service
- API routes for GitHub operations
- Server routes configured

✅ **Database Schema Updated:**
- Added `githubRepoOwner` and `githubRepoName` to Project model
- Added `commitSha` and `commitUrl` to Generation model

✅ **Environment Variables Added:**
- `.env` and `.env.example` updated with GitHub configuration
- Encryption key generated
- Webhook secret generated

## Next Steps

### Step 1: Add Your GitHub Credentials to .env

Open `.env` and replace these placeholders with your actual values:

```env
# Replace with your GitHub OAuth App credentials
GITHUB_CLIENT_ID=your_actual_client_id_here
GITHUB_CLIENT_SECRET=your_actual_client_secret_here
```

The encryption key and webhook secret have already been generated for you!

### Step 2: Apply Database Migration

When your database is running, apply the migration:

```bash
npx prisma migrate dev --name add_github_commit_fields
```

This will add the new GitHub fields to your database.

### Step 3: Restart Your Server

If the server is running, restart it to load the new routes:

```bash
npm run server
```

### Step 4: Test the GitHub OAuth Flow

1. **Start the server** (if not already running)
2. **Login to your platform** to get an access token
3. **Connect GitHub**:
   ```bash
   # Navigate to this URL in your browser (you must be logged in first)
   http://localhost:3000/api/auth/github
   ```
4. **Authorize on GitHub** - You'll be redirected to GitHub to authorize
5. **Get redirected back** - You'll return to `/github-connected?success=true`

### Step 5: Verify GitHub Connection

```bash
curl http://localhost:3000/api/auth/github/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Should return:
{
  "connected": true,
  "username": "your-github-username",
  "avatarUrl": "https://avatars.githubusercontent.com/..."
}
```

## New API Endpoints Available

### GitHub Authentication
- `GET /api/auth/github` - Start OAuth flow
- `GET /api/auth/github/callback` - OAuth callback
- `POST /api/auth/github/disconnect` - Disconnect GitHub
- `GET /api/auth/github/status` - Check connection status

### Repository Management
- `POST /api/projects/:id/github` - Link existing repo
- `POST /api/projects/:id/github/create` - Create new repo
- `GET /api/projects/:id/github` - Get repo info

### Task Git Operations
- `POST /api/tasks/:id/pr` - Create pull request
- `GET /api/tasks/:id/github` - Get task's GitHub info

## File Structure Created

```
src/
├── lib/
│   ├── encryption.ts              ✅ Token encryption
│   ├── github.ts                  ✅ GitHub API service
│   ├── github-factory.ts          ✅ Service factory
│   └── commit-message-generator.ts ✅ AI commit messages
│
├── routes/
│   ├── github-auth.routes.ts      ✅ OAuth routes
│   └── github.routes.ts           ✅ GitHub API routes
│
├── services/
│   └── github-integration.service.ts ✅ High-level operations
│
└── server.ts                      ✅ Updated with routes
```

## How to Use GitHub Integration

### 1. Link a Project to GitHub

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/github \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/username/repo"}'
```

### 2. Or Create a New Repo

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/github/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project","description":"Created by AI","private":true}'
```

### 3. Generate Code (Auto-commits to GitHub)

When you generate code with a task that has a GitHub repo linked, it will:
1. Create a branch: `task/{taskId}/{slug}`
2. Generate code with Claude
3. Save to E2B sandbox
4. Download files
5. Generate semantic commit message
6. Commit to GitHub
7. Return both sandbox URL and GitHub commit URL

### 4. Create Pull Request

```bash
curl -X POST http://localhost:3000/api/tasks/TASK_ID/pr \
  -H "Authorization: Bearer YOUR_TOKEN"

# Returns:
{
  "success": true,
  "prUrl": "https://github.com/username/repo/pull/1",
  "prNumber": 1
}
```

## Complete Workflow Example

```bash
# 1. Create a project
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Portfolio","description":"My portfolio website"}'

# 2. Create a GitHub repo for it
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/github/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"portfolio","private":false}'

# 3. Create a task
curl -X POST http://localhost:3000/api/projects/$PROJECT_ID/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Create hero section","priority":"high"}'

# 4. Generate code (will auto-commit to GitHub!)
curl -X POST http://localhost:3000/api/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt":"Create a hero section with purple gradient",
    "projectId":"'$PROJECT_ID'",
    "taskId":"'$TASK_ID'"
  }' \
  --no-buffer

# 5. Mark task as ready for review (auto-creates PR!)
curl -X PATCH http://localhost:3000/api/tasks/$TASK_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"review"}'

# 6. Merge PR on GitHub
# → Task automatically marked as "done" via webhook!
```

## Troubleshooting

### "GitHub not connected" error
- Make sure you've completed the OAuth flow at `/api/auth/github`
- Check that your GitHub OAuth app is configured correctly

### "Project not linked to GitHub repository"
- Link a repo first with `POST /api/projects/:id/github`
- Or create one with `POST /api/projects/:id/github/create`

### Encryption error
- Make sure `ENCRYPTION_KEY` is set in `.env`
- The key has been auto-generated for you

### Database migration fails
- Make sure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Run: `npx prisma migrate dev`

## Security Notes

- GitHub access tokens are encrypted at rest with AES-256-GCM
- OAuth state tokens expire after 10 minutes (CSRF protection)
- Webhook signatures are verified with HMAC-SHA256
- All sensitive data is stored encrypted

## What's Next

After this works, you can add:
- Webhook handlers to sync PR status back to tasks
- Automatic deployment triggers
- Branch protection rules
- Code review automation

See `PHASE3_ARCHITECTURE.md` for the complete technical architecture!

---

**All code is ready to go!** Just add your GitHub credentials and start the server.

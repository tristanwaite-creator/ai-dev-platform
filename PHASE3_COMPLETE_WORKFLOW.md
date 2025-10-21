# Phase 3: Complete End-to-End Workflow

This document shows the complete user journey with GitHub integration, from setup to production deployment.

## Workflow Overview

```
User Journey: From Idea to Production
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Setup
   └─▶ Connect GitHub Account

2. Create Project
   └─▶ Link/Create GitHub Repository

3. Define Tasks
   └─▶ Create Kanban Tasks

4. AI Generation (Automated)
   ├─▶ Create E2B Sandbox
   ├─▶ Create Git Branch
   ├─▶ Generate Code with Claude
   ├─▶ Write Files to Sandbox
   ├─▶ Download Files
   ├─▶ Generate Commit Message
   ├─▶ Commit to GitHub
   └─▶ Return Live Preview URL

5. Review & PR
   └─▶ Auto-create Pull Request

6. Webhook Sync
   └─▶ PR Merged → Task Completed

7. Production
   └─▶ Code Lives in GitHub Forever
```

---

## Step-by-Step Walkthrough

### Step 1: Initial Setup

**User registers and logs in:**

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dev@example.com",
    "password": "SecurePass123",
    "name": "Alex Developer"
  }'

# Response
{
  "user": { "id": "cm3x1y2z1", "email": "dev@example.com", "name": "Alex Developer" },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**User connects GitHub account:**

```
Browser: Navigate to http://localhost:3000/api/auth/github

Flow:
1. Redirect to GitHub OAuth
2. User authorizes app
3. GitHub redirects back with code
4. Server exchanges code for access token
5. Token encrypted and stored in database
6. User profile updated with GitHub info
7. Redirect to frontend with success
```

**Verify connection:**

```bash
curl http://localhost:3000/api/auth/github/status \
  -H "Authorization: Bearer {accessToken}"

# Response
{
  "connected": true,
  "username": "alexdev",
  "avatarUrl": "https://avatars.githubusercontent.com/u/12345"
}
```

---

### Step 2: Create Project & Link Repository

**Create project:**

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Portfolio Website",
    "description": "Personal portfolio with blog and contact form"
  }'

# Response
{
  "id": "cm3x1y2z2",
  "name": "Portfolio Website",
  "description": "Personal portfolio with blog and contact form",
  "userId": "cm3x1y2z1",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

**Option A: Link existing GitHub repository:**

```bash
curl -X POST http://localhost:3000/api/projects/cm3x1y2z2/github \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/alexdev/portfolio-website"
  }'

# Response
{
  "success": true,
  "project": {
    "id": "cm3x1y2z2",
    "githubRepoUrl": "https://github.com/alexdev/portfolio-website",
    "githubRepoOwner": "alexdev",
    "githubRepoName": "portfolio-website",
    "defaultBranch": "main"
  }
}
```

**Option B: Create new GitHub repository:**

```bash
curl -X POST http://localhost:3000/api/projects/cm3x1y2z2/github/create \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "portfolio-website",
    "description": "Personal portfolio with blog and contact form",
    "private": false
  }'

# Response
{
  "success": true,
  "project": {
    "id": "cm3x1y2z2",
    "githubRepoUrl": "https://github.com/alexdev/portfolio-website",
    "githubRepoOwner": "alexdev",
    "githubRepoName": "portfolio-website",
    "defaultBranch": "main"
  }
}
```

---

### Step 3: Create Task

```bash
curl -X POST http://localhost:3000/api/projects/cm3x1y2z2/tasks \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Create hero section with gradient background",
    "description": "Build a modern hero section with animated gradient (purple to pink), responsive layout, and CTA button",
    "priority": "high",
    "status": "todo"
  }'

# Response
{
  "id": "cm3x1y2z3",
  "title": "Create hero section with gradient background",
  "description": "Build a modern hero section with animated gradient...",
  "status": "todo",
  "priority": "high",
  "projectId": "cm3x1y2z2",
  "branchName": null,
  "prUrl": null,
  "prNumber": null
}
```

---

### Step 4: AI Generation (The Magic Happens!)

**User triggers generation:**

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a stunning hero section with purple-to-pink gradient background, smooth animations, centered content with heading, subheading, and CTA button. Make it responsive and modern.",
    "projectId": "cm3x1y2z2",
    "taskId": "cm3x1y2z3"
  }' \
  --no-buffer
```

**Server-Sent Events stream:**

```
event: status
data: {"message":"Creating E2B sandbox...","type":"info"}

event: status
data: {"message":"Sandbox created","type":"success","sandboxId":"abc123"}

event: status
data: {"message":"Creating GitHub branch...","type":"info"}

event: status
data: {"message":"Created branch: task/cm3x1y2z3/create-hero-section-with-gradient-background","type":"success"}

event: status
data: {"message":"Generating code with Claude...","type":"info"}

event: text
data: {"content":"I'll create a beautiful hero section for you..."}

event: tool
data: {"name":"Write","action":"start"}

event: tool
data: {"name":"Write","action":"complete","file":"index.html"}

event: tool
data: {"name":"Write","action":"start"}

event: tool
data: {"name":"Write","action":"complete","file":"style.css"}

event: status
data: {"message":"Files written to sandbox","type":"success"}

event: status
data: {"message":"Starting web server in sandbox...","type":"info"}

event: status
data: {"message":"Web server started","type":"success","url":"https://8000-abc123.e2b.app"}

event: status
data: {"message":"Downloading files from sandbox...","type":"info"}

event: status
data: {"message":"Generating commit message with Claude...","type":"info"}

event: status
data: {"message":"Committing to GitHub...","type":"info"}

event: status
data: {"message":"Code committed to GitHub","type":"success","commitUrl":"https://github.com/alexdev/portfolio-website/commit/def456","commitSha":"def456"}

event: complete
data: {
  "message":"Generation complete",
  "sandboxId":"abc123",
  "sandboxUrl":"https://8000-abc123.e2b.app",
  "branchName":"task/cm3x1y2z3/create-hero-section-with-gradient-background",
  "commitUrl":"https://github.com/alexdev/portfolio-website/commit/def456",
  "filesCreated":["index.html","style.css"]
}
```

**What happened behind the scenes:**

```
Detailed Backend Flow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. POST /api/generate received
   └─▶ Validate user authentication
   └─▶ Validate projectId and taskId
   └─▶ Create Generation record (status: "running")

2. E2B Sandbox Creation
   └─▶ e2bService.createSandbox()
   └─▶ Store sandboxId in memory + database
   └─▶ SSE: "Creating E2B sandbox..."

3. GitHub Branch Creation
   └─▶ Check if task.branchName exists
   └─▶ If not:
       ├─▶ Generate branch name: "task/{taskId}/{slug}"
       ├─▶ createGitHubService(userId)
       ├─▶ Decrypt user's GitHub token
       ├─▶ github.createBranch(owner, repo, branchName, "main")
       ├─▶ Update task.branchName in database
       └─▶ SSE: "Created branch: task/..."

4. Claude SDK Generation
   └─▶ Initialize Anthropic client
   └─▶ Stream messages from Claude
   └─▶ Process each message:
       ├─▶ text → SSE: text event
       ├─▶ tool_use (Write) → Write to E2B sandbox
       └─▶ tool_result → Track files created

5. File Synchronization
   └─▶ e2bService.listFiles(sandboxId, "/home/user")
   └─▶ For each file:
       ├─▶ e2bService.readFile(sandboxId, path)
       ├─▶ Store in files array
       └─▶ Skip node_modules, .git, etc.

6. Semantic Commit Message Generation
   └─▶ generateCommitMessage(files, taskDesc, prompt)
   └─▶ Anthropic API call with:
       ├─▶ Task description
       ├─▶ User prompt
       ├─▶ Files changed (with preview)
       └─▶ Format instructions
   └─▶ Claude returns:
       "feat(ui): add hero section with gradient

       - Implemented purple-to-pink gradient background
       - Added smooth fade-in animations
       - Created responsive layout with flexbox
       - Included CTA button with hover effects

       Generated by Claude AI"

7. GitHub Commit
   └─▶ github.createCommit(owner, repo, branchName, files, message)
   └─▶ GitHub API workflow:
       ├─▶ Get current branch SHA
       ├─▶ Create blobs for each file
       ├─▶ Create tree with all blobs
       ├─▶ Create commit with tree
       ├─▶ Update branch ref to new commit
       └─▶ Return commit object with SHA and URL

8. Update Database
   └─▶ Update Generation record:
       ├─▶ status = "completed"
       ├─▶ commitSha = "def456"
       ├─▶ commitUrl = "https://github.com/..."
       ├─▶ filesCreated = ["index.html", "style.css"]
       └─▶ completedAt = now()

9. SSE Complete Event
   └─▶ Send final event with all URLs
   └─▶ Close SSE connection
```

**View results:**

- **Live Preview:** https://8000-abc123.e2b.app (E2B sandbox, expires in 1 hour)
- **GitHub Commit:** https://github.com/alexdev/portfolio-website/commit/def456
- **GitHub Branch:** https://github.com/alexdev/portfolio-website/tree/task/cm3x1y2z3/create-hero-section-with-gradient-background

**Commit on GitHub looks like:**

```
Author: alexdev
Date: 2025-01-15 10:15:23

feat(ui): add hero section with gradient

- Implemented purple-to-pink gradient background
- Added smooth fade-in animations
- Created responsive layout with flexbox
- Included CTA button with hover effects

Generated by Claude AI

Files changed:
  index.html (new file, 145 lines)
  style.css (new file, 89 lines)
```

---

### Step 5: Review & Pull Request

**User marks task as ready for review:**

```bash
curl -X PATCH http://localhost:3000/api/tasks/cm3x1y2z3 \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "review"
  }'
```

**System automatically creates pull request:**

```
GitHub PR Created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title: Create hero section with gradient background

Body:
## Summary

Build a modern hero section with animated gradient (purple to pink),
responsive layout, and CTA button

## Changes

This pull request includes AI-generated code from 1 generation(s):

- Create a stunning hero section with purple-to-pink gradient... (2 files created)

## Files Changed

- index.html
- style.css

## Task Details

- **Task ID:** `cm3x1y2z3`
- **Status:** review
- **Priority:** high
- **Branch:** `task/cm3x1y2z3/create-hero-section-with-gradient-background`

---

🤖 **Generated by AI Development Platform**

Base: main
Head: task/cm3x1y2z3/create-hero-section-with-gradient-background
URL: https://github.com/alexdev/portfolio-website/pull/1
```

**Database updated:**

```bash
# Task record now has:
{
  "id": "cm3x1y2z3",
  "status": "review",
  "branchName": "task/cm3x1y2z3/create-hero-section-with-gradient-background",
  "prUrl": "https://github.com/alexdev/portfolio-website/pull/1",
  "prNumber": 1
}
```

---

### Step 6: Code Review & Merge

**Team member reviews PR on GitHub:**

```
GitHub UI:
- Views diff of changes
- Sees live preview link in PR description (E2B sandbox)
- Requests changes or approves
- Merges PR to main branch
```

**When PR is merged, GitHub sends webhook:**

```
POST http://localhost:3000/api/webhooks/github
Headers:
  X-GitHub-Event: pull_request
  X-Hub-Signature-256: sha256=...

Body:
{
  "action": "closed",
  "pull_request": {
    "number": 1,
    "merged": true,
    "merged_at": "2025-01-15T10:30:00Z"
  }
}
```

**Webhook handler processes event:**

```typescript
// Server receives webhook
async function handlePullRequestEvent(payload) {
  const { action, pull_request } = payload;

  // Find task by PR number
  const task = await db.task.findFirst({
    where: { prNumber: pull_request.number }
  });

  if (action === 'closed' && pull_request.merged) {
    // PR was merged - mark task as done
    await db.task.update({
      where: { id: task.id },
      data: {
        status: 'done',
        completedAt: new Date()
      }
    });

    console.log('✅ Task completed via PR merge');
  }
}
```

**Task automatically updated:**

```bash
curl http://localhost:3000/api/tasks/cm3x1y2z3 \
  -H "Authorization: Bearer {accessToken}"

# Response
{
  "id": "cm3x1y2z3",
  "status": "done",  // Automatically updated!
  "completedAt": "2025-01-15T10:30:00Z",
  "prUrl": "https://github.com/alexdev/portfolio-website/pull/1"
}
```

---

### Step 7: Production Deployment

**Code is now in main branch on GitHub:**

```
https://github.com/alexdev/portfolio-website/tree/main
  ├── index.html (from AI generation)
  ├── style.css (from AI generation)
  └── README.md (existing)
```

**Deploy to production:**

```bash
# Option 1: Vercel
vercel --prod

# Option 2: Netlify
netlify deploy --prod

# Option 3: GitHub Pages
# (Enable in repo settings)

# Option 4: Custom server
git clone https://github.com/alexdev/portfolio-website
cd portfolio-website
python3 -m http.server 8080
```

**Code lives forever:**
- ✅ Version controlled in GitHub
- ✅ Full commit history
- ✅ Semantic commit messages
- ✅ Pull request discussions preserved
- ✅ Can be cloned, forked, collaborated on
- ✅ Professional development workflow

---

## Multi-Task Workflow Example

**User creates multiple tasks:**

```
Task 1: Hero Section
Status: done (merged to main)
Branch: task/cm3x1y2z3/create-hero-section

Task 2: About Section
Status: in_progress
Branch: task/cm3x1y2z4/add-about-section
Commits: 3

Task 3: Contact Form
Status: in_progress
Branch: task/cm3x1y2z5/build-contact-form
Commits: 2

Task 4: Blog Page
Status: review
Branch: task/cm3x1y2z6/create-blog-page
PR: #2 (open)
```

**All tasks work independently:**

```
GitHub Branches:
  main
  ├── task/cm3x1y2z4/add-about-section (3 commits ahead)
  ├── task/cm3x1y2z5/build-contact-form (2 commits ahead)
  └── task/cm3x1y2z6/create-blog-page (1 commit ahead, PR open)

Each task has its own:
- Dedicated branch
- Independent commits
- Separate pull request
- Isolated changes
```

---

## Advanced Scenarios

### Scenario 1: Iterative Development

```
Generation 1:
Prompt: "Create hero section"
Result: Basic hero section
Commit: feat(ui): add hero section

Generation 2 (same task):
Prompt: "Add parallax scrolling effect to hero"
Result: Enhanced hero section
Commit: feat(ui): add parallax scrolling to hero

Generation 3 (same task):
Prompt: "Make hero mobile responsive"
Result: Mobile-optimized hero
Commit: feat(ui): improve hero mobile responsiveness

All commits on same branch: task/cm3x1y2z3/create-hero-section
Pull Request includes all 3 commits
```

### Scenario 2: Bug Fixes

```
Task: "Fix navbar z-index on mobile"
Status: in_progress → review → done

Flow:
1. Create task (status: todo)
2. Generate fix (status: in_progress)
   └─▶ Branch created: task/{id}/fix-navbar-z-index
   └─▶ Commit: "fix(ui): correct navbar z-index on mobile"
3. Mark as review
   └─▶ PR created automatically
4. PR merged
   └─▶ Webhook updates task to "done"
   └─▶ Fix live in production
```

### Scenario 3: Collaborative Development

```
Your Platform + Human Developer

Timeline:
1. AI generates initial code
   └─▶ Commit to branch via platform

2. Human developer pulls branch
   └─▶ git checkout task/cm3x1y2z3/feature-name
   └─▶ Makes manual improvements
   └─▶ git commit -m "refine AI-generated styles"
   └─▶ git push

3. AI generates more code (same task)
   └─▶ Platform pulls latest from GitHub first
   └─▶ Commits on top of human changes
   └─▶ Collaboration!

4. PR created with both AI and human commits
   └─▶ Full team collaboration
```

---

## Database State Examples

**After complete workflow:**

```typescript
// User record
{
  id: "cm3x1y2z1",
  email: "dev@example.com",
  githubId: "12345",
  githubUsername: "alexdev",
  githubAccessToken: "iv:authTag:encryptedData", // Encrypted!
  avatarUrl: "https://avatars.githubusercontent.com/..."
}

// Project record
{
  id: "cm3x1y2z2",
  name: "Portfolio Website",
  githubRepoUrl: "https://github.com/alexdev/portfolio-website",
  githubRepoOwner: "alexdev",
  githubRepoName: "portfolio-website",
  defaultBranch: "main",
  userId: "cm3x1y2z1"
}

// Task record
{
  id: "cm3x1y2z3",
  title: "Create hero section",
  status: "done",
  branchName: "task/cm3x1y2z3/create-hero-section",
  prUrl: "https://github.com/alexdev/portfolio-website/pull/1",
  prNumber: 1,
  completedAt: "2025-01-15T10:30:00Z",
  projectId: "cm3x1y2z2"
}

// Generation record
{
  id: "cm3x1y2z7",
  prompt: "Create stunning hero section...",
  status: "completed",
  sandboxId: "abc123",
  filesCreated: ["index.html", "style.css"],
  commitSha: "def456",
  commitUrl: "https://github.com/alexdev/portfolio-website/commit/def456",
  projectId: "cm3x1y2z2",
  taskId: "cm3x1y2z3",
  completedAt: "2025-01-15T10:15:45Z"
}
```

---

## Key Benefits

### 1. **Persistent Storage**
- Code lives in GitHub forever (not just 1-hour sandbox)
- Full version history
- Clone, fork, share anytime

### 2. **Professional Workflow**
- Semantic commits (feat, fix, refactor)
- Pull requests with descriptions
- Code review process
- Branch-per-feature strategy

### 3. **Team Collaboration**
- Multiple developers can work simultaneously
- AI + Human collaboration on same branch
- Standard git workflow everyone knows

### 4. **Production Ready**
- Direct path from generation to production
- Deploy from main branch
- CI/CD integration ready
- Professional commit messages for audit trail

### 5. **Seamless Integration**
- E2B sandboxes for instant preview
- GitHub for permanent storage
- Best of both worlds

---

## Summary

The complete workflow transforms the platform from a prototyping tool into a **production-grade development platform**:

```
Before (Phase 2):
User → Generate → E2B Sandbox (1 hour) → Lost

After (Phase 3):
User → Generate → E2B Sandbox (preview) → GitHub (forever) → Production
                   ↓
              Live preview URL
                   ↓
           Semantic commit to Git
                   ↓
          Auto PR on review status
                   ↓
           Merge → Deploy → Success! 🎉
```

Every AI-generated file is:
- ✅ Version controlled
- ✅ Professionally committed
- ✅ Pull request reviewed
- ✅ Deployed to production
- ✅ Collaborative
- ✅ Maintainable
- ✅ Professional

**This is how modern development should work!**

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered development platform with Notion/Trello-style Kanban board. Uses conversational AI for requirements gathering, generates code in E2B sandboxes, and automatically commits to GitHub after manual approval.

**Tech Stack**: Express + TypeScript + Prisma + PostgreSQL + Redis + E2B + Claude Agent SDK + Octokit

**Current Status**: Phase 1 Complete - Kanban board with automated workflows operational

**Completed Features**:
- ✅ GitHub OAuth (one-click login)
- ✅ Quick project creation (repo + task in one click)
- ✅ E2B sandbox integration with live previews
- ✅ Automatic GitHub commits with recursive file download
- ✅ Branch-per-task workflow
- ✅ Kanban board UI (Research → Building → Testing → Done)
- ✅ Auto-trigger code generation when moving to "Building"
- ✅ Auto-merge to main branch when moving to "Done"
- ✅ Sandbox regeneration for expired E2B instances
- ✅ AI-assisted research and note-taking system
- ✅ Conversational research sessions with Claude
- ✅ Auto-generating session titles and descriptions from conversation
- ✅ Document generation from research conversations
- ✅ Convert research sessions to tasks in kanban workflow
- ✅ **AI Research Assistant with Perplexity integration (Pages system)**
- ✅ **Notion-style floating AI assistant bubble**
- ✅ **Real-time web search via Perplexity Sonar models**
- ✅ **Hierarchical page/block structure for knowledge management**

## Commands

### Development
```bash
npm run server              # Start web server on http://localhost:3000
npm run start               # Alias for server
npm run generate "prompt"   # CLI mode (generates to local output/ directory)
npm run dev                 # Watch mode for CLI
npm run build               # Compile TypeScript to dist/
npm run test:e2b            # Test E2B API connection
```

### Database
```bash
npx prisma dev              # Start Prisma Postgres local dev database (ports 51213-51215)
                            # REQUIRED: Must be running before starting server
npx prisma migrate dev      # Create and apply new migration
npx prisma migrate reset    # Reset database (WARNING: deletes all data)
npx prisma studio           # Open Prisma Studio GUI at http://localhost:5555
npx prisma generate         # Regenerate Prisma Client types
npx prisma db push          # Push schema changes without migration (dev only)
```

### Setup
```bash
npm install
cp .env.example .env
# Configure .env with required API keys (see Environment Variables below)
npx prisma dev              # Start Prisma Postgres (keep this running)
# In a new terminal:
npx prisma migrate dev      # Initialize database
npm run server              # Start server
```

### Critical: Database Must Be Running
**The Prisma Postgres dev server MUST be running before starting the application server.**

```bash
# Terminal 1: Start database (keep this running)
npx prisma dev

# Terminal 2: Start server
npm run server
```

If database connection fails, ensure `npx prisma dev` is running. The database runs on ports 51213-51215.

## Architecture Overview

### Request Flow: HTML Generation

```
Frontend (public/app.js)
    ↓ POST /api/generate { prompt }
Express Server (src/server.ts)
    ↓ Create E2B sandbox
E2B Service (src/lib/e2b.ts)
    ↓ Query Claude SDK with temp directory
Claude Agent SDK
    ↓ Stream messages (text, tool_use, tool_result)
Server processes stream:
    - Writes files to temp directory
    - Syncs files to E2B sandbox (/home/user/)
    - Sends SSE updates to frontend
    ↓ Start web server in sandbox
E2B sandbox.commands.run('python3 -m http.server 8000', { background: true })
    ↓ Get public URL
sandbox.getHost(8000) → https://8000-{id}.e2b.app
    ↓ Send complete event
Frontend auto-opens sandbox URL in new tab
```

### Layer Architecture

**Frontend** (`public/`)
- Vanilla JS with Server-Sent Events client
- Manual SSE parsing (event type + data JSON)
- Auto-opens E2B sandbox URLs on completion

**API Layer** (`src/server.ts` + `src/routes/`)
- Express with TypeScript
- JWT authentication middleware
- REST endpoints for auth, projects, tasks
- SSE streaming for real-time generation updates

**Services** (`src/lib/` + `src/services/`)
- `e2b.ts` - Sandbox lifecycle (create, close, file ops, web server)
- `auth.ts` - JWT utilities + bcrypt password hashing
- `redis.ts` - Session cache + optional performance optimization
- `db.ts` - Prisma client singleton
- `research.service.ts` - AI-powered research sessions, auto-title/description generation, document synthesis
- `pages-agent.service.ts` - **AI Research Assistant with Perplexity integration, page management, tool orchestration**

**Database** (`prisma/schema.prisma`)
- PostgreSQL with Prisma ORM
- Models: User, Project, Task, Generation, Session, ResearchSession, ResearchDocument, ResearchMessage
- **Pages System**: Page, Block, AgentSession, AgentMessage, AgentAction
- Relations: User → Projects → Tasks/ResearchSessions/Pages → Generations/ResearchMessages/Documents/Blocks

## Core Concepts

### E2B Sandbox Lifecycle

**Creation** (`e2bService.createSandbox()`)
- Creates cloud sandbox via E2B API
- Stores in memory with 1-hour expiration
- Returns sandboxId + sandbox object

**File Operations**
- `writeFile(sandboxId, path, content)` - Upload file to sandbox
- `readFile(sandboxId, path)` - Download file from sandbox
- `listFiles(sandboxId, path)` - List directory contents

**Web Server** (`startWebServer()`)
```typescript
// Starts Python HTTP server in background
await sandbox.commands.run('cd /home/user && python3 -m http.server 8000', {
  background: true  // Process continues after command returns
})

// Get public URL
const host = sandbox.getHost(8000)  // Returns: 8000-{id}.e2b.app
const url = `https://${host}`
```

**Cleanup**
- Automatic: Every 5 minutes, removes expired sandboxes
- Manual: `e2bService.closeSandbox(sandboxId)`
- On exit: SIGINT/SIGTERM handlers clean up all sandboxes

### Authentication Flow

**JWT Token Pair**
- Access Token (15 min) - Used for API requests
- Refresh Token (7 days) - Used to get new access tokens

**Storage**
- Access tokens: Client-side only (memory/localStorage)
- Refresh tokens: Database + Redis cache
- Sessions: Database with IP + user agent tracking

**Middleware** (`src/middleware/auth.middleware.ts`)
```typescript
authenticate()           // Requires valid JWT, throws 401 if missing
optionalAuthenticate()   // Attaches user if token valid, continues otherwise
```

**Password Requirements**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Hashed with bcrypt (10 salt rounds)

### Database Schema Key Points

**User** - Authentication + GitHub integration
- `githubId`, `githubUsername`, `githubAccessToken` for OAuth
- Relations: projects[], sessions[]

**Project** - Development projects
- `githubRepoUrl`, `githubRepoId`, `defaultBranch` for git integration
- `sandboxId`, `sandboxStatus` for E2B tracking
- `settings` (JSON) for flexible configuration
- Relations: user, tasks[], generations[]

**Task** - Kanban board items
- `status`: todo|in_progress|review|done
- `priority`: low|medium|high
- `branchName`, `prUrl`, `prNumber` for GitHub integration
- `assignedAgent`, `agentStatus` for multi-agent system
- Relations: project, generations[]

**Generation** - AI code generation sessions
- `status`: pending|running|completed|failed
- `filesCreated` (array) - Tracks created files
- `sandboxId` - Links to E2B sandbox
- `agentModel`, `tokenUsage` - AI metrics
- Relations: project, task (optional)

**Session** - JWT session tracking
- Stores refresh tokens
- Tracks IP address + user agent
- Auto-expires via `expiresAt` timestamp

**ResearchSession** - Project-level research and note-taking
- `type`: research|notes|documentation
- `status`: active|archived|converted_to_task
- `title` - Auto-generates from first conversation exchange (after 2 messages)
- `description` - Auto-updates every 2 messages based on conversation context
- `documentTitle`, `documentContent`, `documentFormat` - Generated document
- `convertedTaskId` - Links to task if converted
- Relations: project, messages[], documents[]

**ResearchDocument** - Generated documents from research
- `title`, `content`, `format` (markdown|text)
- `exported`, `exportPath` - Export tracking
- Relations: session

**ResearchMessage** - Conversational messages
- `role`: user|assistant
- `content` - Message text
- Can link to either Task OR ResearchSession
- Relations: task?, session?

**Page** - Notion-style hierarchical pages
- `type`: document|folder
- `title`, `icon`, `order` - Display metadata
- `parentId` - Enables nesting (null = root level)
- Relations: project, createdBy user, children pages[], blocks[]

**Block** - Content blocks within pages
- `type`: text|heading|list|code|etc.
- `content` (JSON) - Block-specific data
- `order` - Position within page
- `parentBlockId` - Enables nested blocks
- Relations: page, parent block

**AgentSession** - AI assistant conversation sessions
- `type`: assistant (research agent)
- `status`: active|completed|archived
- `workspaceContext` (JSON) - Project/user context
- Relations: project, messages[], actions[]

**AgentMessage** - AI assistant conversation history
- `role`: user|assistant
- `content` - Message text
- `toolCalls` (JSON) - Tools used by agent
- Relations: session

**AgentAction** - Audit log of AI actions
- `actionType`: create_page|update_page|search_web|etc.
- `targetId`, `targetType` - What was modified
- `details` (JSON) - Action-specific data
- `status`: executed|failed
- Relations: session

### Server-Sent Events (SSE)

**Event Types** (sent by server):
- `status` - Progress updates (`{ message, type, sandboxId? }`)
- `text` - Claude's text responses (`{ content }`)
- `tool` - Tool usage (`{ name, action }`)
- `error` - Error messages (`{ message }`)
- `complete` - Generation finished (`{ message, sandboxId, sandboxUrl, filesCreated }`)

**Frontend Parsing** (`public/app.js:79-100`):
```javascript
// Manual parsing of SSE stream
buffer.split('\n').forEach(line => {
  if (line.startsWith('event:')) eventType = line.substring(6).trim()
  if (line.startsWith('data:')) {
    const data = JSON.parse(line.substring(5))
    handleSSEMessage(eventType, data)
  }
})
```

### Redis Integration

**Graceful Fallback** - App works with or without Redis
- If Redis available → use for caching
- If Redis down → continue without cache
- Database is always authoritative

**Session Manager** (`src/lib/redis.ts`)
```typescript
sessionManager.setSession(token, userId, ttl)    // Cache refresh token
sessionManager.getSession(token)                  // Retrieve user ID
sessionManager.deleteSession(token)               // Clear on logout
```

**Cache Utilities**
```typescript
cache.set(key, value, ttl)     // Store JSON
cache.get<T>(key)              // Retrieve typed value
cache.deletePattern(pattern)   // Bulk delete
```

**Sandbox Tracker**
```typescript
sandboxTracker.trackSandbox(projectId, sandboxId, ttl)
sandboxTracker.getSandbox(projectId)
```

## API Endpoints

### Authentication
```
POST   /api/auth/register              { email, password, name } (No auth)
POST   /api/auth/login                 { email, password } (No auth)
POST   /api/auth/logout                { refreshToken } (No auth)
POST   /api/auth/refresh               { refreshToken } (No auth)
GET    /api/auth/me                    (Auth required)

# GitHub OAuth
GET    /api/auth/github/login          Initiate OAuth flow (No auth)
GET    /api/auth/github/callback-anon  OAuth callback (No auth)
POST   /api/auth/github/disconnect     (Auth required)
GET    /api/auth/github/status         (Auth required)
```

### Projects (All require auth)
```
GET    /api/projects                      List user projects
POST   /api/projects                      { name, description?, settings? }
GET    /api/projects/:id                  Get project with tasks
PATCH  /api/projects/:id                  Update project
DELETE /api/projects/:id                  Delete (cascades tasks/generations)
```

### Tasks
```
GET    /api/projects/:id/tasks            List tasks
POST   /api/projects/:id/tasks            { title, description?, status?, priority? }
```

### E2B Sandboxes
```
POST   /api/projects/:id/sandbox          Create/activate sandbox
GET    /api/projects/:id/sandbox          Get sandbox info
DELETE /api/projects/:id/sandbox          Close sandbox
GET    /api/projects/:id/sandbox/files    List files
GET    /api/projects/:id/sandbox/stats    Get statistics
```

### GitHub Integration (No auth required for quick-start)
```
POST   /api/github/quick-start            { githubToken, projectName, repoName, description?, private? }
POST   /api/github/create-project-auth    { projectName, repoName, description?, private? } (Uses OAuth session)
POST   /api/github/create-task            { projectId, title, description? }
POST   /api/projects/:id/github           { repoUrl } (Auth required)
POST   /api/projects/:id/github/create    { name, description?, private? } (Auth required)
GET    /api/projects/:id/github           (Auth required)
POST   /api/tasks/:id/pr                  (Auth required)
GET    /api/tasks/:id/github              (Auth required)
```

### Generation
```
POST   /api/generate                      { prompt, projectId?, taskId?, autoCommit? } (SSE stream response)
```

### Research & Notes (All require auth)
```
# Research Sessions
GET    /api/projects/:projectId/research          List all sessions for project
POST   /api/projects/:projectId/research          Create new session { title, description?, type? }
                                                   Note: title/description auto-generate from conversation
GET    /api/research/:sessionId                   Get session with messages
PATCH  /api/research/:sessionId                   Update session { title?, description?, status? }
DELETE /api/research/:sessionId                   Delete session

# Chat & Messages
POST   /api/research/:sessionId/chat              Send message and get AI response { message }
                                                   Returns: { response, sessionTitle, sessionDescription }
                                                   Auto-generates title after first exchange (2 messages)
                                                   Auto-updates description every 2 messages
GET    /api/research/:sessionId/messages          Get all messages

# Documents
POST   /api/research/:sessionId/generate-document Generate document { title?, format? }
GET    /api/research/:sessionId/documents         Get all documents for session

# Workflow Integration
POST   /api/research/:sessionId/convert-to-task   Convert session to kanban task
```

### Pages & AI Assistant (All require auth)
```
# Pages Management
GET    /api/projects/:projectId/pages          List all pages in project
POST   /api/projects/:projectId/pages          Create new page { title, type?, icon?, parentId? }
GET    /api/pages/:pageId                      Get page with blocks
PATCH  /api/pages/:pageId                      Update page { title?, icon? }
DELETE /api/pages/:pageId                      Delete page (cascades blocks)
POST   /api/pages/:pageId/move                 Move page { parentId?, order? }

# Blocks Management
POST   /api/pages/:pageId/blocks               Create block { type, content, order? }
PATCH  /api/blocks/:blockId                    Update block { content?, order? }
DELETE /api/blocks/:blockId                    Delete block

# AI Assistant
POST   /api/projects/:projectId/agent/session Create AI agent session
POST   /api/agent/:sessionId/chat              Send message to agent { message }
                                                Returns: { message, messageId, toolCalls? }
GET    /api/agent/:sessionId/messages          Get conversation history
GET    /api/agent/:sessionId/actions           Get audit log of agent actions
PATCH  /api/agent/:sessionId                   Update session status { status }
```

### System
```
GET    /api/health                        Service status check
```

## Environment Variables

### Required
```env
# Claude API (https://console.anthropic.com/settings/keys)
ANTHROPIC_API_KEY=sk-ant-...

# E2B Sandbox API (https://e2b.dev/dashboard)
E2B_API_KEY=...

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-super-secret-change-in-production

# Perplexity API - For AI Research Assistant web search
PERPLEXITY_API_KEY=pplx-...
```

### Optional
```env
# Server
PORT=3000
NODE_ENV=development

# Redis (app works without it)
REDIS_URL=redis://localhost:6379
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
```

**Note**: GitHub OAuth callback URL in production must match exactly what's registered in your GitHub OAuth App settings.

## Important Notes

### ES Modules
- Project uses `"type": "module"` in package.json
- All imports must use ES6 syntax (`import`, not `require`)
- Import paths for compiled files need `.js` extension
- Use `fileURLToPath(import.meta.url)` for `__dirname`

### TypeScript Runtime
- Development: `tsx` runs `.ts` files directly
- Production: Compile with `tsc`, run from `dist/`
- No need for `ts-node` or manual compilation during dev

### Async Error Handling
All route handlers wrapped with `asyncHandler`:
```typescript
asyncHandler(async (req, res, next) => {
  // Any thrown error or rejected promise
  // automatically caught and sent to error middleware
})
```

### File Synchronization Pattern
```typescript
// When Claude creates file with Write tool:
1. SDK writes to temp directory
2. tool_use event received
3. File path added to queue
4. On tool_result success:
   - Read from temp directory
   - Check file exists (skip if not)
   - Write to E2B sandbox at /home/user/{path}
   - Send SSE status update
5. Final sync: Upload all remaining files
```

### Cache-Busting Frontend
`public/index.html` includes version parameter:
```html
<script src="app.js?v=2"></script>
```
Increment version number when updating `app.js` to force browser reload.

## Development Patterns

### Adding New API Route

1. Create route file in `src/routes/` (or add to existing)
2. Add authentication middleware if needed
3. Wrap handler with `asyncHandler`
4. Use Prisma for database operations
5. Return JSON response

Example:
```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { db } from '../lib/db.js';

const router = Router();

router.get('/items', authenticate, asyncHandler(async (req, res) => {
  const items = await db.item.findMany({
    where: { userId: req.user!.id }
  });
  res.json({ items });
}));

export default router;
```

### Modifying Database Schema

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe_change`
3. Prisma Client auto-regenerates with new types (output to `src/generated/prisma`)
4. Restart server

**Important**: Prisma client is generated to `src/generated/prisma` (not default `node_modules/.prisma/client`). This is configured in `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}
```

### Adding SSE Event Type

1. Send from server:
```typescript
const sendEvent = (event: string, data: any) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};
sendEvent('myevent', { foo: 'bar' });
```

2. Handle in frontend (`public/app.js`):
```javascript
function handleSSEMessage(event, data) {
  switch (event) {
    case 'myevent':
      console.log(data.foo); // 'bar'
      break;
  }
}
```

### Working with E2B Sandboxes

**Create and use:**
```typescript
const { sandboxId, sandbox } = await e2bService.createSandbox({
  projectId: 'project-id'
});

await e2bService.writeFile(sandboxId, '/home/user/index.html', '<html>...');
const content = await e2bService.readFile(sandboxId, '/home/user/index.html');
const url = await e2bService.startWebServer(sandboxId, '/home/user', 8000);

// Clean up when done
await e2bService.closeSandbox(sandboxId, 'project-id');
```

**Run code:**
```typescript
const result = await e2bService.runCode(sandboxId, `
  print("Hello from E2B!")
`);
```

### Debugging

**Check server logs** - All operations logged with emoji prefixes:
- 📦 E2B operations
- 🔐 Auth operations
- 💾 Database operations
- 🌐 HTTP requests
- ⚠️ Warnings
- ❌ Errors

**Prisma Studio** - Visual database editor:
```bash
npx prisma studio  # Opens http://localhost:5555
```

**Redis CLI** (if using Redis):
```bash
redis-cli
> KEYS session:*
> GET session:abc123
```

**E2B Sandbox Stats**:
```typescript
const stats = e2bService.getStats();
// { total: 3, active: 2, expired: 1 }
```

### Research Hub Auto-Generation

**How It Works** - Session titles and descriptions auto-generate from conversation:

1. **User clicks "New Session"** → Creates session immediately (no modal)
   - Initial title: "New Session - [timestamp]"
   - Initial description: "Will auto-generate as you chat..."

2. **After first exchange (2 messages total)** → Title auto-generates
   - Uses first 4 messages for context
   - Claude creates 2-6 word title
   - Example: "User Authentication Research"
   - Updates in database and returns to frontend

3. **Every 2 messages thereafter** → Description auto-updates
   - Uses last 6 messages for context
   - Claude creates 1-sentence summary (max 15 words)
   - Example: "Discussing OAuth 2.0 implementation for user login"
   - Updates in database and returns to frontend

**Implementation** (`src/services/research.service.ts`):
```typescript
// Private method called during chat()
private async generateTitle(sessionId: string): Promise<string>
private async generateDescription(sessionId: string): Promise<string>

// Chat method triggers auto-generation
async chat(options: ChatMessageOptions): Promise<ChatResponse> {
  // ... save messages ...

  const messageCount = session.messages.length + 2;

  // Auto-generate title from first message
  if (messageCount === 2) {
    const newTitle = await this.generateTitle(sessionId);
    await db.researchSession.update({ data: { title: newTitle } });
  }

  // Auto-generate description every 2 messages
  if (messageCount % 2 === 0) {
    const newDescription = await this.generateDescription(sessionId);
    await db.researchSession.update({ data: { description: newDescription } });
  }
}
```

**Frontend Updates** (`public/research.js`):
- Title updates in header and sidebar automatically
- Description updates in sidebar with italic styling
- Real-time updates via API response

### AI Research Assistant (Pages System)

**Architecture** (`src/services/pages-agent.service.ts`):

The AI Research Assistant is a specialized Claude agent with real-time web search capabilities via Perplexity AI. It manages a hierarchical knowledge base using a page/block structure similar to Notion.

**Core Capabilities:**
1. **Web Search** - Real-time internet search via Perplexity Sonar models
2. **Page Management** - Create, read, update, organize pages and folders
3. **Intelligent Research** - Multi-source synthesis, citation management
4. **Silent Content Writing** - Writes content directly to pages (not in chat)
5. **Permission Protocol** - Always asks before modifying workspace

**Tool Orchestration Pattern:**

```typescript
// Agent loop handles tool use
while (response.stop_reason === 'tool_use') {
  const toolUses = response.content.filter(block => block.type === 'tool_use');

  for (const toolUse of toolUses) {
    const result = await this.executeTool(
      toolUse.name,
      toolUse.input,
      sessionId,
      context
    );
    toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
  }

  // Continue conversation with tool results
  response = await this.anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    messages: conversationHistory,
    tools
  });
}
```

**Available Tools:**

1. **search_web** - Perplexity AI search
   - Models: `sonar-pro` (research), `sonar` (news), `sonar-reasoning` (analysis)
   - Returns: answer, citations, sources
   - Use: Any research requiring current information

2. **list_pages** - Browse workspace structure
   - Input: `parentId?` (optional folder ID)
   - Returns: Array of pages with metadata
   - Use: Explore workspace, find existing pages

3. **read_page** - Read page content
   - Input: `pageId`
   - Returns: Title, content, metadata
   - Use: Analyze existing research before creating new content

4. **create_page** - Create new page
   - Input: `title`, `content?`, `parentId?`
   - Returns: Page ID and success status
   - **Requires user permission first**

5. **update_page** - Modify existing page
   - Input: `pageId`, `title?`, `content?`
   - Returns: Success status
   - **Requires user permission first**

6. **search_pages** - Search within workspace
   - Input: `query`
   - Returns: Matching pages with previews
   - Use: Find related research, avoid duplication

7. **create_folder** - Organize pages
   - Input: `title`, `parentId?`
   - Returns: Folder ID
   - **Requires user permission first**

**System Prompt Strategy (Claude SDK Best Practices):**

```typescript
const systemPrompt = `You are an advanced AI research assistant...

## Operating Guidelines

### 1. Research Strategy (Use Extended Thinking)
- Break down complex questions into sub-topics
- Search strategically with multiple targeted queries
- Synthesize findings from multiple sources
- Cite sources in research findings
- Think step-by-step for multi-layered questions

### 2. Content Writing Rules (CRITICAL)
- ✅ DO: Write full content directly to pages
- ❌ DO NOT: Describe or preview content in chat
- ✅ DO: Simply confirm: "I've created the page"
- The user reads content by opening the page

### 3. Permission Protocol
- Always ask before create_page, update_page, create_folder
- Read-only tools (list_pages, read_page, search_web) don't need permission

### 4. Deep Research Mode
- Use multiple search queries for comprehensive coverage
- Cross-reference information from different sources
- Identify knowledge gaps and propose follow-up research
- Create hierarchical page structures for complex topics
`;
```

**Frontend Integration** (`public/components/ai-assistant-bubble.js`):

- **Floating Bubble UI**: Notion-style gradient bubble in bottom-right corner
- **Chat Panel**: Slides up on click with welcome message and quick actions
- **Event Listeners**: Auto-resize textarea, typing indicators, message handling
- **API Integration**: Uses centralized `api.js` client for authentication

**Usage Pattern:**

```javascript
// User clicks AI Assistant bubble (✨)
// 1. Initialize session
POST /api/projects/:projectId/agent/session
→ Returns sessionId

// 2. Send research request
POST /api/agent/:sessionId/chat
Body: { message: "Research quantum computing and create a guide" }

// Agent workflow:
// - Searches web via Perplexity (multiple queries)
// - Synthesizes findings
// - Asks permission: "Shall I create a comprehensive guide?"
// - User confirms
// - Creates page with full content
// - Returns: "I've created the 'Quantum Computing Guide' page"

// 3. User opens page to see research results
```

**Key Implementation Details:**

- **Model**: `claude-sonnet-4-5-20250929` with extended thinking
- **Max Tokens**: 4096 per response
- **Conversation History**: Last 20 messages for context
- **Tool Results**: Logged to `AgentAction` table for audit trail
- **Error Handling**: Graceful degradation if Perplexity API fails

## Common Tasks

### Add New Prisma Model

1. Edit `prisma/schema.prisma`:
```prisma
model MyModel {
  id        String   @id @default(cuid())
  name      String
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@index([userId])
}

// Add to User model:
model User {
  // ... existing fields
  myModels MyModel[]
}
```

2. Create migration:
```bash
npx prisma migrate dev --name add_my_model
```

3. Use in code:
```typescript
const item = await db.myModel.create({
  data: { name: 'Test', userId: req.user!.id }
});
```

### Test Authentication Locally

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123","name":"Test User"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123"}'

# Use access token
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```

### Generate HTML Project via API

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a landing page with purple gradient background"}' \
  --no-buffer
```

## Project Status & Roadmap

**Phase 1 (Weeks 1-2) ✅ COMPLETE**
- Database schema (User, Project, Task, Generation, Session)
- JWT authentication system
- API routes (auth + projects + tasks)
- Redis caching with graceful fallback
- Error handling middleware

**Phase 2 (Weeks 3-4) ✅ COMPLETE**
- E2B sandbox integration
- Live web server in sandboxes
- File synchronization (local → E2B)
- Public sandbox URLs
- SSE streaming to frontend
- Research Hub with auto-generating titles/descriptions
- Conversational AI for requirements gathering
- Document generation and task conversion

**Phase 3 (Git Automation) - PLANNED**
- Auto-commit generated code
- Branch creation per task
- Pull request automation
- Semantic commit messages

**Phase 4 (Multi-Agent) - PLANNED**
- Planning agent
- Research agent
- Development agent
- Testing agent
- LangGraph orchestration

**Phase 5 (Notion-like Research Hub) - IN PLANNING**
- Block-based page editor (BlockNote or Editor.js)
- Hierarchical pages with drag-and-drop
- Rich text formatting with inline commands
- AI assistant as optional sidebar/inline tool
- Page templates and export functionality
- See NOTION_ARCHITECTURE.md for complete design

**Phase 6 (Frontend) - PLANNED**
- Next.js migration
- Enhanced Kanban board UI
- Monaco code editor
- Real-time collaboration
- Team workspaces and permissions

See ROADMAP.md for complete 24-week implementation plan.

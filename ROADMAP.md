# 📅 Implementation Roadmap

**AI-Powered Development Platform**: Notion/Trello-style Kanban board with conversational AI research, automated code generation, and GitHub integration.

---

## 🎯 Vision

Build a project management tool where:
1. **Research** tasks have AI chat for requirements gathering
2. **Building** happens automatically from research summaries
3. **Testing** provides preview links for approval
4. **Done** shows committed code in GitHub

---

## ✅ Phase 0: Foundation (COMPLETE)

**Status**: ✅ Completed

What we've built:
- ✅ PostgreSQL database with Prisma ORM
- ✅ JWT authentication system
- ✅ GitHub OAuth integration
- ✅ E2B sandbox integration
- ✅ Live sandbox previews
- ✅ Automatic GitHub commits
- ✅ Branch creation per task
- ✅ REST API with SSE streaming
- ✅ Redis caching (optional)

**Current Capabilities**:
- User can create GitHub projects
- AI generates code from prompts
- Code appears in E2B sandbox (live preview)
- Code commits to GitHub automatically

---

## Phase 1: Kanban Board Foundation (Week 1)

**Goal**: Build the visual Kanban board interface

### Tasks

- [ ] **Database Schema Updates**
  - [ ] Add `column` field to Task model (`research | building | testing | done`)
  - [ ] Add `order` field for positioning within columns
  - [ ] Add `researchSummary` field (JSON)
  - [ ] Add `buildStatus` field (`pending | generating | ready | failed`)
  - [ ] Add `approved` boolean field
  - [ ] Add `rejectionReason` field
  - [ ] Create migration and apply to database

- [ ] **API Endpoints - Board Management**
  - [ ] `GET /api/projects/:id/board` - Get all tasks grouped by column
  - [ ] `PATCH /api/tasks/:id/move` - Move task to different column
  - [ ] `PATCH /api/tasks/:id/reorder` - Reorder within column
  - [ ] `POST /api/projects/:id/tasks` - Create new task (defaults to Research column)

- [ ] **Basic Kanban UI**
  - [ ] Create board page at `/projects/:id/board`
  - [ ] 4 columns: Research | Building | Testing | Done
  - [ ] Task cards with title and status
  - [ ] Click card to interact (different action per column)
  - [ ] "New Task" button in Research column
  - [ ] Simple CSS styling (no drag-drop yet)

**✅ Deliverable**: Working Kanban board where users can create tasks and see them in columns

---

## Phase 2: Research Chat (Week 2)

**Goal**: AI-powered conversational requirements gathering

### Tasks

- [ ] **Database Schema - Research Chat**
  - [ ] Create `ResearchMessage` table
    - `id`, `taskId`, `role` (user/assistant), `content`, `createdAt`
  - [ ] Add indexes for fast message retrieval
  - [ ] Create migration

- [ ] **API Endpoints - Research Chat**
  - [ ] `GET /api/tasks/:id/research` - Get chat history
  - [ ] `POST /api/tasks/:id/research/message` - Send message, stream AI response (SSE)
  - [ ] `POST /api/tasks/:id/research/finalize` - Generate summary and move to Building
  - [ ] `DELETE /api/tasks/:id/research` - Clear chat history

- [ ] **Research Chat Modal**
  - [ ] Modal opens when clicking task card in Research column
  - [ ] Message list (user messages vs AI messages)
  - [ ] Input box at bottom
  - [ ] Send button + Enter to send
  - [ ] "Finalize Research" button at top
  - [ ] Scrollable message history
  - [ ] Typing indicator when AI is responding

- [ ] **AI Research Agent**
  - [ ] Helpful starter questions template
  - [ ] Conversational context tracking
  - [ ] Clarifying questions when requirements unclear
  - [ ] Generates structured summary on finalize

- [ ] **Research Summary Generation**
  - [ ] Analyze entire chat conversation
  - [ ] Extract requirements list
  - [ ] Suggest tech stack
  - [ ] List files to create
  - [ ] Identify constraints
  - [ ] Save summary as JSON to task
  - [ ] Auto-move task to Building column

**✅ Deliverable**: Click task → chat with AI → finalize → task moves to Building with summary

### Example Research Summary Format

```json
{
  "feature": "User Authentication System",
  "requirements": [
    "Email/password authentication",
    "Google OAuth integration",
    "Password requirements: min 8 chars, 1 uppercase, 1 number",
    "Optional 2FA with TOTP"
  ],
  "techStack": ["React", "Node.js", "JWT", "Passport.js"],
  "files": [
    "auth.service.js - Authentication logic",
    "auth.routes.js - API endpoints",
    "LoginForm.jsx - Frontend login component"
  ],
  "constraints": [
    "Must work with existing PostgreSQL database",
    "Session timeout: 24 hours"
  ]
}
```

---

## Phase 3: Automated Building (Week 3)

**Goal**: Automatically generate code from research summaries

### Tasks

- [ ] **Auto-Trigger Generation**
  - [ ] When task moves to Building column
  - [ ] Convert research summary to detailed prompt
  - [ ] Call existing `/api/generate` endpoint
  - [ ] Set `buildStatus` to `generating`
  - [ ] Store generation ID on task

- [ ] **Build Status Polling**
  - [ ] Frontend polls `/api/tasks/:id/status` every 2s
  - [ ] Show "Generating code..." spinner
  - [ ] Display real-time progress updates
  - [ ] Show files created count

- [ ] **Build Completion Handling**
  - [ ] On generation complete:
    - Save E2B sandbox URL to task
    - Set `buildStatus` to `ready`
    - Auto-move task to Testing column
  - [ ] On generation failure:
    - Set `buildStatus` to `failed`
    - Show error message
    - Keep in Building column

- [ ] **Building Column UI**
  - [ ] Show generation progress bar
  - [ ] Display current step (e.g., "Creating index.html...")
  - [ ] Show preview link when ready
  - [ ] "Retry" button if failed

**✅ Deliverable**: Task automatically builds code when moved to Building, shows progress, moves to Testing when done

---

## Phase 4: Testing & Approval (Week 4)

**Goal**: Manual testing and approval workflow before GitHub commit

### Tasks

- [ ] **Testing Column UI**
  - [ ] Display E2B sandbox preview link prominently
  - [ ] "Open Preview" button
  - [ ] "Approve" button (green)
  - [ ] "Reject" button (red)
  - [ ] Show list of files created

- [ ] **API Endpoints - Approval**
  - [ ] `POST /api/tasks/:id/approve` - Approve and commit to GitHub
  - [ ] `POST /api/tasks/:id/reject` - Reject with feedback notes
  - [ ] Both endpoints should update task state

- [ ] **Approval Flow**
  - [ ] Click "Approve":
    - Trigger GitHub commit (use existing integration)
    - Set `approved` = true
    - Move task to Done column
    - Show success message with GitHub commit link

- [ ] **Rejection Flow**
  - [ ] Click "Reject":
    - Open modal for rejection notes
    - Save notes to `rejectionReason`
    - Move task back to Building column
    - On next build, include rejection notes in prompt

- [ ] **Done Column UI**
  - [ ] Show GitHub commit link
  - [ ] Show GitHub branch name
  - [ ] Display creation date
  - [ ] "View Code" button → GitHub
  - [ ] "View Preview" button → E2B (if still active)

**✅ Deliverable**: User can test in sandbox → approve → code commits to GitHub

---

## Phase 5: Polish & UX Improvements (Week 5)

**Goal**: Make the experience delightful

### Tasks

- [ ] **Drag-and-Drop**
  - [ ] Install `@dnd-kit/core` and `@dnd-kit/sortable`
  - [ ] Enable dragging cards between columns
  - [ ] Reorder cards within columns
  - [ ] Smooth animations

- [ ] **Research Chat Improvements**
  - [ ] Add template starter questions
  - [ ] Markdown rendering in messages
  - [ ] Code syntax highlighting in chat
  - [ ] "Edit last message" functionality
  - [ ] Export chat as Markdown

- [ ] **Research Summary Preview**
  - [ ] Before finalizing, show AI-generated summary
  - [ ] Allow user to edit summary
  - [ ] Confirm before moving to Building

- [ ] **Better Visual Design**
  - [ ] Tailwind CSS or shadcn/ui components
  - [ ] Card animations (hover, drag)
  - [ ] Loading states and skeletons
  - [ ] Empty state illustrations
  - [ ] Color-coded status badges

- [ ] **Task Details Panel**
  - [ ] Click task → slide-out panel
  - [ ] Show full research summary
  - [ ] Show all files created
  - [ ] Show generation logs
  - [ ] Show commit history

- [ ] **Keyboard Shortcuts**
  - [ ] `n` - New task
  - [ ] `Enter` - Open task
  - [ ] `Esc` - Close modal
  - [ ] `Ctrl+Enter` - Send chat message

**✅ Deliverable**: Polished, fast, delightful user experience

---

## Phase 6: Collaboration Features (Week 6-7)

**Goal**: Multiple users working on same project

### Tasks

- [ ] **User Roles & Permissions**
  - [ ] Project owner
  - [ ] Project members
  - [ ] Read-only viewers
  - [ ] Invite system via email

- [ ] **Real-Time Collaboration**
  - [ ] WebSocket connection
  - [ ] Live cursor positions
  - [ ] "User X is viewing task Y" indicators
  - [ ] Optimistic UI updates

- [ ] **Activity Feed**
  - [ ] "User X moved task Y to Building"
  - [ ] "User X finalized research for task Y"
  - [ ] "Task Y approved and committed"
  - [ ] Filter by user, date, task

- [ ] **Comments on Tasks**
  - [ ] Add comments to any task
  - [ ] @mention other users
  - [ ] Thread replies
  - [ ] Markdown support

**✅ Deliverable**: Multiple users can collaborate on same project in real-time

---

## Phase 7: Advanced Agent System (Week 8-10)

**Goal**: Introduce specialized agents for better quality

### Tasks

- [ ] **Planning Agent** (before Research)
  - [ ] Analyzes user's initial request
  - [ ] Suggests task breakdown
  - [ ] Creates multiple subtasks automatically
  - [ ] Estimates complexity

- [ ] **Research Agent Enhancement**
  - [ ] Web search integration
  - [ ] Documentation lookup
  - [ ] Best practices suggestions
  - [ ] Similar project examples

- [ ] **Development Agent** (current generation)
  - [ ] Already working
  - [ ] Enhance with better prompts from research

- [ ] **Testing Agent**
  - [ ] Auto-run tests in sandbox
  - [ ] HTML validation
  - [ ] Accessibility checks
  - [ ] Performance audit
  - [ ] Report in Testing column

- [ ] **LangGraph Orchestration**
  - [ ] Define agent workflow graph
  - [ ] Conditional routing (simple → fast path, complex → thorough path)
  - [ ] State management across agents
  - [ ] Error recovery and retry logic

**✅ Deliverable**: Higher quality code with automated testing and research

---

## Phase 8: Production Features (Week 11-12)

**Goal**: Production-ready platform

### Tasks

- [ ] **Deployment Automation**
  - [ ] Deploy to Vercel on approval
  - [ ] Deploy to Netlify
  - [ ] Custom domain setup
  - [ ] Preview deployments

- [ ] **Search & Filters**
  - [ ] Search tasks by title
  - [ ] Filter by column
  - [ ] Filter by date range
  - [ ] Filter by assigned user

- [ ] **Templates**
  - [ ] Save research chats as templates
  - [ ] Pre-built task templates
  - [ ] Project templates (e.g., "Next.js starter", "Express API")

- [ ] **Analytics Dashboard**
  - [ ] Tasks created per day
  - [ ] Average time in each column
  - [ ] Success rate (approved vs rejected)
  - [ ] Most active users

- [ ] **Billing Integration**
  - [ ] Stripe integration
  - [ ] Usage-based pricing (per generation)
  - [ ] Team pricing tiers
  - [ ] Usage dashboard

**✅ Deliverable**: Feature-complete, production-ready SaaS platform

---

## 🚀 Immediate Next Steps

### This Week: Start Phase 1

**Day 1-2: Database Migration**
```bash
# Update prisma/schema.prisma
# Add column, order, researchSummary, buildStatus, approved, rejectionReason

npx prisma migrate dev --name add_kanban_fields
```

**Day 3-4: API Endpoints**
- Build board view endpoint
- Build move task endpoint
- Test with Postman/curl

**Day 5-7: Kanban UI**
- Create board page
- 4 columns layout
- Task cards
- Basic styling

**Success Criteria**: Can create task, see it in Research column, manually move between columns

---

## 📊 Success Metrics

Track throughout development:

### User Engagement
- [ ] Tasks created per user per week
- [ ] Research chats completed
- [ ] Code generations approved vs rejected
- [ ] Average time in each column

### Platform Performance
- [ ] API response time (<200ms)
- [ ] E2B sandbox creation time (<5s)
- [ ] Code generation success rate (>90%)
- [ ] System uptime (>99.9%)

### Business Metrics
- [ ] Daily Active Users (DAU)
- [ ] Weekly Active Users (WAU)
- [ ] User retention (7-day, 30-day)
- [ ] Conversion rate (free → paid)

---

## 🎯 Key Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Foundation Complete | Week 0 | ✅ Done |
| Kanban Board Working | Week 1 | 🔄 Next |
| Research Chat Live | Week 2 | ⚪ Planned |
| Auto-Build Working | Week 3 | ⚪ Planned |
| Approval Workflow | Week 4 | ⚪ Planned |
| Polished UX | Week 5 | ⚪ Planned |
| Collaboration | Week 7 | ⚪ Planned |
| Multi-Agent System | Week 10 | ⚪ Planned |
| Production Launch | Week 12 | ⚪ Planned |

---

## 💡 Design Principles

1. **Simplicity First**: Start with the simplest thing that works
2. **User in Control**: Always require human approval before committing
3. **Fast Feedback**: Show progress at every step
4. **Fail Gracefully**: Clear error messages, easy recovery
5. **Conversational UX**: Talk to AI like a teammate
6. **Visual Clarity**: Always know what's happening and why

---

## 🔮 Future Ideas (Backlog)

Cool features to consider later:

- **Voice Input**: Speak your research requirements
- **Mobile App**: iOS/Android native apps
- **VS Code Extension**: Integrate directly into editor
- **Slack Integration**: Updates in Slack channels
- **API Webhooks**: Trigger external workflows
- **Custom Agents**: Users can create their own specialized agents
- **Agent Marketplace**: Share and sell custom agents
- **Code Review Agent**: Automatically review PRs
- **Documentation Agent**: Auto-generate docs from code

---

**Last Updated**: 2025-10-17
**Current Phase**: Phase 1 - Kanban Board Foundation
**Next Milestone**: Basic Kanban board with 4 columns
**Current Status**: ✅ Foundation complete, starting Kanban board

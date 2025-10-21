# Notion-like Research Hub Architecture

## Overview
Transform the research phase into a Notion-like note-taking and documentation platform with optional AI assistance.

---

## Database Schema Changes

### New Models

#### Page Model (replaces ResearchSession)
```prisma
model Page {
  id            String    @id @default(cuid())

  // Content
  title         String    @default("Untitled")
  icon          String?   // Emoji or icon identifier
  coverImage    String?   // URL to cover image

  // Hierarchy
  parentId      String?   // For nested pages
  parent        Page?     @relation("PageHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children      Page[]    @relation("PageHierarchy")

  // Metadata
  isFavorite    Boolean   @default(false)
  isArchived    Boolean   @default(false)
  isTemplate    Boolean   @default(false)

  // Ordering
  order         Int       @default(0)

  // Project context
  projectId     String
  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Creator
  createdById   String
  createdBy     User      @relation("PageCreator", fields: [createdById], references: [id], onDelete: Cascade)

  // Last editor (for collaboration)
  lastEditedById String?
  lastEditedBy   User?    @relation("PageEditor", fields: [lastEditedById], references: [id])

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  blocks        Block[]
  aiSessions    AISession[]

  @@index([projectId])
  @@index([parentId])
  @@index([createdById])
  @@index([order])
}
```

#### Block Model (content units)
```prisma
model Block {
  id            String    @id @default(cuid())

  // Block type
  type          String    // text, heading_1, heading_2, heading_3, bullet_list, numbered_list,
                          // todo_list, code, quote, callout, divider, image, table, etc.

  // Content
  content       Json      // Flexible JSON structure for different block types
                          // Example for text: { "text": "Hello world", "formatting": [...] }
                          // Example for heading: { "text": "My Heading", "level": 1 }
                          // Example for image: { "url": "...", "caption": "..." }

  // Styling
  properties    Json?     // Additional properties (color, background, alignment, etc.)

  // Hierarchy (for nested blocks like indented lists)
  parentBlockId String?
  parentBlock   Block?    @relation("BlockHierarchy", fields: [parentBlockId], references: [id], onDelete: Cascade)
  children      Block[]   @relation("BlockHierarchy")

  // Ordering
  order         Int       @default(0)

  // Page context
  pageId        String
  page          Page      @relation(fields: [pageId], references: [id], onDelete: Cascade)

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([pageId])
  @@index([parentBlockId])
  @@index([order])
}
```

#### AISession Model (optional AI assistance)
```prisma
model AISession {
  id            String    @id @default(cuid())

  // Context
  pageId        String?   // Can be page-level
  page          Page?     @relation(fields: [pageId], references: [id], onDelete: Cascade)

  blockId       String?   // Or block-level (inline AI)

  // Session type
  type          String    @default("assistant") // assistant, brainstorm, edit, summarize, etc.

  // Status
  status        String    @default("active") // active, completed, archived

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  messages      AIMessage[]

  @@index([pageId])
  @@index([blockId])
}
```

#### AIMessage Model (AI conversations)
```prisma
model AIMessage {
  id            String    @id @default(cuid())

  role          String    // user, assistant
  content       String    @db.Text

  // Context
  sessionId     String
  session       AISession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  // Timestamps
  createdAt     DateTime  @default(now())

  @@index([sessionId])
}
```

### Modified Models

#### User Model - Add relations
```prisma
model User {
  // ... existing fields ...

  // New relations
  createdPages  Page[]    @relation("PageCreator")
  editedPages   Page[]    @relation("PageEditor")
}
```

#### Project Model - Add relation
```prisma
model Project {
  // ... existing fields ...

  // Replace researchSessions with pages
  pages         Page[]
}
```

---

## Frontend Architecture

### Technology Stack Options

#### Option 1: Rich Text Editor Libraries
- **Tiptap** (recommended) - Headless, extensible, Vue/React/vanilla
- **ProseMirror** - Lower level, more control
- **Slate.js** - React-focused
- **Quill** - Simple, established

#### Option 2: Block-Based Editors
- **Editor.js** - Block-styled editor (closer to Notion)
- **BlockNote** - Notion-like block editor built on ProseMirror

**Recommendation**: Start with **Editor.js** or **BlockNote** for quickest Notion-like experience.

### UI Structure

```
┌─────────────────────────────────────────────────────────┐
│  Top Navigation Bar                                      │
│  [← Back] [Project Name]                      [Avatar]   │
├──────────────┬──────────────────────────────────────────┤
│              │  Page Header                              │
│  Sidebar     │  [Icon] [Cover Image Area]               │
│              │  [Page Title - Untitled]                  │
│  📁 Pages    ├──────────────────────────────────────────┤
│  ├─ Getting  │                                           │
│  │  Started  │  Content Area (Blocks)                   │
│  ├─ 📝 Notes │                                           │
│  │  ├─ Sub1  │  ┌─ Block 1 (Text)                      │
│  │  └─ Sub2  │  ├─ Block 2 (Heading)                   │
│  ├─ 🏠 Home   │  ├─ Block 3 (List)                      │
│  └─ 📋 Tasks  │  └─ [+ Add block] [🤖 AI Assistant]     │
│              │                                           │
│  + Add page  │                                           │
│              │                                           │
│  🤖 AI       │                                           │
│  Assistant   │                                           │
│  (Optional)  │                                           │
└──────────────┴──────────────────────────────────────────┘
```

### Key Features

1. **Hierarchical Pages**
   - Drag and drop to reorder
   - Nest pages under other pages
   - Favorites section
   - Recently viewed

2. **Block-Based Content**
   - Each line is a block
   - Type `/` for block menu
   - Drag to reorder
   - Nested blocks (indentation)

3. **Rich Text Formatting**
   - Bold, italic, underline
   - Code, links
   - Text colors, backgrounds
   - Inline code

4. **AI Assistant (Optional)**
   - Inline: Type `/ai` or click AI button
   - Sidebar: Toggle AI panel
   - Commands: "Summarize", "Expand", "Improve writing", etc.

5. **Content Blocks**
   - Text
   - Headings (H1, H2, H3)
   - Lists (bullet, numbered, todo)
   - Code blocks
   - Quotes
   - Callouts
   - Dividers
   - Images (future)
   - Tables (future)

---

## API Endpoints

### Pages

```
GET    /api/projects/:projectId/pages              # List all pages
POST   /api/projects/:projectId/pages              # Create page
GET    /api/pages/:pageId                          # Get page with blocks
PATCH  /api/pages/:pageId                          # Update page metadata
DELETE /api/pages/:pageId                          # Delete page
POST   /api/pages/:pageId/move                     # Move to different parent
PATCH  /api/pages/:pageId/reorder                  # Change order
POST   /api/pages/:pageId/duplicate                # Duplicate page
POST   /api/pages/:pageId/convert-to-task          # Convert to kanban task
```

### Blocks

```
GET    /api/pages/:pageId/blocks                   # Get all blocks for page
POST   /api/pages/:pageId/blocks                   # Create block
PATCH  /api/blocks/:blockId                        # Update block
DELETE /api/blocks/:blockId                        # Delete block
POST   /api/blocks/:blockId/move                   # Move block
PATCH  /api/blocks/bulk-reorder                    # Reorder multiple blocks
```

### AI Assistant

```
POST   /api/pages/:pageId/ai/start                 # Start AI session
POST   /api/ai/sessions/:sessionId/chat            # Send message
GET    /api/ai/sessions/:sessionId                 # Get session
POST   /api/ai/sessions/:sessionId/apply           # Apply AI suggestion to page
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create database migration for new models
- [ ] Build basic page CRUD APIs
- [ ] Build basic block CRUD APIs
- [ ] Create simple page list view

### Phase 2: Basic Editor (Week 1-2)
- [ ] Integrate Editor.js or BlockNote
- [ ] Implement basic block types (text, headings, lists)
- [ ] Add page navigation sidebar
- [ ] Implement drag-and-drop reordering

### Phase 3: Notion-like Features (Week 2-3)
- [ ] Add page hierarchy (nested pages)
- [ ] Implement page icons and covers
- [ ] Add favorites and recently viewed
- [ ] Implement `/` command menu for blocks
- [ ] Add rich text formatting

### Phase 4: AI Integration (Week 3)
- [ ] Migrate existing AI chat to optional assistant
- [ ] Implement inline AI commands
- [ ] Add AI sidebar toggle
- [ ] AI content suggestions

### Phase 5: Advanced Features (Week 4)
- [ ] Add templates
- [ ] Implement search across pages
- [ ] Add page history/versions
- [ ] Export pages (markdown, PDF)

### Phase 6: Collaboration Prep (Future)
- [ ] Real-time updates (WebSocket/SSE)
- [ ] User presence indicators
- [ ] Comments system
- [ ] Permissions model

---

## Migration Strategy

### Data Migration
1. Convert existing `ResearchSession` → `Page`
2. Convert `ResearchMessage` conversations → `Block` (text blocks)
3. Preserve chat history in AI sessions

### Backward Compatibility
- Keep old research routes for 1-2 versions
- Add deprecation warnings
- Provide migration tool

---

## Technology Choices

### Frontend
- **Editor**: BlockNote or Editor.js
- **Drag & Drop**: @dnd-kit or react-beautiful-dnd
- **Icons**: Emoji picker + lucide-icons
- **Styling**: Tailwind CSS (already have custom styles, can migrate)

### Backend
- Keep Express + TypeScript
- Add WebSocket support (Socket.io) for future real-time features
- Use Prisma transactions for block operations

---

## Next Steps

1. **Review and approve architecture**
2. **Choose editor library** (BlockNote recommended)
3. **Create database migration**
4. **Build MVP with basic page + blocks**
5. **Iterate and add features**

---

## Future Enhancements

- **Databases**: Notion-style database views (table, board, calendar)
- **Relations**: Link pages together
- **Embeds**: YouTube, Figma, etc.
- **Mobile**: Responsive design
- **Offline**: Service worker + local storage
- **Teams**: Workspaces, permissions, sharing

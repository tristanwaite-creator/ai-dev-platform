/**
 * Pages View Component
 * Notion-like notes and docs interface
 */

import { BaseView } from '../components/tabs.js';
import { api } from '../core/api.js';
import { store } from '../core/state.js';
import { toast } from '../components/toast.js';
import { AIAssistantBubble } from '../components/ai-assistant-bubble.js';

export default class PagesView extends BaseView {
  constructor(container) {
    super(container);
    this.projectId = store.get('projectId');
    this.currentPageId = null;
    this.pages = [];
    this.blocks = [];
    this.autoSaveTimeout = null;
    this.draggedPageId = null; // Track dragged page for drag-and-drop
    // Track which folders are collapsed (store in localStorage)
    this.collapsedFolders = new Set(
      JSON.parse(localStorage.getItem('collapsed-folders') || '[]')
    );
    // Initialize AI Assistant
    this.aiAssistant = new AIAssistantBubble(this.projectId, (sessionId) => {
      console.log('AI Assistant session created:', sessionId);
    });
  }

  async render() {
    console.log('PagesView: Starting render');

    this.sidebarCollapsed = localStorage.getItem('pages-sidebar-collapsed') === 'true';

    // Add AI Assistant bubble
    const aiAssistantHTML = this.aiAssistant.render();

    this.container.innerHTML = `
      <style>
        .pages-view-container {
          display: flex;
          height: 100%;
          background: var(--bg-dark, #0a0a0f);
        }

        .pages-sidebar {
          width: 220px;
          background: var(--bg-card, #1a1a24);
          border-right: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .pages-sidebar.collapsed {
          width: 0;
          border-right: none;
        }

        .pages-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .page-item {
          display: flex;
          align-items: center;
          padding: 4px 8px;
          margin: 1px 0;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          color: var(--text-primary, #ffffff);
          user-select: none;
          position: relative;
          transition: all 0.15s ease;
        }

        .page-item.dragging {
          opacity: 0.4;
          cursor: grabbing;
        }

        .page-item.drag-over {
          background: rgba(99, 102, 241, 0.2);
          border: 1px dashed var(--accent, #6366f1);
        }

        .page-item.folder.drag-over {
          background: rgba(99, 102, 241, 0.25);
          border: 1px dashed var(--accent, #6366f1);
        }

        .folder-arrow {
          width: 14px;
          display: inline-block;
          text-align: center;
          margin-right: 4px;
          cursor: pointer;
          color: var(--text-secondary, #a0a0b0);
          transition: transform 0.15s ease;
        }

        .folder-arrow:hover {
          color: var(--text-primary, #ffffff);
        }

        .page-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .page-item.active {
          background: rgba(99, 102, 241, 0.15);
          color: var(--accent, #6366f1);
        }

        .page-item.child {
          margin-left: 20px;
        }

        .page-icon {
          margin-right: 6px;
          font-size: 16px;
        }

        .page-title-text {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .page-rename-btn {
          display: none;
          position: absolute;
          right: 32px;
          padding: 2px 6px;
          background: var(--bg-card, #1a1a24);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 3px;
          cursor: pointer;
          font-size: 13px;
          color: var(--accent, #6366f1);
          transition: all 0.15s ease;
          z-index: 5;
        }

        .page-delete-btn {
          display: none;
          position: absolute;
          right: 6px;
          padding: 2px 6px;
          background: var(--bg-card, #1a1a24);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 3px;
          cursor: pointer;
          font-size: 13px;
          color: #ef4444;
          transition: all 0.15s ease;
          z-index: 5;
        }

        .page-item:hover .page-rename-btn,
        .page-item:hover .page-delete-btn {
          display: block;
        }

        .page-rename-btn:hover {
          background: rgba(99, 102, 241, 0.15);
          border-color: var(--accent, #6366f1);
          transform: scale(1.05);
        }

        .page-delete-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: #ef4444;
          transform: scale(1.05);
        }

        .page-title-input {
          flex: 1;
          background: var(--bg-dark, #0a0a0f);
          border: 1px solid var(--accent, #6366f1);
          border-radius: 3px;
          padding: 2px 6px;
          color: var(--text-primary, #ffffff);
          font-size: 14px;
          font-family: inherit;
          outline: none;
        }

        .page-title-input:focus {
          border-color: var(--accent, #6366f1);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .new-page-btn,
        .new-folder-btn {
          margin: 8px 8px 4px 8px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          color: var(--text-primary, #ffffff);
          font-weight: 500;
          width: calc(100% - 16px);
          transition: all 0.2s ease;
        }

        .new-folder-btn {
          margin-bottom: 12px;
        }

        .new-page-btn:hover,
        .new-folder-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--accent, #6366f1);
        }

        .page-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          background: var(--bg-dark, #0a0a0f);
        }

        .sidebar-toggle {
          position: absolute;
          left: 8px;
          top: 12px;
          width: 28px;
          height: 28px;
          background: var(--bg-card, #1a1a24);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          z-index: 10;
          color: var(--text-secondary, #a0a0b0);
          font-size: 16px;
          user-select: none;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .sidebar-toggle:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-primary, #ffffff);
          border-color: var(--accent, #6366f1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }

        .sidebar-toggle:active {
          background: rgba(255, 255, 255, 0.03);
          transform: scale(0.95);
        }

        .page-header {
          padding: 24px 96px 0;
          min-height: 80px;
        }

        .page-icon-large {
          font-size: 48px;
          line-height: 1;
          margin-bottom: 4px;
          cursor: pointer;
          display: inline-block;
        }

        .page-title-display {
          display: inline-block;
          margin-left: 12px;
          font-size: 28px;
          font-weight: 600;
          color: var(--text-primary, #ffffff);
          vertical-align: middle;
        }

        .page-editor {
          flex: 1;
          padding: 0 96px 96px;
          overflow-y: auto;
        }

        .document-content {
          width: 100%;
          min-height: 500px;
          padding: 0;
          margin: 0;
          border: none;
          outline: none;
          font-size: 16px;
          line-height: 1.7;
          color: var(--text-primary, #ffffff);
          font-family: inherit;
          background: transparent;
          resize: none;
          overflow: hidden;
        }

        .document-content::placeholder {
          color: var(--text-secondary, #a0a0b0);
          font-style: italic;
        }

        .document-content:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.02);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary, #a0a0b0);
        }

        .empty-state h2 {
          color: var(--text-primary, #ffffff);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .loading {
          text-align: center;
          padding: 32px;
          color: var(--text-secondary, #a0a0b0);
        }

        /* Scrollbar styling for dark mode */
        .pages-list::-webkit-scrollbar,
        .page-editor::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .pages-list::-webkit-scrollbar-track,
        .page-editor::-webkit-scrollbar-track {
          background: transparent;
        }

        .pages-list::-webkit-scrollbar-thumb,
        .page-editor::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        .pages-list::-webkit-scrollbar-thumb:hover,
        .page-editor::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      </style>
      <div class="pages-view-container">
        <div class="pages-sidebar ${this.sidebarCollapsed ? 'collapsed' : ''}">
          <button class="new-page-btn" id="newPageBtn">📄 New Page</button>
          <button class="new-folder-btn" id="newFolderBtn">📁 New Folder</button>
          <div class="pages-list" id="pagesList">
            <div class="loading">Loading pages...</div>
          </div>
        </div>

        <div class="page-main">
          <button class="sidebar-toggle" id="sidebarToggle" title="Toggle sidebar">
            ${this.sidebarCollapsed ? '›' : '‹'}
          </button>
          <div id="pageContent">
            <div class="empty-state">
              <div class="empty-icon">📄</div>
              <h2>Select a page or create a new one</h2>
              <p>Your notes and documentation will appear here</p>
            </div>
          </div>
        </div>
      </div>
      ${aiAssistantHTML}
    `;

    await this.loadPages();
    this.setupEventListeners();

    // Initialize AI Assistant event listeners
    this.aiAssistant.attachEventListeners();

    console.log('PagesView: Render complete');
  }

  setupEventListeners() {
    const newPageBtn = this.container.querySelector('#newPageBtn');
    this.addEventListener(newPageBtn, 'click', () => this.createPage());

    const newFolderBtn = this.container.querySelector('#newFolderBtn');
    this.addEventListener(newFolderBtn, 'click', () => this.createFolder());

    const toggleBtn = this.container.querySelector('#sidebarToggle');
    this.addEventListener(toggleBtn, 'click', () => this.toggleSidebar());

    // Save before page unload (refresh/close)
    this.beforeUnloadHandler = async (e) => {
      // Clear timeout and save immediately
      clearTimeout(this.autoSaveTimeout);
      await this.saveCurrentContent();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);

    // Also save when tab becomes hidden (more reliable than beforeunload)
    this.visibilityChangeHandler = async () => {
      if (document.hidden) {
        clearTimeout(this.autoSaveTimeout);
        await this.saveCurrentContent();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('pages-sidebar-collapsed', this.sidebarCollapsed);

    const sidebar = this.container.querySelector('.pages-sidebar');
    const toggleBtn = this.container.querySelector('#sidebarToggle');

    sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
    toggleBtn.textContent = this.sidebarCollapsed ? '›' : '‹';
  }

  toggleFolder(folderId) {
    if (this.collapsedFolders.has(folderId)) {
      this.collapsedFolders.delete(folderId);
    } else {
      this.collapsedFolders.add(folderId);
    }

    // Save to localStorage
    localStorage.setItem(
      'collapsed-folders',
      JSON.stringify(Array.from(this.collapsedFolders))
    );

    // Re-render the pages list
    this.renderPagesList();
  }

  // Check if targetId is a descendant of pageId
  isDescendant(targetId, pageId) {
    const target = this.pages.find(p => p.id === targetId);
    if (!target) return false;

    // Traverse up the parent chain
    let current = target;
    while (current.parentId) {
      if (current.parentId === pageId) {
        return true;
      }
      current = this.pages.find(p => p.id === current.parentId);
      if (!current) break;
    }
    return false;
  }

  async movePage(pageId, newParentId) {
    try {
      console.log(`Moving page ${pageId} to folder ${newParentId}`);

      await api.post(`/pages/${pageId}/move`, {
        parentId: newParentId
      });

      toast.success('Moved successfully');

      // Reload pages
      await this.loadPages();
    } catch (error) {
      console.error('Failed to move page:', error);
      toast.error('Failed to move page');
    }
  }

  async loadPages() {
    const pagesList = this.container.querySelector('#pagesList');
    try {
      // Always skip cache to ensure fresh data
      const timestamp = Date.now();
      const data = await api.get(`/projects/${this.projectId}/pages?_t=${timestamp}`, {
        skipCache: true
      });
      this.pages = data.pages || [];

      console.log('Loaded pages:', this.pages.length, 'pages');

      if (this.pages.length === 0) {
        pagesList.innerHTML = `
          <div style="padding: 16px; text-align: center; color: var(--text-secondary, #a0a0b0); font-size: 13px;">
            <p>No pages yet</p>
            <p>Create your first page</p>
          </div>
        `;
        return;
      }

      this.renderPagesList();
    } catch (error) {
      console.error('Failed to load pages:', error);
      pagesList.innerHTML = `
        <div style="padding: 16px; color: var(--error, #ef4444); font-size: 13px;">
          Failed to load pages
        </div>
      `;
    }
  }

  renderPagesList() {
    const pagesList = this.container.querySelector('#pagesList');
    const rootPages = this.pages.filter(p => !p.parentId);
    const childrenMap = {};

    this.pages.forEach(page => {
      if (page.parentId) {
        if (!childrenMap[page.parentId]) {
          childrenMap[page.parentId] = [];
        }
        childrenMap[page.parentId].push(page);
      }
    });

    rootPages.sort((a, b) => a.order - b.order);
    Object.values(childrenMap).forEach(children => {
      children.sort((a, b) => a.order - b.order);
    });

    let html = '';

    const renderPage = (page, level = 0) => {
      const hasChildren = childrenMap[page.id] && childrenMap[page.id].length > 0;
      // Handle undefined/null type as 'document' for backwards compatibility
      const pageType = page.type || 'document';
      const isFolder = pageType === 'folder';
      const isCollapsed = this.collapsedFolders.has(page.id);
      const levelClass = level === 0 ? '' : 'child';

      // Default icons: folder vs document
      const defaultIcon = isFolder ? '📁' : '📄';
      const icon = page.icon || defaultIcon;

      // Show collapse arrow for folders with children
      let collapseArrow = '';
      if (isFolder && hasChildren) {
        collapseArrow = `<span class="folder-arrow" data-folder-id="${page.id}">${isCollapsed ? '▶' : '▼'}</span>`;
      } else if (isFolder) {
        collapseArrow = '<span style="width: 12px; display: inline-block;"></span>';
      }

      html += `
        <div class="page-item ${levelClass} ${page.id === this.currentPageId ? 'active' : ''} ${isFolder ? 'folder' : 'document'}"
             data-page-id="${page.id}"
             data-type="${pageType}"
             data-title="${this.escapeHtml(page.title)}"
             draggable="true"
             title="Type: ${pageType} | ID: ${page.id}">
          ${collapseArrow}
          <span class="page-icon">${icon}</span>
          <span class="page-title-text">${this.escapeHtml(page.title)} ${pageType === 'folder' ? '' : ''}</span>
          <button class="page-rename-btn" data-rename-id="${page.id}" title="Rename ${isFolder ? 'folder' : 'page'}">✏️</button>
          <button class="page-delete-btn" data-delete-id="${page.id}" title="Delete ${isFolder ? 'folder' : 'page'}">🗑️</button>
        </div>
      `;

      // Render children if folder is not collapsed
      if (hasChildren && !isCollapsed) {
        childrenMap[page.id].forEach(child => renderPage(child, level + 1));
      }
    };

    rootPages.forEach(page => renderPage(page));
    pagesList.innerHTML = html;

    // Add folder arrow handlers
    pagesList.querySelectorAll('.folder-arrow').forEach(arrow => {
      this.addEventListener(arrow, 'click', (e) => {
        e.stopPropagation(); // Prevent page load
        const folderId = arrow.dataset.folderId;
        this.toggleFolder(folderId);
      });
    });

    // Add click handlers
    pagesList.querySelectorAll('.page-item').forEach(item => {
      this.addEventListener(item, 'click', (e) => {
        // Don't load page if clicking delete, rename button, or folder arrow
        if (e.target.classList.contains('page-delete-btn') ||
            e.target.classList.contains('page-rename-btn') ||
            e.target.classList.contains('folder-arrow')) {
          return;
        }

        const pageType = item.dataset.type;
        const pageId = item.dataset.pageId;

        // Only load documents, not folders
        if (pageType === 'document') {
          this.loadPage(pageId);
        } else {
          // For folders, just toggle expand/collapse
          this.toggleFolder(pageId);
        }
      });

      // Drag and drop handlers
      this.addEventListener(item, 'dragstart', (e) => {
        this.draggedPageId = item.dataset.pageId;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        console.log('🎯 DRAGSTART:', {
          draggedPageId: this.draggedPageId,
          draggedType: item.dataset.type
        });
      });

      this.addEventListener(item, 'dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Only allow drop on folders
        const targetType = item.dataset.type;
        const targetPageId = item.dataset.pageId;

        console.log('🎯 DRAGOVER:', {
          targetPageId,
          targetType,
          draggedPageId: this.draggedPageId,
          willAddHighlight: targetType === 'folder' && targetPageId !== this.draggedPageId
        });

        if (targetType === 'folder' && targetPageId !== this.draggedPageId) {
          item.classList.add('drag-over');
          console.log('✅ Added drag-over class to folder:', targetPageId);
        }
      });

      this.addEventListener(item, 'dragleave', (e) => {
        // Remove highlight when leaving
        if (e.target === item) {
          item.classList.remove('drag-over');
          console.log('🎯 DRAGLEAVE: Removed drag-over from', item.dataset.pageId);
        }
      });

      this.addEventListener(item, 'drop', async (e) => {
        console.log('🎯 DROP EVENT FIRED!', {
          target: item.dataset.pageId,
          targetType: item.dataset.type,
          dragged: this.draggedPageId
        });

        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('drag-over');

        const targetPageId = item.dataset.pageId;
        const targetType = item.dataset.type;

        // Only allow drop on folders
        if (targetType !== 'folder') {
          console.log('❌ DROP REJECTED: Target is not a folder');
          return;
        }

        if (!this.draggedPageId) {
          console.log('❌ DROP REJECTED: No dragged page ID');
          return;
        }

        if (targetPageId === this.draggedPageId) {
          console.log('❌ DROP REJECTED: Cannot drop on self');
          return;
        }

        // Check if trying to drop folder into its own child
        if (this.isDescendant(targetPageId, this.draggedPageId)) {
          console.log('❌ DROP REJECTED: Circular reference detected');
          toast.error('Cannot move a folder into its own subfolder');
          return;
        }

        console.log('✅ DROP ACCEPTED: Moving page', this.draggedPageId, 'to folder', targetPageId);
        await this.movePage(this.draggedPageId, targetPageId);
      });

      this.addEventListener(item, 'dragend', (e) => {
        console.log('🎯 DRAGEND');
        item.classList.remove('dragging');
        // Clean up any remaining drag-over states
        pagesList.querySelectorAll('.drag-over').forEach(el => {
          el.classList.remove('drag-over');
        });
        this.draggedPageId = null;
      });
    });

    // Add delete button handlers
    pagesList.querySelectorAll('.page-delete-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        e.stopPropagation(); // Prevent page load
        const pageId = btn.dataset.deleteId;
        this.deletePageById(pageId);
      });
    });

    // Add rename button handlers
    pagesList.querySelectorAll('.page-rename-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        e.stopPropagation(); // Prevent page load
        const pageId = btn.dataset.renameId;
        this.startRename(pageId);
      });
    });
  }

  async loadPage(pageId) {
    // Save current page content before switching (if there's a pending save)
    if (this.currentPageId && this.currentPageId !== pageId) {
      clearTimeout(this.autoSaveTimeout);
      await this.saveCurrentContent();
    }

    this.currentPageId = pageId;

    // Update active state
    this.container.querySelectorAll('.page-item').forEach(item => {
      item.classList.toggle('active', item.dataset.pageId === pageId);
    });

    try {
      // Skip cache to always get fresh content
      // Add timestamp to bust any browser/CDN caching
      const timestamp = Date.now();
      console.log(`Loading page ${pageId} with cache bust ${timestamp}`);
      const data = await api.get(`/pages/${pageId}?_t=${timestamp}`, { skipCache: true });
      const page = data.page;
      this.blocks = page.blocks || [];

      console.log('Loaded page data:', {
        pageId: page.id,
        title: page.title,
        blocksCount: this.blocks.length,
        firstBlockContent: this.blocks[0]?.content?.text?.substring(0, 50) + '...'
      });

      this.renderPageContent(page);
    } catch (error) {
      console.error('Failed to load page:', error);
      toast.error('Failed to load page');
    }
  }

  renderPageContent(page) {
    const icon = page.icon || '📄';

    // Get content from first block (or empty string)
    const content = this.blocks.length > 0 && this.blocks[0].content.text
      ? this.blocks[0].content.text
      : '';

    // Only show title if it's not "Untitled"
    const showTitle = page.title && page.title !== 'Untitled';

    const html = `
      <div class="page-header">
        <div class="page-icon-large" id="pageIcon" contenteditable="true">${icon}</div>
        ${showTitle ? `<span class="page-title-display">${this.escapeHtml(page.title)}</span>` : ''}
      </div>
      <div class="page-editor" id="pageEditor">
        <textarea class="document-content"
                  id="documentContent"
                  placeholder="Start writing... Supports Markdown formatting">${content}</textarea>
      </div>
    `;

    this.container.querySelector('#pageContent').innerHTML = html;

    // Add icon handler
    const iconDiv = this.container.querySelector('#pageIcon');
    this.addEventListener(iconDiv, 'blur', () => this.autoSavePage());

    // Add content handler
    const contentArea = this.container.querySelector('#documentContent');
    this.addEventListener(contentArea, 'input', () => this.autoSaveContent());

    // Auto-resize textarea as content grows
    this.autoResizeTextarea(contentArea);
  }

  autoResizeTextarea(textarea) {
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    };

    // Initial resize
    resize();

    // Resize on input
    this.addEventListener(textarea, 'input', resize);
  }

  async saveCurrentContent() {
    if (!this.currentPageId) {
      console.log('No current page ID, skipping save');
      return;
    }

    if (!this.blocks || this.blocks.length === 0) {
      console.log('No blocks available, skipping save');
      return;
    }

    const contentArea = this.container.querySelector('#documentContent');
    if (!contentArea) {
      console.log('Content area not found, skipping save');
      return;
    }

    const content = contentArea.value || '';
    const blockId = this.blocks[0].id;

    console.log('Saving content:', {
      blockId,
      contentLength: content.length,
      pageId: this.currentPageId
    });

    try {
      await api.patch(`/blocks/${blockId}`, {
        content: { text: content },
      });
      console.log('Content saved successfully');

      // Update local blocks state immediately
      this.blocks[0].content.text = content;

      // Clear cache for this page to ensure fresh data on next load
      api.clearCache(`/pages/${this.currentPageId}`);

      // Auto-generate title if content is substantial and title is still "Untitled"
      const currentPage = this.pages.find(p => p.id === this.currentPageId);
      if (currentPage &&
          currentPage.title === 'Untitled' &&
          content.length >= 50 &&
          !this.titleGenerating) {
        this.generateTitle(content);
      }
    } catch (error) {
      console.error('Failed to save content:', error);
      toast.error('Failed to save changes');
    }
  }

  autoSaveContent() {
    clearTimeout(this.autoSaveTimeout);
    // Reduced from 500ms to 300ms for more frequent saves
    this.autoSaveTimeout = setTimeout(() => this.saveCurrentContent(), 300);
  }

  async generateTitle(content) {
    if (this.titleGenerating) return;
    this.titleGenerating = true;

    try {
      // Get first 200 characters for title generation
      const excerpt = content.substring(0, 200);

      const data = await api.post(`/pages/${this.currentPageId}/generate-title`, {
        content: excerpt
      });

      if (data.title) {
        // Update local pages array
        const pageIndex = this.pages.findIndex(p => p.id === this.currentPageId);
        if (pageIndex !== -1) {
          this.pages[pageIndex].title = data.title;
        }

        // Update UI
        await this.loadPages();

        // Update header if still on this page
        const titleDisplay = this.container.querySelector('.page-title-display');
        if (!titleDisplay) {
          // Add title display if it doesn't exist
          const header = this.container.querySelector('.page-header');
          const titleSpan = document.createElement('span');
          titleSpan.className = 'page-title-display';
          titleSpan.textContent = data.title;
          header.appendChild(titleSpan);
        } else {
          titleDisplay.textContent = data.title;
        }
      }
    } catch (error) {
      console.error('Failed to generate title:', error);
    } finally {
      this.titleGenerating = false;
    }
  }

  autoSavePage() {
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(async () => {
      if (!this.currentPageId) return;

      const title = this.container.querySelector('#pageTitle')?.value;
      const icon = this.container.querySelector('#pageIcon')?.textContent.trim();

      try {
        await api.patch(`/pages/${this.currentPageId}`, { title, icon });
        await this.loadPages();
      } catch (error) {
        console.error('Failed to save page:', error);
      }
    }, 500);
  }


  async createPage() {
    try {
      const data = await api.post(`/projects/${this.projectId}/pages`, {
        title: 'Untitled',
        icon: '📄',
        type: 'document',
      });

      console.log('Page created:', data.page.id);

      // Create initial block so page is immediately editable
      await api.post(`/pages/${data.page.id}/blocks`, {
        type: 'text',
        content: { text: '' },
        order: 0,
      });

      console.log('Initial block created');

      await this.loadPages();
      await this.loadPage(data.page.id);

      console.log('Page loaded, blocks:', this.blocks);

      // Focus content area so user can start typing immediately
      setTimeout(() => {
        const contentArea = this.container.querySelector('#documentContent');
        if (contentArea) {
          contentArea.focus();
          console.log('Content area focused');
        } else {
          console.error('Content area not found!');
        }
      }, 100);

      toast.success('Page created');
    } catch (error) {
      console.error('Failed to create page:', error);
      toast.error('Failed to create page');
    }
  }

  async createFolder() {
    try {
      const data = await api.post(`/projects/${this.projectId}/pages`, {
        title: 'New Folder',
        icon: '📁',
        type: 'folder',
      });

      console.log('Folder created:', data.page.id);

      await this.loadPages();

      toast.success('Folder created');
    } catch (error) {
      console.error('Failed to create folder:', error);
      toast.error('Failed to create folder');
    }
  }

  startRename(pageId) {
    const pageItem = this.container.querySelector(`[data-page-id="${pageId}"]`);
    if (!pageItem) return;

    const titleSpan = pageItem.querySelector('.page-title-text');
    if (!titleSpan) return;

    const currentTitle = pageItem.dataset.title || titleSpan.textContent.trim();

    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'page-title-input';
    input.value = currentTitle;

    // Replace title span with input
    titleSpan.style.display = 'none';
    titleSpan.parentNode.insertBefore(input, titleSpan);

    // Focus and select all text
    input.focus();
    input.select();

    // Save on Enter or blur
    const saveRename = async () => {
      const newTitle = input.value.trim();

      // Remove input and show title span
      input.remove();
      titleSpan.style.display = '';

      if (newTitle && newTitle !== currentTitle) {
        await this.saveRename(pageId, newTitle);
      }
    };

    // Handle Enter key
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await saveRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.remove();
        titleSpan.style.display = '';
      }
    });

    // Handle blur (click away)
    input.addEventListener('blur', saveRename);
  }

  async saveRename(pageId, newTitle) {
    try {
      await api.patch(`/pages/${pageId}`, {
        title: newTitle
      });

      toast.success('Renamed successfully');

      // Update local pages array
      const pageIndex = this.pages.findIndex(p => p.id === pageId);
      if (pageIndex !== -1) {
        this.pages[pageIndex].title = newTitle;
      }

      // Re-render pages list to show new name
      this.renderPagesList();

      // If this is the current page, update the header too
      if (this.currentPageId === pageId) {
        const titleDisplay = this.container.querySelector('.page-title-display');
        if (titleDisplay) {
          titleDisplay.textContent = newTitle;
        }
      }
    } catch (error) {
      console.error('Failed to rename:', error);
      toast.error('Failed to rename');
      // Reload to show original name
      await this.loadPages();
    }
  }

  async deletePageById(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    const pageName = page?.title || 'this page';

    if (!confirm(`Are you sure you want to delete "${pageName}"? This cannot be undone.`)) {
      return;
    }

    try {
      console.log('Deleting page:', pageId);
      await api.delete(`/pages/${pageId}`);
      console.log('Page deleted from server');

      // Clear all relevant caches
      api.clearCache(`/pages/${pageId}`);
      api.clearCache(`/projects/${this.projectId}/pages`);

      toast.success('Page deleted');

      // Remove from local pages array
      this.pages = this.pages.filter(p => p.id !== pageId);

      // If we deleted the current page, clear it and load another
      const wasCurrentPage = this.currentPageId === pageId;
      if (wasCurrentPage) {
        this.currentPageId = null;
        this.blocks = [];
      }

      // Add a small delay to ensure server has processed the deletion
      await new Promise(resolve => setTimeout(resolve, 200));

      // Force a hard reload to clear all caches
      console.log('Forcing page reload to clear all caches...');
      window.location.reload();

      // Note: Code below won't execute due to reload, but keeping for fallback
      return;

      // Show empty state or load first page (if we deleted current page)
      if (wasCurrentPage) {
        if (this.pages.length > 0) {
          console.log('Loading first page:', this.pages[0].id);
          await this.loadPage(this.pages[0].id);
        } else {
          // Show empty state
          console.log('No pages left, showing empty state');
          this.container.querySelector('#pageContent').innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">📄</div>
              <h2>No pages yet</h2>
              <p>Create a new page to get started</p>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Failed to delete page:', error);
      toast.error('Failed to delete page');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async destroy() {
    // Save current content before destroying view
    clearTimeout(this.autoSaveTimeout);
    await this.saveCurrentContent();

    // Remove global event handlers
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }

    // Call parent destroy to clean up event listeners
    super.destroy();
  }
}

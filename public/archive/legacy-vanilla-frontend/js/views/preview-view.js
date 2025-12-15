/**
 * Preview View Component
 * Shows all built branches/previews from the Kanban board
 */

import { BaseView } from '../components/tabs.js';
import { api } from '../core/api.js';
import { store } from '../core/state.js';
import { toast } from '../components/toast.js';

export default class PreviewView extends BaseView {
  constructor(container) {
    super(container);
    this.projectId = store.get('projectId');
    this.builtTasks = [];
    this.selectedTask = null;
  }

  async render() {
    this.container.innerHTML = `
      <style>
        .preview-view-container {
          display: flex;
          height: 100%;
          background: var(--bg-dark, #0a0a0f);
        }

        .preview-sidebar {
          width: 280px;
          background: var(--bg-card, #1a1a24);
          border-right: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          overflow: hidden;
        }

        .preview-header {
          padding: 16px;
          border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        }

        .preview-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary, #ffffff);
        }

        .preview-header p {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: var(--text-secondary, #a0a0b0);
        }

        .preview-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .preview-item {
          padding: 12px;
          margin: 4px 0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid transparent;
        }

        .preview-item:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--border, rgba(255, 255, 255, 0.1));
        }

        .preview-item.active {
          background: rgba(99, 102, 241, 0.15);
          border-color: var(--accent, #6366f1);
        }

        .preview-item-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #ffffff);
          margin-bottom: 4px;
        }

        .preview-item-meta {
          font-size: 12px;
          color: var(--text-secondary, #a0a0b0);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .preview-item-column {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
        }

        .preview-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-dark, #0a0a0f);
        }

        .preview-toolbar {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--bg-card, #1a1a24);
        }

        .preview-toolbar-title {
          flex: 1;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary, #ffffff);
        }

        .preview-toolbar-actions {
          display: flex;
          gap: 8px;
        }

        .preview-toolbar-btn {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 6px;
          color: var(--text-primary, #ffffff);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .preview-toolbar-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--accent, #6366f1);
        }

        .preview-iframe-container {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        .preview-iframe {
          width: 100%;
          height: 100%;
          border: none;
          background: #ffffff;
        }

        .preview-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary, #a0a0b0);
          padding: 48px;
          text-align: center;
        }

        .preview-empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .preview-empty h2 {
          color: var(--text-primary, #ffffff);
          margin-bottom: 8px;
        }

        .preview-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary, #a0a0b0);
        }

        .preview-list::-webkit-scrollbar {
          width: 8px;
        }

        .preview-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .preview-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        .preview-list::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      </style>
      <div class="preview-view-container">
        <div class="preview-sidebar">
          <div class="preview-header">
            <h2>Previews</h2>
            <p>Built tasks from Kanban</p>
          </div>
          <div class="preview-list" id="previewList">
            <div class="preview-loading">Loading previews...</div>
          </div>
        </div>

        <div class="preview-main">
          <div class="preview-toolbar">
            <div class="preview-toolbar-title" id="previewTitle">
              Select a preview to view
            </div>
            <div class="preview-toolbar-actions">
              <button class="preview-toolbar-btn" id="openInNewTabBtn" style="display: none;">
                🔗 Open in New Tab
              </button>
            </div>
          </div>
          <div class="preview-iframe-container" id="previewContainer">
            <div class="preview-empty">
              <div class="preview-empty-icon">📱</div>
              <h2>No preview selected</h2>
              <p>Choose a built task from the sidebar to view its preview</p>
            </div>
          </div>
        </div>
      </div>
    `;

    await this.loadPreviews();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const openInNewTabBtn = this.container.querySelector('#openInNewTabBtn');
    this.addEventListener(openInNewTabBtn, 'click', () => {
      if (this.selectedTask) {
        const generation = this.selectedTask.generations[0];
        if (generation?.sandboxId) {
          const sandboxUrl = `https://${generation.sandboxId}.e2b.dev:8000`;
          window.open(sandboxUrl, '_blank');
        }
      }
    });
  }

  async loadPreviews() {
    const previewList = this.container.querySelector('#previewList');
    try {
      // Get the project's board to find built tasks
      const boardData = await api.get(`/projects/${this.projectId}/board`, { skipCache: true });
      const board = boardData.board;

      // Get all built tasks from "building" or "done" columns
      this.builtTasks = [
        ...(board.building || []),
        ...(board.done || [])
      ].filter(task => 
        task.generations && 
        task.generations.length > 0 && 
        task.generations[0].sandboxId
      );

      if (this.builtTasks.length === 0) {
        previewList.innerHTML = `
          <div class="preview-empty" style="padding: 24px;">
            <div class="preview-empty-icon">🚧</div>
            <h2>No previews available</h2>
            <p>Build a task from the Kanban board to see previews here</p>
          </div>
        `;
        return;
      }

      this.renderPreviewList();

      // Auto-select first preview
      if (this.builtTasks.length > 0) {
        this.selectPreview(this.builtTasks[0]);
      }

    } catch (error) {
      console.error('Failed to load previews:', error);
      previewList.innerHTML = `
        <div style="padding: 16px; color: var(--error, #ef4444); font-size: 13px;">
          Failed to load previews
        </div>
      `;
    }
  }

  renderPreviewList() {
    const previewList = this.container.querySelector('#previewList');
    
    previewList.innerHTML = this.builtTasks.map(task => {
      const generation = task.generations[0];
      const columnEmoji = {
        building: '🔨',
        done: '✅',
        testing: '🧪'
      };
      const columnLabel = {
        building: 'Building',
        done: 'Done',
        testing: 'Testing'
      };

      return `
        <div class="preview-item" data-task-id="${task.id}">
          <div class="preview-item-title">${this.escapeHtml(task.title)}</div>
          <div class="preview-item-meta">
            <span class="preview-item-column">
              ${columnEmoji[task.column] || '📋'} ${columnLabel[task.column] || task.column}
            </span>
            ${task.branchName ? `<span>${this.escapeHtml(task.branchName)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    previewList.querySelectorAll('.preview-item').forEach(item => {
      this.addEventListener(item, 'click', () => {
        const taskId = item.dataset.taskId;
        const task = this.builtTasks.find(t => t.id === taskId);
        if (task) {
          this.selectPreview(task);
        }
      });
    });
  }

  selectPreview(task) {
    this.selectedTask = task;
    const generation = task.generations[0];
    
    if (!generation?.sandboxId) {
      toast.error('No sandbox available for this task');
      return;
    }

    // Update active state
    this.container.querySelectorAll('.preview-item').forEach(item => {
      item.classList.toggle('active', item.dataset.taskId === task.id);
    });

    // Update toolbar
    const previewTitle = this.container.querySelector('#previewTitle');
    previewTitle.textContent = task.title;

    const openInNewTabBtn = this.container.querySelector('#openInNewTabBtn');
    openInNewTabBtn.style.display = 'block';

    // Show preview in iframe
    const sandboxUrl = `https://${generation.sandboxId}.e2b.dev:8000`;
    const previewContainer = this.container.querySelector('#previewContainer');
    
    previewContainer.innerHTML = `
      <iframe 
        class="preview-iframe" 
        src="${sandboxUrl}" 
        title="Preview: ${this.escapeHtml(task.title)}"
        allow="camera; microphone; geolocation"
      ></iframe>
    `;

    // Show loading state while iframe loads
    const iframe = previewContainer.querySelector('.preview-iframe');
    iframe.addEventListener('load', () => {
      console.log('Preview loaded:', sandboxUrl);
    });

    iframe.addEventListener('error', () => {
      previewContainer.innerHTML = `
        <div class="preview-empty">
          <div class="preview-empty-icon">⚠️</div>
          <h2>Preview unavailable</h2>
          <p>The sandbox may have expired or is not accessible.</p>
          <button class="preview-toolbar-btn" onclick="window.open('${sandboxUrl}', '_blank')" style="margin-top: 16px;">
            Try opening in new tab
          </button>
        </div>
      `;
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}


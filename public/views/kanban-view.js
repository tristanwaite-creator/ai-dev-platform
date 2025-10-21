/**
 * Kanban View Component
 * Manages project tasks in kanban board format
 */

import { BaseView } from '../components/tabs.js';
import { api } from '../core/api.js';
import { store } from '../core/state.js';
import { toast } from '../components/toast.js';

export default class KanbanView extends BaseView {
  constructor(container) {
    super(container);
    this.projectId = store.get('projectId');
    this.board = store.get('board') || { research: [], building: [], testing: [], done: [] };
  }

  async render() {
    this.container.innerHTML = `
      <div class="kanban-container" style="padding: var(--space-6);">
        <div class="kanban-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6);">
          <h2 style="margin: 0; font-size: var(--text-2xl); font-weight: var(--font-semibold);">Kanban Board</h2>
          <button id="newTaskBtn" class="btn btn-primary">+ New Task</button>
        </div>

        <div class="kanban-board" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); min-height: 500px;">
          <div class="kanban-column">
            <div class="column-header" style="padding: var(--space-3); background: var(--color-bg-tertiary); border-radius: var(--radius-lg); margin-bottom: var(--space-3); font-weight: var(--font-semibold);">
              📚 Research <span class="badge badge-primary" id="count-research">0</span>
            </div>
            <div id="column-research" class="column-tasks"></div>
          </div>

          <div class="kanban-column">
            <div class="column-header" style="padding: var(--space-3); background: var(--color-bg-tertiary); border-radius: var(--radius-lg); margin-bottom: var(--space-3); font-weight: var(--font-semibold);">
              🔨 Building <span class="badge badge-info" id="count-building">0</span>
            </div>
            <div id="column-building" class="column-tasks"></div>
          </div>

          <div class="kanban-column">
            <div class="column-header" style="padding: var(--space-3); background: var(--color-bg-tertiary); border-radius: var(--radius-lg); margin-bottom: var(--space-3); font-weight: var(--font-semibold);">
              🧪 Testing <span class="badge badge-warning" id="count-testing">0</span>
            </div>
            <div id="column-testing" class="column-tasks"></div>
          </div>

          <div class="kanban-column">
            <div class="column-header" style="padding: var(--space-3); background: var(--color-bg-tertiary); border-radius: var(--radius-lg); margin-bottom: var(--space-3); font-weight: var(--font-semibold);">
              ✅ Done <span class="badge badge-success" id="count-done">0</span>
            </div>
            <div id="column-done" class="column-tasks"></div>
          </div>
        </div>
      </div>
    `;

    await this.loadBoard();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const newTaskBtn = this.container.querySelector('#newTaskBtn');
    this.addEventListener(newTaskBtn, 'click', () => this.createTask());
  }

  async loadBoard() {
    const board = store.get('board');

    // Update counts
    ['research', 'building', 'testing', 'done'].forEach(col => {
      const count = board[col]?.length || 0;
      const badge = this.container.querySelector(`#count-${col}`);
      if (badge) badge.textContent = count;
    });

    // Render tasks
    ['research', 'building', 'testing', 'done'].forEach(col => {
      this.renderColumn(col, board[col] || []);
    });
  }

  renderColumn(column, tasks) {
    const columnEl = this.container.querySelector(`#column-${column}`);
    if (!columnEl) return;

    if (tasks.length === 0) {
      columnEl.innerHTML = `
        <div style="padding: var(--space-4); text-align: center; color: var(--color-text-tertiary); font-size: var(--text-sm);">
          No tasks
        </div>
      `;
      return;
    }

    columnEl.innerHTML = tasks.map(task => `
      <div class="task-card card hover-lift" style="padding: var(--space-4); margin-bottom: var(--space-3); cursor: pointer;" data-task-id="${task.id}">
        <div style="font-weight: var(--font-semibold); margin-bottom: var(--space-2);">${this.escapeHtml(task.title)}</div>
        ${task.description ? `<div style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-3);">${this.escapeHtml(task.description.substring(0, 100))}${task.description.length > 100 ? '...' : ''}</div>` : ''}

        <div style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
          ${column !== 'done' ? `<button class="btn btn-sm btn-primary move-forward" data-task-id="${task.id}">→</button>` : ''}
          ${column !== 'research' ? `<button class="btn btn-sm btn-ghost move-back" data-task-id="${task.id}">←</button>` : ''}
          ${task.prUrl ? `<a href="${task.prUrl}" target="_blank" class="btn btn-sm btn-ghost">PR</a>` : ''}
        </div>
      </div>
    `).join('');

    // Add move handlers
    columnEl.querySelectorAll('.move-forward').forEach(btn => {
      this.addEventListener(btn, 'click', async (e) => {
        e.stopPropagation();
        await this.moveTask(btn.dataset.taskId, this.getNextColumn(column));
      });
    });

    columnEl.querySelectorAll('.move-back').forEach(btn => {
      this.addEventListener(btn, 'click', async (e) => {
        e.stopPropagation();
        await this.moveTask(btn.dataset.taskId, this.getPrevColumn(column));
      });
    });
  }

  getNextColumn(current) {
    const order = ['research', 'building', 'testing', 'done'];
    const idx = order.indexOf(current);
    return order[Math.min(idx + 1, order.length - 1)];
  }

  getPrevColumn(current) {
    const order = ['research', 'building', 'testing', 'done'];
    const idx = order.indexOf(current);
    return order[Math.max(idx - 1, 0)];
  }

  async moveTask(taskId, newColumn) {
    try {
      await api.patch(`/projects/${this.projectId}/tasks/${taskId}/move`, {
        column: newColumn
      });

      // Reload board
      const data = await api.get(`/projects/${this.projectId}/view`);
      store.setState({ board: data.board });

      await this.loadBoard();
      toast.success('Task moved!');
    } catch (error) {
      toast.error('Failed to move task');
    }
  }

  async createTask() {
    const title = prompt('Task title:');
    if (!title) return;

    const description = prompt('Description (optional):');

    try {
      await api.post(`/projects/${this.projectId}/tasks`, {
        title,
        description: description || undefined,
        column: 'research'
      });

      // Reload
      const data = await api.get(`/projects/${this.projectId}/view`);
      store.setState({ board: data.board });

      await this.loadBoard();
      toast.success('Task created!');
    } catch (error) {
      toast.error('Failed to create task');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

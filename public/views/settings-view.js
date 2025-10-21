/**
 * Settings View Component
 * Project settings and configuration
 */

import { BaseView } from '../components/tabs.js';
import { api } from '../core/api.js';
import { store } from '../core/state.js';
import { toast } from '../components/toast.js';
import { confirmModal } from '../components/modal.js';

export default class SettingsView extends BaseView {
  constructor(container) {
    super(container);
    this.project = store.get('project');
  }

  async render() {
    const project = this.project;

    this.container.innerHTML = `
      <div class="settings-container" style="max-width: 800px; margin: 0 auto; padding: var(--space-8);">
        <h2 style="font-size: var(--text-3xl); font-weight: var(--font-bold); margin-bottom: var(--space-8);">Project Settings</h2>

        <!-- Project Info Section -->
        <section class="card" style="margin-bottom: var(--space-6);">
          <h3 class="card-title">Project Information</h3>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Project Name</label>
              <input type="text" id="projectName" class="form-input" value="${this.escapeHtml(project.name || '')}">
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea id="projectDescription" class="form-textarea" rows="3">${this.escapeHtml(project.description || '')}</textarea>
            </div>

            <button id="saveProjectBtn" class="btn btn-primary">Save Changes</button>
          </div>
        </section>

        <!-- GitHub Integration -->
        <section class="card" style="margin-bottom: var(--space-6);">
          <h3 class="card-title">GitHub Integration</h3>
          <div class="card-body">
            ${project.githubRepoUrl ? `
              <div style="padding: var(--space-4); background: var(--color-success-light); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
                  <svg width="20" height="20" fill="var(--color-success)" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                  <span style="font-weight: var(--font-medium); color: var(--color-success);">Connected to GitHub</span>
                </div>
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
                  <a href="${project.githubRepoUrl}" target="_blank" style="color: var(--color-primary); text-decoration: underline;">
                    ${project.githubRepoUrl}
                  </a>
                </div>
              </div>
            ` : `
              <div style="padding: var(--space-4); background: var(--color-bg-tertiary); border-radius: var(--radius-lg); margin-bottom: var(--space-4);">
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
                  No GitHub repository connected
                </div>
              </div>
              <button id="connectGitHubBtn" class="btn btn-secondary">Connect GitHub Repository</button>
            `}
          </div>
        </section>

        <!-- Sandbox Settings -->
        <section class="card" style="margin-bottom: var(--space-6);">
          <h3 class="card-title">E2B Sandbox</h3>
          <div class="card-body">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background: var(--color-bg-secondary); border-radius: var(--radius-lg);">
              <div>
                <div style="font-weight: var(--font-medium);">Sandbox Status</div>
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
                  ${project.sandboxStatus === 'active' ? '🟢 Active' : '⚪ Inactive'}
                </div>
              </div>
              ${project.sandboxStatus === 'active' ? `
                <button id="closeSandboxBtn" class="btn btn-sm btn-danger">Close Sandbox</button>
              ` : `
                <button id="createSandboxBtn" class="btn btn-sm btn-success">Create Sandbox</button>
              `}
            </div>
          </div>
        </section>

        <!-- Danger Zone -->
        <section class="card" style="border-color: var(--color-error);">
          <h3 class="card-title" style="color: var(--color-error);">Danger Zone</h3>
          <div class="card-body">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); background: var(--color-error-light); border-radius: var(--radius-lg);">
              <div>
                <div style="font-weight: var(--font-medium);">Delete Project</div>
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
                  Permanently delete this project and all associated data
                </div>
              </div>
              <button id="deleteProjectBtn" class="btn btn-danger">Delete</button>
            </div>
          </div>
        </section>
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Save project
    const saveBtn = this.container.querySelector('#saveProjectBtn');
    this.addEventListener(saveBtn, 'click', () => this.saveProject());

    // Sandbox controls
    const createSandboxBtn = this.container.querySelector('#createSandboxBtn');
    const closeSandboxBtn = this.container.querySelector('#closeSandboxBtn');

    if (createSandboxBtn) {
      this.addEventListener(createSandboxBtn, 'click', () => this.createSandbox());
    }

    if (closeSandboxBtn) {
      this.addEventListener(closeSandboxBtn, 'click', () => this.closeSandbox());
    }

    // Delete project
    const deleteBtn = this.container.querySelector('#deleteProjectBtn');
    this.addEventListener(deleteBtn, 'click', () => this.deleteProject());

    // Connect GitHub
    const connectGitHubBtn = this.container.querySelector('#connectGitHubBtn');
    if (connectGitHubBtn) {
      this.addEventListener(connectGitHubBtn, 'click', () => this.connectGitHub());
    }
  }

  async saveProject() {
    const name = this.container.querySelector('#projectName').value.trim();
    const description = this.container.querySelector('#projectDescription').value.trim();

    if (!name) {
      toast.error('Project name is required');
      return;
    }

    try {
      await api.patch(`/projects/${this.project.id}`, {
        name,
        description: description || undefined
      });

      // Update store
      store.setState({
        project: { ...this.project, name, description }
      });

      toast.success('Project updated');
    } catch (error) {
      toast.error('Failed to update project');
    }
  }

  async createSandbox() {
    try {
      const data = await api.post(`/projects/${this.project.id}/sandbox`);

      toast.success('Sandbox created');

      // Update project
      store.setState({
        project: { ...this.project, sandboxStatus: 'active', sandboxId: data.sandboxId }
      });

      await this.render();
    } catch (error) {
      toast.error('Failed to create sandbox');
    }
  }

  async closeSandbox() {
    const confirmed = await confirmModal({
      title: 'Close Sandbox?',
      message: 'This will shut down the E2B sandbox. You can create a new one anytime.',
      confirmText: 'Close Sandbox',
      confirmType: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.delete(`/projects/${this.project.id}/sandbox`);

      toast.success('Sandbox closed');

      // Update project
      store.setState({
        project: { ...this.project, sandboxStatus: 'inactive' }
      });

      await this.render();
    } catch (error) {
      toast.error('Failed to close sandbox');
    }
  }

  async deleteProject() {
    const confirmed = await confirmModal({
      title: 'Delete Project?',
      message: `This will permanently delete "${this.project.name}" and all associated data. This action cannot be undone.`,
      confirmText: 'Delete Project',
      confirmType: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.delete(`/projects/${this.project.id}`);

      toast.success('Project deleted');

      setTimeout(() => {
        window.location.href = '/projects.html';
      }, 1000);
    } catch (error) {
      toast.error('Failed to delete project');
    }
  }

  async connectGitHub() {
    const repoUrl = prompt('Enter GitHub repository URL:');
    if (!repoUrl) return;

    try {
      await api.post(`/projects/${this.project.id}/github`, { repoUrl });

      toast.success('GitHub repository connected');

      // Update project
      store.setState({
        project: { ...this.project, githubRepoUrl: repoUrl }
      });

      await this.render();
    } catch (error) {
      toast.error('Failed to connect repository');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

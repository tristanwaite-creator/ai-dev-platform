/**
 * Research View Component
 * Manages research sessions and AI-assisted note-taking
 */

import { BaseView } from '../components/tabs.js';
import { api } from '../core/api.js';
import { store } from '../core/state.js';
import { toast } from '../components/toast.js';

export default class ResearchView extends BaseView {
  constructor(container) {
    super(container);
    this.currentSessionId = null;
    this.projectId = store.get('projectId');
  }

  async render() {
    console.log('ResearchView: Starting render');

    this.container.innerHTML = `
      <div class="research-container" style="display: flex; height: 100%; min-height: 600px;">
        <!-- Sessions Sidebar -->
        <div class="research-sidebar" style="width: 280px; border-right: 1px solid var(--color-border); overflow-y: auto; padding: var(--space-4); background: var(--color-bg-primary);">
          <button id="newSessionBtn" class="btn btn-primary" style="width: 100%; margin-bottom: var(--space-4);">
            + New Session
          </button>
          <div id="sessionsList"></div>
        </div>

        <!-- Chat Area -->
        <div class="research-main" style="flex: 1; display: flex; flex-direction: column; background: var(--color-bg-secondary);">
          <div class="research-header" style="padding: var(--space-4); border-bottom: 1px solid var(--color-border); display: none; background: var(--color-bg-primary);" id="sessionActions">
            <h2 id="sessionTitle" style="margin: 0; font-size: var(--text-lg);">Select a session</h2>
            <div style="display: flex; gap: var(--space-2); margin-top: var(--space-2);">
              <button id="convertTaskBtn" class="btn btn-sm btn-secondary">Convert to Task</button>
              <button id="generateDocBtn" class="btn btn-sm btn-ghost">Generate Document</button>
            </div>
          </div>

          <div id="chatMessages" style="flex: 1; overflow-y: auto; padding: var(--space-4);">
            <div class="empty-state">
              <div class="empty-state-icon">📚</div>
              <h3 class="empty-state-title">Research Hub</h3>
              <p class="empty-state-description">Create a session to start researching and documenting your ideas</p>
            </div>
          </div>

          <div id="chatInputContainer" style="padding: var(--space-4); border-top: 1px solid var(--color-border); display: none; background: var(--color-bg-primary);">
            <form id="chatForm" style="display: flex; gap: var(--space-2);">
              <input
                type="text"
                id="chatInput"
                class="form-input"
                placeholder="Ask Claude about your project..."
                style="flex: 1;"
                required
              />
              <button type="submit" id="sendBtn" class="btn btn-primary">Send</button>
            </form>
          </div>
        </div>
      </div>
    `;

    await this.loadSessions();
    this.setupEventListeners();

    console.log('ResearchView: Render complete');
  }

  setupEventListeners() {
    // New session
    const newSessionBtn = this.container.querySelector('#newSessionBtn');
    this.addEventListener(newSessionBtn, 'click', () => this.createSession());

    // Chat form
    const chatForm = this.container.querySelector('#chatForm');
    this.addEventListener(chatForm, 'submit', (e) => {
      e.preventDefault();
      const input = this.container.querySelector('#chatInput');
      if (input.value.trim()) {
        this.sendMessage(input.value.trim());
      }
    });

    // Action buttons
    const convertBtn = this.container.querySelector('#convertTaskBtn');
    const genDocBtn = this.container.querySelector('#generateDocBtn');

    this.addEventListener(convertBtn, 'click', () => this.convertToTask());
    this.addEventListener(genDocBtn, 'click', () => this.generateDocument());
  }

  async loadSessions() {
    const sessions = store.get('researchSessions') || [];
    const sessionsList = this.container.querySelector('#sessionsList');

    if (sessions.length === 0) {
      sessionsList.innerHTML = '<div class="text-center p-4 text-secondary">No sessions yet</div>';
      return;
    }

    sessionsList.innerHTML = sessions.map(s => `
      <div class="session-item card hover-lift" style="padding: var(--space-3); margin-bottom: var(--space-2); cursor: pointer;" data-session-id="${s.id}">
        <div style="font-weight: var(--font-medium); margin-bottom: var(--space-1);">${this.escapeHtml(s.title)}</div>
        ${s.description ? `<div style="font-size: var(--text-sm); color: var(--color-text-secondary); font-style: italic;">${this.escapeHtml(s.description)}</div>` : ''}
        <div style="font-size: var(--text-xs); color: var(--color-text-tertiary); margin-top: var(--space-2);">
          ${s._count?.messages || 0} messages
        </div>
      </div>
    `).join('');

    // Add click handlers
    sessionsList.querySelectorAll('.session-item').forEach(item => {
      this.addEventListener(item, 'click', () => {
        this.selectSession(item.dataset.sessionId);
      });
    });
  }

  async selectSession(sessionId) {
    this.currentSessionId = sessionId;

    try {
      const data = await api.get(`/research/${sessionId}`);
      const session = data.session;

      // Update UI
      this.container.querySelector('#sessionTitle').textContent = session.title;
      this.container.querySelector('#sessionActions').style.display = 'block';
      this.container.querySelector('#chatInputContainer').style.display = 'block';

      this.displayMessages(session.messages || []);
    } catch (error) {
      toast.error('Failed to load session');
    }
  }

  displayMessages(messages) {
    const chatMessages = this.container.querySelector('#chatMessages');

    if (messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <h3 class="empty-state-title">Start the conversation</h3>
          <p class="empty-state-description">Ask Claude about your project ideas</p>
        </div>
      `;
      return;
    }

    chatMessages.innerHTML = messages.map(msg => `
      <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
        <div style="width: 2rem; height: 2rem; border-radius: var(--radius-full); background: var(--color-${msg.role === 'user' ? 'primary' : 'secondary'}-light); display: flex; align-items: center; justify-content: center;">
          ${msg.role === 'user' ? '👤' : '🤖'}
        </div>
        <div style="flex: 1;">
          <div style="font-weight: var(--font-medium); margin-bottom: var(--space-1);">${msg.role === 'user' ? 'You' : 'Claude'}</div>
          <div style="color: var(--color-text-secondary);">${this.escapeHtml(msg.content)}</div>
        </div>
      </div>
    `).join('');

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async sendMessage(message) {
    if (!this.currentSessionId) return;

    const chatMessages = this.container.querySelector('#chatMessages');
    const chatInput = this.container.querySelector('#chatInput');
    const sendBtn = this.container.querySelector('#sendBtn');

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      // Add user message
      chatMessages.innerHTML += `
        <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div style="width: 2rem; height: 2rem; border-radius: var(--radius-full); background: var(--color-primary-light); display: flex; align-items: center; justify-content: center;">👤</div>
          <div style="flex: 1;">
            <div style="font-weight: var(--font-medium); margin-bottom: var(--space-1);">You</div>
            <div style="color: var(--color-text-secondary);">${this.escapeHtml(message)}</div>
          </div>
        </div>
      `;

      const loadingId = 'loading-' + Date.now();
      chatMessages.innerHTML += `
        <div id="${loadingId}" style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div style="width: 2rem; height: 2rem; border-radius: var(--radius-full); background: var(--color-secondary-light); display: flex; align-items: center; justify-content: center;">🤖</div>
          <div style="flex: 1;">
            <div style="font-weight: var(--font-medium); margin-bottom: var(--space-1);">Claude</div>
            <div class="spinner spinner-sm"></div>
          </div>
        </div>
      `;

      chatMessages.scrollTop = chatMessages.scrollHeight;

      const data = await api.post(`/research/${this.currentSessionId}/chat`, { message });

      // Remove loading
      this.container.querySelector(`#${loadingId}`).remove();

      // Add response
      chatMessages.innerHTML += `
        <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div style="width: 2rem; height: 2rem; border-radius: var(--radius-full); background: var(--color-secondary-light); display: flex; align-items: center; justify-content: center;">🤖</div>
          <div style="flex: 1;">
            <div style="font-weight: var(--font-medium); margin-bottom: var(--space-1);">Claude</div>
            <div style="color: var(--color-text-secondary);">${this.escapeHtml(data.response)}</div>
          </div>
        </div>
      `;

      chatMessages.scrollTop = chatMessages.scrollHeight;
      chatInput.value = '';

      if (data.sessionTitle) {
        this.container.querySelector('#sessionTitle').textContent = data.sessionTitle;
        await this.loadSessions();
      }
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  }

  async createSession() {
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

    try {
      const data = await api.post(`/projects/${this.projectId}/research`, {
        title: `Research Session - ${timestamp}`,
        description: 'Start chatting to auto-generate...',
        type: 'research'
      });

      // Reload sessions
      const projectData = await api.get(`/projects/${this.projectId}/view`);
      store.setState({ researchSessions: projectData.researchSessions });

      await this.loadSessions();
      await this.selectSession(data.session.id);

      toast.success('Session created');
    } catch (error) {
      toast.error('Failed to create session');
    }
  }

  async convertToTask() {
    if (!this.currentSessionId) return;

    try {
      const data = await api.post(`/research/${this.currentSessionId}/convert-to-task`);
      toast.success('Converted to task! Switch to Kanban to see it.');
    } catch (error) {
      toast.error('Failed to convert to task');
    }
  }

  async generateDocument() {
    if (!this.currentSessionId) return;

    try {
      await api.post(`/research/${this.currentSessionId}/generate-document`, {
        format: 'markdown'
      });
      toast.success('Document generated!');
    } catch (error) {
      toast.error('Failed to generate document');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

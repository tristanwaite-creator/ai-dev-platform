/**
 * AI Assistant Bubble Component
 * Floating assistant inspired by Notion AI
 */

import { api } from '../core/api.js';

export class AIAssistantBubble {
  constructor(projectId, onSessionCreated) {
    this.projectId = projectId;
    this.sessionId = null;
    this.isOpen = false;
    this.isLoading = false;
    this.onSessionCreated = onSessionCreated;
    this.messages = [];
  }

  /**
   * Initialize the assistant (create session)
   */
  async initialize() {
    try {
      const data = await api.post(`/projects/${this.projectId}/agent/session`, {});
      this.sessionId = data.sessionId;

      console.log('🤖 Agent session created:', this.sessionId);

      if (this.onSessionCreated) {
        this.onSessionCreated(this.sessionId);
      }

      return this.sessionId;
    } catch (error) {
      console.error('Failed to initialize agent:', error);
      throw error;
    }
  }

  /**
   * Render the component
   */
  render() {
    const bubbleHTML = `
      <style>
        /* Floating Bubble */
        .ai-assistant-bubble {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 10000;
        }

        .ai-bubble-button {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4), 0 2px 4px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          transition: all 0.3s ease;
          position: relative;
        }

        .ai-bubble-button:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5), 0 3px 6px rgba(0, 0, 0, 0.15);
        }

        .ai-bubble-button:active {
          transform: scale(0.95);
        }

        .ai-bubble-button.active {
          background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
        }

        .ai-bubble-pulse {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: inherit;
          opacity: 0.6;
          animation: pulse 2s ease-out infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.1); opacity: 0.3; }
          100% { transform: scale(1.2); opacity: 0; }
        }

        /* Chat Panel */
        .ai-chat-panel {
          position: absolute;
          bottom: 70px;
          right: 0;
          width: 380px;
          max-height: 600px;
          background: var(--bg-card, #1a1a24);
          border-radius: 16px;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
          display: none;
          flex-direction: column;
          overflow: hidden;
          animation: slideUp 0.3s ease-out;
        }

        .ai-chat-panel.open {
          display: flex;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Header */
        .ai-chat-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ai-chat-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ai-chat-icon {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .ai-chat-title {
          color: var(--text-primary, #ffffff);
          font-size: 16px;
          font-weight: 600;
        }

        .ai-chat-subtitle {
          color: var(--text-secondary, #a0a0b0);
          font-size: 12px;
        }

        .ai-chat-close {
          background: transparent;
          border: none;
          color: var(--text-secondary, #a0a0b0);
          cursor: pointer;
          font-size: 20px;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
        }

        .ai-chat-close:hover {
          color: var(--text-primary, #ffffff);
        }

        /* Messages */
        .ai-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ai-chat-messages::-webkit-scrollbar {
          width: 6px;
        }

        .ai-chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .ai-chat-messages::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }

        .ai-chat-messages::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .ai-message {
          display: flex;
          gap: 12px;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ai-message-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        .ai-message-avatar.assistant {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .ai-message-avatar.user {
          background: rgba(255, 255, 255, 0.1);
        }

        .ai-message-content {
          flex: 1;
          color: var(--text-primary, #ffffff);
          font-size: 14px;
          line-height: 1.6;
        }

        .ai-message-content p {
          margin: 0 0 8px 0;
        }

        .ai-message-content p:last-child {
          margin-bottom: 0;
        }

        /* Welcome */
        .ai-welcome {
          text-align: center;
          padding: 12px 0;
        }

        .ai-welcome-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .ai-welcome-title {
          color: var(--text-primary, #ffffff);
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .ai-welcome-text {
          color: var(--text-secondary, #a0a0b0);
          font-size: 13px;
          line-height: 1.5;
        }

        /* Quick Actions */
        .ai-quick-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .ai-quick-action {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 12px;
          color: var(--text-primary, #ffffff);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ai-quick-action:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--accent, #6366f1);
          transform: translateX(4px);
        }

        .ai-quick-action-icon {
          font-size: 18px;
        }

        /* Typing Indicator */
        .ai-typing {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-secondary, #a0a0b0);
          font-size: 13px;
          font-style: italic;
        }

        .ai-typing-text {
          animation: fadeInOut 2s ease-in-out infinite;
        }

        @keyframes fadeInOut {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        /* Tool Activity */
        .ai-tool-activity {
          background: rgba(102, 126, 234, 0.1);
          border: 1px solid rgba(102, 126, 234, 0.2);
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: var(--text-secondary, #a0a0b0);
          animation: fadeIn 0.3s ease-out;
        }

        .ai-tool-icon {
          font-size: 16px;
          animation: pulse 2s ease-in-out infinite;
        }

        .ai-tool-name {
          font-weight: 500;
          color: var(--text-primary, #ffffff);
        }

        .ai-tool-status {
          margin-left: auto;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent, #6366f1);
          animation: pulse 2s ease-in-out infinite;
        }

        .ai-tool-status.complete {
          background: #10b981;
          animation: none;
        }

        /* Input Area */
        .ai-chat-input-area {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding: 16px;
        }

        .ai-chat-input-wrapper {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }

        .ai-chat-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 14px;
          color: var(--text-primary, #ffffff);
          font-size: 14px;
          font-family: inherit;
          resize: none;
          max-height: 120px;
          min-height: 42px;
          transition: all 0.2s;
        }

        .ai-chat-input:focus {
          outline: none;
          border-color: var(--accent, #6366f1);
          background: rgba(255, 255, 255, 0.08);
        }

        .ai-chat-input::placeholder {
          color: var(--text-secondary, #a0a0b0);
        }

        .ai-chat-send {
          background: var(--accent, #6366f1);
          border: none;
          border-radius: 10px;
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .ai-chat-send:hover:not(:disabled) {
          background: var(--accent-hover, #5558e3);
          transform: scale(1.05);
        }

        .ai-chat-send:active:not(:disabled) {
          transform: scale(0.95);
        }

        .ai-chat-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .ai-chat-send-icon {
          font-size: 20px;
        }
      </style>

      <div class="ai-assistant-bubble" id="aiAssistantBubble">
        <!-- Floating Button -->
        <button class="ai-bubble-button" id="aiBubbleButton" title="AI Assistant">
          <div class="ai-bubble-pulse"></div>
          ✨
        </button>

        <!-- Chat Panel -->
        <div class="ai-chat-panel" id="aiChatPanel">
          <!-- Header -->
          <div class="ai-chat-header">
            <div class="ai-chat-header-left">
              <div class="ai-chat-icon">✨</div>
              <div>
                <div class="ai-chat-title">AI Assistant</div>
                <div class="ai-chat-subtitle">Workspace helper</div>
              </div>
            </div>
            <button class="ai-chat-close" id="aiChatClose">×</button>
          </div>

          <!-- Messages -->
          <div class="ai-chat-messages" id="aiChatMessages">
            <div class="ai-welcome">
              <div class="ai-welcome-icon">👋</div>
              <div class="ai-welcome-title">Hi! I'm your AI assistant</div>
              <div class="ai-welcome-text">
                I can help you organize notes, create summaries, and navigate your workspace.
              </div>
            </div>

            <div class="ai-quick-actions">
              <button class="ai-quick-action" data-action="list">
                <span class="ai-quick-action-icon">📋</span>
                List all pages
              </button>
              <button class="ai-quick-action" data-action="search">
                <span class="ai-quick-action-icon">🔍</span>
                Search pages
              </button>
              <button class="ai-quick-action" data-action="summarize">
                <span class="ai-quick-action-icon">📝</span>
                Create a summary
              </button>
            </div>
          </div>

          <!-- Input Area -->
          <div class="ai-chat-input-area">
            <div class="ai-chat-input-wrapper">
              <textarea
                class="ai-chat-input"
                id="aiChatInput"
                placeholder="Ask me anything about your workspace..."
                rows="1"
              ></textarea>
              <button class="ai-chat-send" id="aiChatSend">
                <span class="ai-chat-send-icon">↑</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    return bubbleHTML;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    console.log('🔧 Attaching AI Assistant event listeners...');

    const bubbleButton = document.getElementById('aiBubbleButton');
    const chatPanel = document.getElementById('aiChatPanel');
    const closeButton = document.getElementById('aiChatClose');
    const sendButton = document.getElementById('aiChatSend');
    const input = document.getElementById('aiChatInput');
    const quickActions = document.querySelectorAll('.ai-quick-action');

    console.log('Found elements:', {
      bubbleButton: !!bubbleButton,
      chatPanel: !!chatPanel,
      closeButton: !!closeButton,
      sendButton: !!sendButton,
      input: !!input,
      quickActions: quickActions.length
    });

    if (!bubbleButton) {
      console.error('❌ AI bubble button not found!');
      return;
    }

    // Toggle panel
    bubbleButton.addEventListener('click', (e) => {
      console.log('✨ Bubble button clicked!');
      e.preventDefault();
      e.stopPropagation();
      this.togglePanel();
    });

    closeButton?.addEventListener('click', () => this.closePanel());

    // Send message
    sendButton?.addEventListener('click', () => this.sendMessage());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    input?.addEventListener('input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
    });

    // Quick actions
    quickActions.forEach(action => {
      action.addEventListener('click', () => {
        const actionType = action.dataset.action;
        this.handleQuickAction(actionType);
      });
    });
  }

  /**
   * Toggle panel open/closed
   */
  async togglePanel() {
    console.log('🎯 togglePanel called, isOpen:', this.isOpen, 'sessionId:', this.sessionId);

    try {
      if (!this.sessionId) {
        console.log('🔄 Initializing agent session...');
        await this.initialize();
        console.log('✅ Session initialized:', this.sessionId);
      }

      this.isOpen = !this.isOpen;
      console.log('📍 New isOpen state:', this.isOpen);

      const panel = document.getElementById('aiChatPanel');
      const button = document.getElementById('aiBubbleButton');

      console.log('Found DOM elements:', { panel: !!panel, button: !!button });

      if (this.isOpen) {
        panel?.classList.add('open');
        button?.classList.add('active');
        console.log('✅ Panel opened');
        // Focus input
        setTimeout(() => {
          document.getElementById('aiChatInput')?.focus();
        }, 300);
      } else {
        panel?.classList.remove('open');
        button?.classList.remove('active');
        console.log('✅ Panel closed');
      }
    } catch (error) {
      console.error('❌ Error in togglePanel:', error);
    }
  }

  /**
   * Close panel
   */
  closePanel() {
    this.isOpen = false;
    document.getElementById('aiChatPanel')?.classList.remove('open');
    document.getElementById('aiBubbleButton')?.classList.remove('active');
  }

  /**
   * Handle quick actions
   */
  handleQuickAction(actionType) {
    const prompts = {
      list: 'Please list all pages in this workspace',
      search: 'Help me search for something',
      summarize: 'Create a summary of my recent pages',
    };

    const prompt = prompts[actionType];
    if (prompt) {
      document.getElementById('aiChatInput').value = prompt;
      this.sendMessage();
    }
  }

  /**
   * Send message to agent (with SSE streaming)
   */
  async sendMessage() {
    const input = document.getElementById('aiChatInput');
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    // Add user message to UI
    this.addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // Show initial typing indicator
    this.showTyping('Gauging intent and crafting response...');

    try {
      this.isLoading = true;

      // Get token using the same method as api client
      const token = localStorage.getItem('github_session') || localStorage.getItem('accessToken');

      if (!token) {
        console.error('❌ No auth token found');
        this.hideTyping();
        this.addMessage('assistant', 'Please log in to use the AI Assistant.');
        return;
      }

      console.log('🔌 Connecting to AI agent with streaming...');
      const response = await fetch(`/api/agent/${this.sessionId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message, stream: true }),
      });

      console.log('📡 Response status:', response.status, response.statusText);
      console.log('📡 Response headers:', response.headers.get('content-type'));

      if (response.status === 401) {
        // Token expired, redirect to login
        console.error('❌ Token expired, please log in again');
        this.hideTyping();
        this.addMessage('assistant', 'Your session has expired. Please log in again.');

        // Clean up and redirect
        localStorage.removeItem('github_session');
        localStorage.removeItem('github_username');
        localStorage.removeItem('accessToken');

        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error:', errorText);
        throw new Error(`Failed to connect to agent: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentToolId = null;
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            const data = JSON.parse(line.substring(5));

            if (currentEvent === 'status') {
              // Update status text
              this.updateTypingText(data.status || 'Thinking...');
            } else if (currentEvent === 'tool_start') {
              this.hideTyping();
              currentToolId = this.showToolActivity(data.tool, data.input);
            } else if (currentEvent === 'tool_complete') {
              this.updateToolActivity(currentToolId, true);
              this.showTyping('Analyzing results...');
            } else if (currentEvent === 'complete') {
              this.hideTyping();
              this.hideAllToolActivity();
              this.addMessage('assistant', data.message);
            } else if (currentEvent === 'error') {
              this.hideTyping();
              this.hideAllToolActivity();
              this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
            }

            // Reset event type after processing
            currentEvent = '';
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      this.hideTyping();
      this.hideAllToolActivity();
      this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Add message to chat
   */
  addMessage(role, content) {
    const messagesContainer = document.getElementById('aiChatMessages');
    const messageHTML = `
      <div class="ai-message">
        <div class="ai-message-avatar ${role}">
          ${role === 'assistant' ? '✨' : '👤'}
        </div>
        <div class="ai-message-content">
          ${this.formatMessage(content)}
        </div>
      </div>
    `;

    // Remove welcome if this is the first message
    const welcome = messagesContainer?.querySelector('.ai-welcome');
    const quickActions = messagesContainer?.querySelector('.ai-quick-actions');
    if (welcome) welcome.remove();
    if (quickActions) quickActions.remove();

    messagesContainer?.insertAdjacentHTML('beforeend', messageHTML);
    messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  }

  /**
   * Format message content
   */
  formatMessage(content) {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Show typing indicator with status text
   */
  showTyping(statusText = 'Thinking...') {
    const messagesContainer = document.getElementById('aiChatMessages');

    // Remove existing typing indicator
    this.hideTyping();

    const typingHTML = `
      <div class="ai-message ai-typing-indicator">
        <div class="ai-message-avatar assistant">✨</div>
        <div class="ai-typing">
          <div class="ai-typing-text">${statusText}</div>
        </div>
      </div>
    `;

    messagesContainer?.insertAdjacentHTML('beforeend', typingHTML);
    messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
  }

  /**
   * Update typing indicator text
   */
  updateTypingText(statusText) {
    const typingText = document.querySelector('.ai-typing-text');
    if (typingText) {
      typingText.textContent = statusText;
    }
  }

  /**
   * Hide typing indicator
   */
  hideTyping() {
    document.querySelector('.ai-typing-indicator')?.remove();
  }

  /**
   * Show tool activity indicator
   */
  showToolActivity(toolName, input) {
    const messagesContainer = document.getElementById('aiChatMessages');
    const toolId = `tool-${Date.now()}`;

    // Map tool names to friendly labels and icons
    const toolLabels = {
      search_web: { label: 'Searching the web', icon: '🔍' },
      list_pages: { label: 'Listing pages', icon: '📋' },
      read_page: { label: 'Reading page', icon: '📖' },
      create_page: { label: 'Creating page', icon: '📄' },
      update_page: { label: 'Updating page', icon: '✏️' },
      search_pages: { label: 'Searching pages', icon: '🔎' },
      create_folder: { label: 'Creating folder', icon: '📁' },
    };

    const toolInfo = toolLabels[toolName] || { label: toolName, icon: '🔧' };

    const activityHTML = `
      <div class="ai-tool-activity" id="${toolId}">
        <span class="ai-tool-icon">${toolInfo.icon}</span>
        <span class="ai-tool-name">${toolInfo.label}</span>
        <span class="ai-tool-status"></span>
      </div>
    `;

    messagesContainer?.insertAdjacentHTML('beforeend', activityHTML);
    messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });

    return toolId;
  }

  /**
   * Update tool activity status
   */
  updateToolActivity(toolId, complete = true) {
    const toolElement = document.getElementById(toolId);
    if (!toolElement) return;

    const statusDot = toolElement.querySelector('.ai-tool-status');
    if (statusDot && complete) {
      statusDot.classList.add('complete');
    }

    // Remove after a delay
    if (complete) {
      setTimeout(() => {
        toolElement?.remove();
      }, 2000);
    }
  }

  /**
   * Hide all tool activities
   */
  hideAllToolActivity() {
    document.querySelectorAll('.ai-tool-activity').forEach(el => el.remove());
  }
}

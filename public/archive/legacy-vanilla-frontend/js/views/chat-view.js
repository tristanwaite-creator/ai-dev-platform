/**
 * Chat View Component
 * Central conversational AI interface for brainstorming and ideation
 * Can push chat content to Notes or Kanban board
 */

import { BaseView } from '../components/tabs.js';
import { api } from '../core/api.js';
import { store } from '../core/state.js';
import { toast } from '../components/toast.js';

export default class ChatView extends BaseView {
  constructor(container) {
    super(container);
    this.projectId = store.get('projectId');
    this.sessionId = null;
    this.messages = [];
    this.isLoading = false;
    this.selectedMessages = new Set();
  }

  async render() {
    this.container.innerHTML = `
      <style>
        .chat-view-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-dark, #0a0a0f);
        }

        .chat-header {
          padding: 16px 24px;
          border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-card, #1a1a24);
        }

        .chat-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .chat-header-icon {
          font-size: 24px;
        }

        .chat-header-info h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary, #ffffff);
        }

        .chat-header-info p {
          margin: 2px 0 0 0;
          font-size: 13px;
          color: var(--text-secondary, #a0a0b0);
        }

        .chat-header-actions {
          display: flex;
          gap: 8px;
        }

        .chat-action-btn {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 8px;
          color: var(--text-primary, #ffffff);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .chat-action-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--accent, #6366f1);
        }

        .chat-action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .chat-message {
          display: flex;
          gap: 12px;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .chat-message.user {
          flex-direction: row-reverse;
        }

        .chat-message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .chat-message-avatar.assistant {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .chat-message-avatar.user {
          background: rgba(255, 255, 255, 0.1);
        }

        .chat-message-content {
          flex: 1;
          max-width: 70%;
        }

        .chat-message.user .chat-message-content {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .chat-message-bubble {
          padding: 12px 16px;
          border-radius: 16px;
          color: var(--text-primary, #ffffff);
          font-size: 14px;
          line-height: 1.6;
          word-wrap: break-word;
        }

        .chat-message.assistant .chat-message-bubble {
          background: var(--bg-card, #1a1a24);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        }

        .chat-message.user .chat-message-bubble {
          background: var(--accent, #6366f1);
          color: #ffffff;
        }

        .chat-message-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .message-action-btn {
          padding: 4px 8px;
          background: transparent;
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 6px;
          color: var(--text-secondary, #a0a0b0);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .message-action-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary, #ffffff);
          border-color: var(--accent, #6366f1);
        }

        .chat-welcome {
          text-align: center;
          padding: 48px 24px;
          color: var(--text-secondary, #a0a0b0);
        }

        .chat-welcome-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .chat-welcome h2 {
          color: var(--text-primary, #ffffff);
          margin-bottom: 8px;
          font-size: 24px;
        }

        .chat-suggestions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-top: 24px;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        .chat-suggestion {
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }

        .chat-suggestion:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--accent, #6366f1);
          transform: translateY(-2px);
        }

        .chat-suggestion-icon {
          font-size: 20px;
          margin-bottom: 8px;
        }

        .chat-suggestion-text {
          font-size: 13px;
          color: var(--text-primary, #ffffff);
        }

        .chat-input-area {
          padding: 16px 24px;
          border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          background: var(--bg-card, #1a1a24);
        }

        .chat-input-wrapper {
          display: flex;
          gap: 12px;
          align-items: flex-end;
          max-width: 900px;
          margin: 0 auto;
        }

        .chat-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 16px;
          padding: 12px 16px;
          color: var(--text-primary, #ffffff);
          font-size: 15px;
          font-family: inherit;
          resize: none;
          max-height: 200px;
          min-height: 48px;
          transition: all 0.2s;
        }

        .chat-input:focus {
          outline: none;
          border-color: var(--accent, #6366f1);
          background: rgba(255, 255, 255, 0.08);
        }

        .chat-input::placeholder {
          color: var(--text-secondary, #a0a0b0);
        }

        .chat-send-btn {
          width: 48px;
          height: 48px;
          background: var(--accent, #6366f1);
          border: none;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
          font-size: 20px;
        }

        .chat-send-btn:hover:not(:disabled) {
          background: var(--accent-hover, #5558e3);
          transform: scale(1.05);
        }

        .chat-send-btn:active:not(:disabled) {
          transform: scale(0.95);
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-typing {
          display: flex;
          gap: 12px;
          padding: 12px 0;
        }

        .chat-typing-dots {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-card, #1a1a24);
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 16px;
        }

        .typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-secondary, #a0a0b0);
          animation: typingDot 1.4s infinite ease-in-out;
        }

        .typing-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-10px); }
        }

        .chat-messages::-webkit-scrollbar {
          width: 8px;
        }

        .chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        .chat-messages::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      </style>
      <div class="chat-view-container">
        <div class="chat-header">
          <div class="chat-header-left">
            <div class="chat-header-icon">💬</div>
            <div class="chat-header-info">
              <h2>Chat & Brainstorm</h2>
              <p>Ideate with AI and add to your workspace</p>
            </div>
          </div>
          <div class="chat-header-actions">
            <button class="chat-action-btn" id="newChatBtn">
              🔄 New Chat
            </button>
            <button class="chat-action-btn" id="addToNotesBtn" disabled>
              📝 Add to Notes
            </button>
            <button class="chat-action-btn" id="addToBoardBtn" disabled>
              📋 Add to Board
            </button>
          </div>
        </div>

        <div class="chat-messages" id="chatMessages">
          <div class="chat-welcome">
            <div class="chat-welcome-icon">💡</div>
            <h2>Let's brainstorm together</h2>
            <p>Chat with AI to explore ideas, plan features, or get help with your project</p>
            
            <div class="chat-suggestions">
              <div class="chat-suggestion" data-prompt="Help me brainstorm features for my app">
                <div class="chat-suggestion-icon">🎨</div>
                <div class="chat-suggestion-text">Brainstorm features</div>
              </div>
              <div class="chat-suggestion" data-prompt="Help me plan the architecture for this project">
                <div class="chat-suggestion-icon">🏗️</div>
                <div class="chat-suggestion-text">Plan architecture</div>
              </div>
              <div class="chat-suggestion" data-prompt="What should I build next?">
                <div class="chat-suggestion-icon">🤔</div>
                <div class="chat-suggestion-text">Get suggestions</div>
              </div>
              <div class="chat-suggestion" data-prompt="Help me write documentation for my project">
                <div class="chat-suggestion-icon">📚</div>
                <div class="chat-suggestion-text">Write docs</div>
              </div>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <div class="chat-input-wrapper">
            <textarea
              class="chat-input"
              id="chatInput"
              placeholder="Type your message..."
              rows="1"
            ></textarea>
            <button class="chat-send-btn" id="chatSendBtn">
              ↑
            </button>
          </div>
        </div>
      </div>
    `;

    await this.initialize();
    this.setupEventListeners();
  }

  async initialize() {
    try {
      const data = await api.post(`/projects/${this.projectId}/agent/session`, {});
      this.sessionId = data.sessionId;
      console.log('💬 Chat session created:', this.sessionId);
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      toast.error('Failed to initialize chat');
    }
  }

  setupEventListeners() {
    const chatInput = this.container.querySelector('#chatInput');
    const sendBtn = this.container.querySelector('#chatSendBtn');
    const newChatBtn = this.container.querySelector('#newChatBtn');
    const addToNotesBtn = this.container.querySelector('#addToNotesBtn');
    const addToBoardBtn = this.container.querySelector('#addToBoardBtn');

    // Send message
    this.addEventListener(sendBtn, 'click', () => this.sendMessage());
    this.addEventListener(chatInput, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    this.addEventListener(chatInput, 'input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
    });

    // Suggestions
    const suggestions = this.container.querySelectorAll('.chat-suggestion');
    suggestions.forEach(suggestion => {
      this.addEventListener(suggestion, 'click', () => {
        const prompt = suggestion.dataset.prompt;
        chatInput.value = prompt;
        this.sendMessage();
      });
    });

    // New chat
    this.addEventListener(newChatBtn, 'click', () => this.startNewChat());

    // Add to Notes
    this.addEventListener(addToNotesBtn, 'click', () => this.addToNotes());

    // Add to Board
    this.addEventListener(addToBoardBtn, 'click', () => this.addToBoard());
  }

  async sendMessage() {
    const input = this.container.querySelector('#chatInput');
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    // Add user message
    this.addMessage('user', message);
    this.messages.push({ role: 'user', content: message });
    
    input.value = '';
    input.style.height = 'auto';

    // Show typing indicator
    this.showTyping();

    try {
      this.isLoading = true;

      const token = localStorage.getItem('github_session') || localStorage.getItem('accessToken');
      if (!token) {
        this.hideTyping();
        this.addMessage('assistant', 'Please log in to use the chat.');
        return;
      }

      const response = await fetch(`/api/agent/${this.sessionId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to chat: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMessage = '';
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
              this.updateTypingText(data.status || 'Thinking...');
            } else if (currentEvent === 'complete') {
              this.hideTyping();
              assistantMessage = data.message;
              this.addMessage('assistant', assistantMessage);
              this.messages.push({ role: 'assistant', content: assistantMessage });
              this.enableActions();
            } else if (currentEvent === 'error') {
              this.hideTyping();
              this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
            }

            currentEvent = '';
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      this.hideTyping();
      this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  addMessage(role, content) {
    const messagesContainer = this.container.querySelector('#chatMessages');
    
    // Remove welcome on first message
    const welcome = messagesContainer.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const messageHTML = `
      <div class="chat-message ${role}">
        <div class="chat-message-avatar ${role}">
          ${role === 'assistant' ? '🤖' : '👤'}
        </div>
        <div class="chat-message-content">
          <div class="chat-message-bubble">
            ${this.formatMessage(content)}
          </div>
          ${role === 'assistant' ? `
            <div class="chat-message-actions">
              <button class="message-action-btn" data-action="copy">📋 Copy</button>
              <button class="message-action-btn" data-action="to-notes">📝 To Notes</button>
              <button class="message-action-btn" data-action="to-board">📊 To Board</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    messagesContainer.insertAdjacentHTML('beforeend', messageHTML);

    // Add action handlers for assistant messages
    if (role === 'assistant') {
      const lastMessage = messagesContainer.lastElementChild;
      const actionBtns = lastMessage.querySelectorAll('.message-action-btn');
      
      actionBtns.forEach(btn => {
        this.addEventListener(btn, 'click', () => {
          const action = btn.dataset.action;
          if (action === 'copy') {
            this.copyMessage(content);
          } else if (action === 'to-notes') {
            this.addMessageToNotes(content);
          } else if (action === 'to-board') {
            this.addMessageToBoard(content);
          }
        });
      });
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  formatMessage(content) {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">$1</code>')
      .replace(/\n/g, '<br>');
  }

  showTyping() {
    const messagesContainer = this.container.querySelector('#chatMessages');
    const typingHTML = `
      <div class="chat-typing" id="typingIndicator">
        <div class="chat-message-avatar assistant">🤖</div>
        <div class="chat-typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  updateTypingText(text) {
    const typingIndicator = this.container.querySelector('#typingIndicator');
    if (typingIndicator) {
      const dotsContainer = typingIndicator.querySelector('.chat-typing-dots');
      dotsContainer.innerHTML = `<div style="color: var(--text-secondary, #a0a0b0); font-size: 13px; font-style: italic;">${text}</div>`;
    }
  }

  hideTyping() {
    this.container.querySelector('#typingIndicator')?.remove();
  }

  enableActions() {
    const addToNotesBtn = this.container.querySelector('#addToNotesBtn');
    const addToBoardBtn = this.container.querySelector('#addToBoardBtn');
    
    if (this.messages.length > 0) {
      addToNotesBtn.disabled = false;
      addToBoardBtn.disabled = false;
    }
  }

  async copyMessage(content) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy');
    }
  }

  async addMessageToNotes(content) {
    try {
      // Create a new page with this content
      const title = content.substring(0, 50).trim() + (content.length > 50 ? '...' : '');
      
      const pageData = await api.post(`/projects/${this.projectId}/pages`, {
        title: 'Chat Notes - ' + new Date().toLocaleDateString(),
        icon: '💬',
        type: 'document',
      });

      // Create initial block with content
      await api.post(`/pages/${pageData.page.id}/blocks`, {
        type: 'text',
        content: { text: content },
        order: 0,
      });

      toast.success('Added to Notes! Click Notes tab to view.');
    } catch (error) {
      console.error('Failed to add to notes:', error);
      toast.error('Failed to add to notes');
    }
  }

  async addMessageToBoard(content) {
    try {
      // Extract a title (first line or first 50 chars)
      const lines = content.split('\n');
      const title = (lines[0] || content).substring(0, 100).trim();
      const description = content;

      const data = await api.post(`/projects/${this.projectId}/tasks`, {
        title,
        description,
        column: 'research'
      });

      toast.success('Added to Kanban Board! Check the Research column.');
    } catch (error) {
      console.error('Failed to add to board:', error);
      toast.error('Failed to add to board');
    }
  }

  async addToNotes() {
    // Get the last assistant message
    const lastAssistantMsg = [...this.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMsg) {
      toast.error('No assistant message to add');
      return;
    }

    await this.addMessageToNotes(lastAssistantMsg.content);
  }

  async addToBoard() {
    // Get the last assistant message
    const lastAssistantMsg = [...this.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMsg) {
      toast.error('No assistant message to add');
      return;
    }

    await this.addMessageToBoard(lastAssistantMsg.content);
  }

  async startNewChat() {
    if (!confirm('Start a new chat? Current conversation will be cleared.')) {
      return;
    }

    // Re-initialize session
    await this.initialize();
    
    // Clear messages
    this.messages = [];
    const messagesContainer = this.container.querySelector('#chatMessages');
    messagesContainer.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon">💡</div>
        <h2>Let's brainstorm together</h2>
        <p>Chat with AI to explore ideas, plan features, or get help with your project</p>
        
        <div class="chat-suggestions">
          <div class="chat-suggestion" data-prompt="Help me brainstorm features for my app">
            <div class="chat-suggestion-icon">🎨</div>
            <div class="chat-suggestion-text">Brainstorm features</div>
          </div>
          <div class="chat-suggestion" data-prompt="Help me plan the architecture for this project">
            <div class="chat-suggestion-icon">🏗️</div>
            <div class="chat-suggestion-text">Plan architecture</div>
          </div>
          <div class="chat-suggestion" data-prompt="What should I build next?">
            <div class="chat-suggestion-icon">🤔</div>
            <div class="chat-suggestion-text">Get suggestions</div>
          </div>
          <div class="chat-suggestion" data-prompt="Help me write documentation for my project">
            <div class="chat-suggestion-icon">📚</div>
            <div class="chat-suggestion-text">Write docs</div>
          </div>
        </div>
      </div>
    `;

    // Re-attach suggestion listeners
    const suggestions = this.container.querySelectorAll('.chat-suggestion');
    suggestions.forEach(suggestion => {
      this.addEventListener(suggestion, 'click', () => {
        const prompt = suggestion.dataset.prompt;
        this.container.querySelector('#chatInput').value = prompt;
        this.sendMessage();
      });
    });

    // Disable action buttons
    this.container.querySelector('#addToNotesBtn').disabled = true;
    this.container.querySelector('#addToBoardBtn').disabled = true;

    toast.success('New chat started');
  }
}


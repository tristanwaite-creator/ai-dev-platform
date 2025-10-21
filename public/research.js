// Research Hub - AI-assisted research and note-taking

let currentProjectId = null;
let currentSessionId = null;
let accessToken = null;

// Get project ID from URL
function getProjectId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// Get access token
function getAccessToken() {
    return localStorage.getItem('github_session');
}

// API Helper
async function apiCall(endpoint, options = {}) {
    const token = getAccessToken();
    const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

// Load sessions for the project
async function loadSessions() {
    const sessionsList = document.getElementById('sessionsList');
    try {
        const data = await apiCall(`/projects/${currentProjectId}/research`);
        const sessions = data.sessions || [];

        if (sessions.length === 0) {
            sessionsList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #718096;">
                    <p>No sessions yet</p>
                    <p style="font-size: 0.9rem;">Create your first research session</p>
                </div>
            `;
            return;
        }

        sessionsList.innerHTML = sessions.map(session => `
            <div class="session-item" data-session-id="${session.id}">
                <div class="session-title">${escapeHtml(session.title)}</div>
                ${session.description ? `<div class="session-description" style="font-size: 0.85rem; color: #4a5568; margin-top: 4px; font-style: italic;">${escapeHtml(session.description)}</div>` : ''}
                <div class="session-meta">
                    ${session.type} • ${session._count.messages} messages
                </div>
            </div>
        `).join('');

        // Add click handlers
        document.querySelectorAll('.session-item').forEach(item => {
            item.addEventListener('click', () => {
                const sessionId = item.dataset.sessionId;
                selectSession(sessionId);
            });
        });
    } catch (error) {
        console.error('Failed to load sessions:', error);
        sessionsList.innerHTML = `
            <div style="padding: 20px; color: #e53e3e;">
                Failed to load sessions: ${error.message}
            </div>
        `;
    }
}

// Select and load a session
async function selectSession(sessionId) {
    currentSessionId = sessionId;

    // Update UI
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.toggle('active', item.dataset.sessionId === sessionId);
    });

    // Load session details and messages
    try {
        const data = await apiCall(`/research/${sessionId}`);
        const session = data.session;

        document.getElementById('sessionTitle').textContent = session.title;
        document.getElementById('sessionActions').style.display = 'flex';
        document.getElementById('chatInputContainer').style.display = 'block';

        // Display messages
        displayMessages(session.messages || []);
    } catch (error) {
        console.error('Failed to load session:', error);
        alert(`Failed to load session: ${error.message}`);
    }
}

// Display chat messages
function displayMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');

    if (messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <h2>Start the conversation</h2>
                <p>Ask Claude about your project ideas</p>
            </div>
        `;
        return;
    }

    chatMessages.innerHTML = messages.map(msg => `
        <div class="message">
            <div class="message-avatar ${msg.role}-avatar">
                ${msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div class="message-content">
                <div class="message-role">${msg.role === 'user' ? 'You' : 'Claude'}</div>
                <div class="message-text">${escapeHtml(msg.content)}</div>
            </div>
        </div>
    `).join('');

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send chat message
async function sendMessage(message) {
    if (!currentSessionId) {
        alert('Please select a session first');
        return;
    }

    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');

    try {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        // Add user message to UI immediately
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages.querySelector('.empty-state')) {
            chatMessages.innerHTML = '';
        }

        chatMessages.innerHTML += `
            <div class="message">
                <div class="message-avatar user-avatar">👤</div>
                <div class="message-content">
                    <div class="message-role">You</div>
                    <div class="message-text">${escapeHtml(message)}</div>
                </div>
            </div>
        `;

        // Add loading indicator
        const loadingId = 'loading-' + Date.now();
        chatMessages.innerHTML += `
            <div class="message" id="${loadingId}">
                <div class="message-avatar assistant-avatar">🤖</div>
                <div class="message-content">
                    <div class="message-role">Claude</div>
                    <div class="message-text">Thinking...</div>
                </div>
            </div>
        `;

        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Send to API
        const data = await apiCall(`/research/${currentSessionId}/chat`, {
            method: 'POST',
            body: JSON.stringify({ message }),
        });

        // Remove loading, add real response
        document.getElementById(loadingId).remove();
        chatMessages.innerHTML += `
            <div class="message">
                <div class="message-avatar assistant-avatar">🤖</div>
                <div class="message-content">
                    <div class="message-role">Claude</div>
                    <div class="message-text">${escapeHtml(data.response)}</div>
                </div>
            </div>
        `;

        chatMessages.scrollTop = chatMessages.scrollHeight;
        chatInput.value = '';

        // Update session title if returned
        if (data.sessionTitle) {
            updateSessionTitleInList(currentSessionId, data.sessionTitle);
            document.getElementById('sessionTitle').textContent = data.sessionTitle;
        }

        // Update session description if returned
        if (data.sessionDescription) {
            updateSessionDescriptionInList(currentSessionId, data.sessionDescription);
        }
    } catch (error) {
        console.error('Failed to send message:', error);
        alert(`Failed to send message: ${error.message}`);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
    }
}

// Helper function to update session title in the sidebar
function updateSessionTitleInList(sessionId, newTitle) {
    const sessionItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (sessionItem) {
        const titleElement = sessionItem.querySelector('.session-title');
        if (titleElement) {
            titleElement.textContent = newTitle;
        }
    }
}

// Helper function to update session title in the sidebar
function updateSessionTitleInList(sessionId, newTitle) {
    const sessionItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (sessionItem) {
        const titleElement = sessionItem.querySelector('.session-title');
        if (titleElement) {
            titleElement.textContent = newTitle;
        }
    }
}

// Helper function to update session description in the sidebar
function updateSessionDescriptionInList(sessionId, newDescription) {
    const sessionItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (sessionItem) {
        // Find or create the description element
        let descElement = sessionItem.querySelector('.session-description');
        if (!descElement) {
            descElement = document.createElement('div');
            descElement.className = 'session-description';
            descElement.style.fontSize = '0.85rem';
            descElement.style.color = '#4a5568';
            descElement.style.marginTop = '4px';
            descElement.style.fontStyle = 'italic';
            sessionItem.querySelector('.session-title').insertAdjacentElement('afterend', descElement);
        }
        descElement.textContent = newDescription;
    }
}

// Generate document from session
async function generateDocument() {
    if (!currentSessionId) return;

    if (!confirm('Generate a document from this research session?')) return;

    try {
        const data = await apiCall(`/research/${currentSessionId}/generate-document`, {
            method: 'POST',
            body: JSON.stringify({ format: 'markdown' }),
        });

        alert('Document generated successfully!\n\nYou can view it in the session details.');
        console.log('Generated document:', data.document);
    } catch (error) {
        console.error('Failed to generate document:', error);
        alert(`Failed to generate document: ${error.message}`);
    }
}

// Convert session to task
async function convertToTask() {
    if (!currentSessionId) return;

    if (!confirm('Convert this research session to a task in the kanban board?')) return;

    try {
        const data = await apiCall(`/research/${currentSessionId}/convert-to-task`, {
            method: 'POST',
        });

        alert(`Task created successfully!\n\n${data.task.title}`);

        // Optionally redirect to board
        if (confirm('Go to board to see the new task?')) {
            window.location.href = `/board.html?project=${currentProjectId}`;
        }
    } catch (error) {
        console.error('Failed to convert to task:', error);
        alert(`Failed to convert to task: ${error.message}`);
    }
}

// Create new session
async function createSession(title, description, type) {
    try {
        const data = await apiCall(`/projects/${currentProjectId}/research`, {
            method: 'POST',
            body: JSON.stringify({ title, description, type }),
        });

        // Reload sessions and select the new one
        await loadSessions();
        selectSession(data.session.id);

        return data.session;
    } catch (error) {
        console.error('Failed to create session:', error);
        throw error;
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Get project ID
    currentProjectId = getProjectId();
    if (!currentProjectId) {
        alert('No project selected. Returning to projects page.');
        window.location.href = '/projects.html';
        return;
    }

    accessToken = getAccessToken();
    if (!accessToken) {
        alert('Please log in first');
        window.location.href = '/';
        return;
    }

    // Set up back button
    document.getElementById('backToBoard').addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `/board.html?id=${currentProjectId}`;
    });

    // Load initial sessions
    await loadSessions();

    // New Session Button - immediately create and open session
    document.getElementById('newSessionBtn').addEventListener('click', async () => {
        try {
            // Create session with auto-generated title
            const timestamp = new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
            const defaultTitle = `Research Session - ${timestamp}`;

            await createSession(defaultTitle, 'Start chatting to auto-generate...', 'research');
        } catch (error) {
            alert(`Failed to create session: ${error.message}`);
        }
    });

    // Chat Form
    document.getElementById('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (message) {
            await sendMessage(message);
        }
    });

    // Generate Document Button
    document.getElementById('generateDocBtn').addEventListener('click', generateDocument);

    // Convert to Task Button
    document.getElementById('convertTaskBtn').addEventListener('click', convertToTask);
});

// DOM Elements
const promptInput = document.getElementById('promptInput');
const generateBtn = document.getElementById('generateBtn');
const clearBtn = document.getElementById('clearBtn');
const statusContainer = document.getElementById('statusContainer');
const statusText = document.getElementById('statusText');
const outputContainer = document.getElementById('outputContainer');
const outputContent = document.getElementById('outputContent');
const viewProjectBtn = document.getElementById('viewProjectBtn');

// Advanced options elements
const advancedToggle = document.getElementById('advancedToggle');
const advancedContent = document.getElementById('advancedContent');
const projectIdInput = document.getElementById('projectIdInput');
const taskIdInput = document.getElementById('taskIdInput');
const autoCommitInput = document.getElementById('autoCommitInput');
const advancedStatus = document.getElementById('advancedStatus');

// GitHub OAuth elements
const githubLoginBtn = document.getElementById('githubLoginBtn');
const githubAuthSection = document.getElementById('githubAuthSection');
const githubUserInfo = document.getElementById('githubUserInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

// Check for OAuth callback parameters
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('github_auth') === 'success') {
    const session = urlParams.get('session');
    const username = urlParams.get('username');
    const userId = urlParams.get('userId');

    if (session && username && userId) {
        // Store session info
        localStorage.setItem('github_session', session);
        localStorage.setItem('github_username', username);
        localStorage.setItem('github_userId', userId);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Show success message
        advancedStatus.textContent = `Successfully logged in as @${username}!`;
        advancedStatus.className = 'advanced-status show success';

        // Auto-expand advanced options
        if (advancedContent.classList.contains('hidden')) {
            advancedToggle.click();
        }
    }
}

// Check if user is already logged in with GitHub
const storedSession = localStorage.getItem('github_session');
const storedUsername = localStorage.getItem('github_username');

if (storedSession && storedUsername) {
    // User is logged in - show user info instead of login button
    githubAuthSection.classList.add('hidden');
    githubUserInfo.classList.remove('hidden');
    userName.textContent = `@${storedUsername}`;
    // Default GitHub avatar
    userAvatar.src = `https://github.com/${storedUsername}.png`;
}

// GitHub Login button
githubLoginBtn.addEventListener('click', () => {
    window.location.href = '/api/auth/github/login';
});

// Advanced toggle functionality
advancedToggle.addEventListener('click', () => {
    advancedContent.classList.toggle('hidden');
    advancedToggle.classList.toggle('active');
});

// Load saved GitHub configuration from localStorage
window.addEventListener('DOMContentLoaded', () => {
    projectIdInput.value = localStorage.getItem('projectId') || '';
    taskIdInput.value = localStorage.getItem('taskId') || '';
    const savedAutoCommit = localStorage.getItem('autoCommit');
    if (savedAutoCommit !== null) {
        autoCommitInput.checked = savedAutoCommit === 'true';
    }
});

// Save GitHub configuration to localStorage
projectIdInput.addEventListener('change', (e) => {
    localStorage.setItem('projectId', e.target.value);
});

taskIdInput.addEventListener('change', (e) => {
    localStorage.setItem('taskId', e.target.value);
});

autoCommitInput.addEventListener('change', (e) => {
    localStorage.setItem('autoCommit', e.target.checked);
});

// Create New GitHub Project functionality
const createProjectBtn = document.getElementById('createProjectBtn');

createProjectBtn.addEventListener('click', async () => {
    // Check if user is logged in via OAuth
    const sessionToken = localStorage.getItem('github_session');
    const isLoggedIn = !!sessionToken;

    // Collect project information
    const projectName = prompt('Enter a name for your project:');
    if (!projectName || !projectName.trim()) {
        alert('Project name is required');
        return;
    }

    const repoName = prompt('Enter a repository name:', projectName.toLowerCase().replace(/\s+/g, '-'));
    if (!repoName || !repoName.trim()) {
        alert('Repository name is required');
        return;
    }

    const description = prompt('Enter a description (optional):', `AI-generated project: ${projectName}`);
    const isPrivate = confirm('Make repository private? (Click OK for private, Cancel for public)');

    // Show status
    advancedStatus.textContent = 'Creating GitHub project...';
    advancedStatus.className = 'advanced-status show';
    createProjectBtn.disabled = true;

    try {
        let projectRes;

        if (isLoggedIn) {
            // Use authenticated endpoint with OAuth session
            projectRes = await fetch('/api/github/create-project-auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    projectName: projectName.trim(),
                    repoName: repoName.trim(),
                    description: description?.trim() || '',
                    private: isPrivate
                })
            });
        } else {
            // Fallback to manual token entry
            const githubToken = prompt('Enter your GitHub Personal Access Token:\n\n(Get one at: https://github.com/settings/tokens/new)\nNeeds "repo" scope for creating repositories.');

            if (!githubToken || !githubToken.trim()) {
                alert('GitHub token is required');
                createProjectBtn.disabled = false;
                return;
            }

            projectRes = await fetch('/api/github/quick-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    githubToken: githubToken.trim(),
                    projectName: projectName.trim(),
                    repoName: repoName.trim(),
                    description: description?.trim() || '',
                    private: isPrivate
                })
            });
        }

        const projectData = await projectRes.json();

        if (!projectRes.ok) {
            throw new Error(projectData.error || 'Failed to create project');
        }

        // Create a default task
        const taskRes = await fetch('/api/github/create-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: projectData.project.id,
                title: 'Initial setup',
                description: 'First task for the project'
            })
        });

        const taskData = await taskRes.json();

        if (!taskRes.ok) {
            throw new Error(taskData.error || 'Failed to create task');
        }

        // Auto-fill the IDs
        projectIdInput.value = projectData.project.id;
        taskIdInput.value = taskData.task.id;

        // Save to localStorage
        localStorage.setItem('projectId', projectData.project.id);
        localStorage.setItem('taskId', taskData.task.id);

        // Show success
        advancedStatus.textContent = `Success! Created: ${projectData.repo.fullName}`;
        advancedStatus.className = 'advanced-status show success';

        // Open the GitHub repo in a new tab
        setTimeout(() => {
            window.open(projectData.project.githubRepoUrl, '_blank');
        }, 1000);

    } catch (error) {
        console.error('Project creation error:', error);
        advancedStatus.textContent = `Error: ${error.message}`;
        advancedStatus.className = 'advanced-status show error';
    } finally {
        createProjectBtn.disabled = false;
    }
});

// Auto-resize textarea
promptInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
});

// Clear button
clearBtn.addEventListener('click', () => {
    promptInput.value = '';
    promptInput.style.height = 'auto';
    promptInput.focus();
});

// Generate button
generateBtn.addEventListener('click', handleGenerate);

// Allow Enter to submit (Shift+Enter for new line)
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
    }
});

async function handleGenerate() {
    const prompt = promptInput.value.trim();

    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }

    // Get GitHub integration parameters from advanced options
    const projectId = projectIdInput.value.trim();
    const taskId = taskIdInput.value.trim();
    const autoCommit = autoCommitInput.checked;

    // Build request body
    const body = { prompt };
    if (projectId) {
        body.projectId = projectId;
    }
    if (taskId) {
        body.taskId = taskId;
    }
    if (projectId && taskId) {
        body.autoCommit = autoCommit;
    }

    // Reset UI
    outputContent.innerHTML = '';
    statusContainer.classList.remove('hidden');
    outputContainer.classList.remove('hidden');
    viewProjectBtn.classList.add('hidden');
    generateBtn.disabled = true;
    promptInput.disabled = true;

    statusText.textContent = 'Starting generation...';

    // Show GitHub integration status
    if (projectId && taskId) {
        addLogEntry(`🔗 GitHub Integration: Enabled (Auto-commit: ${autoCommit ? 'Yes' : 'No'})`, 'info');
    }

    try {
        // Create EventSource for SSE
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error('Failed to start generation');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete events
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            let eventType = 'message';
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    eventType = line.substring(6).trim();
                    console.log('📨 Frontend received event type:', eventType);
                    continue;
                }

                if (line.startsWith('data:')) {
                    try {
                        const data = JSON.parse(line.substring(5).trim());
                        console.log('📦 Frontend received data:', eventType, data);
                        handleSSEMessage(eventType, data);
                        eventType = 'message'; // Reset after processing
                    } catch (e) {
                        console.error('Error parsing SSE data:', e, 'Line:', line);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error:', error);
        addLogEntry('Error: ' + error.message, 'error');
        statusText.textContent = 'Generation failed';
    } finally {
        generateBtn.disabled = false;
        promptInput.disabled = false;
    }
}

let currentEventType = 'message';
let sandboxUrl = null; // Store the E2B sandbox URL
let commitUrl = null; // Store the GitHub commit URL
let branchName = null; // Store the GitHub branch name

function handleSSEMessage(event, data) {
    currentEventType = event;

    switch (event) {
        case 'status':
            statusText.textContent = data.message;
            addLogEntry(data.message, 'info');
            break;

        case 'text':
            addLogEntry(data.content, 'text');
            break;

        case 'tool':
            if (data.action === 'using') {
                statusText.textContent = `Using tool: ${data.name}`;
                addLogEntry(`🔧 Using tool: ${data.name}`, 'tool');
            } else if (data.action === 'completed') {
                addLogEntry('✓ Tool completed', 'tool');
            }
            break;

        case 'error':
            statusText.textContent = 'Error occurred';
            addLogEntry('❌ Error: ' + data.message, 'error');
            break;

        case 'complete':
            // Store the E2B sandbox URL and GitHub info
            sandboxUrl = data.sandboxUrl;
            commitUrl = data.commitUrl;
            branchName = data.branchName;

            statusText.textContent = data.message;
            addLogEntry('✅ ' + data.message, 'success');

            // Display sandbox URL
            if (sandboxUrl) {
                const sandboxLink = document.createElement('a');
                sandboxLink.href = sandboxUrl;
                sandboxLink.target = '_blank';
                sandboxLink.textContent = sandboxUrl;
                sandboxLink.className = 'link';

                const entry = document.createElement('div');
                entry.className = 'log-entry success';
                entry.innerHTML = '🌐 Live Preview: ';
                entry.appendChild(sandboxLink);
                outputContent.appendChild(entry);
            }

            // Display GitHub information if available
            if (branchName) {
                addLogEntry(`🔀 GitHub Branch: ${branchName}`, 'success');
            }

            if (commitUrl) {
                const commitLink = document.createElement('a');
                commitLink.href = commitUrl;
                commitLink.target = '_blank';
                commitLink.textContent = commitUrl;
                commitLink.className = 'link';

                const entry = document.createElement('div');
                entry.className = 'log-entry success';
                entry.innerHTML = '🐙 GitHub Commit: ';
                entry.appendChild(commitLink);
                outputContent.appendChild(entry);
            }

            // Display generation ID if available
            if (data.generationId) {
                addLogEntry(`📝 Generation ID: ${data.generationId}`, 'info');
            }

            statusContainer.classList.add('hidden');
            viewProjectBtn.classList.remove('hidden');

            // Auto-open the E2B sandbox URL
            if (sandboxUrl) {
                setTimeout(() => {
                    window.open(sandboxUrl, '_blank');
                }, 1000);
            }

            // Auto-scroll to bottom
            outputContent.scrollTop = outputContent.scrollHeight;
            break;
    }
}

function addLogEntry(text, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = text;
    outputContent.appendChild(entry);

    // Auto-scroll to bottom
    outputContent.scrollTop = outputContent.scrollHeight;
}

// View project button
viewProjectBtn.addEventListener('click', () => {
    if (sandboxUrl) {
        window.open(sandboxUrl, '_blank');
    } else {
        // Fallback to local output (shouldn't happen with E2B)
        window.open('/output/index.html', '_blank');
    }
});

// Check API health on load
fetch('/api/health')
    .then(res => res.json())
    .then(data => {
        if (!data.hasApiKey) {
            alert('Warning: ANTHROPIC_API_KEY is not configured. Please set it in your .env file.');
        }
    })
    .catch(err => {
        console.error('Failed to check API health:', err);
    });

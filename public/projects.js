// DOM Elements
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const projectsGrid = document.getElementById('projectsGrid');
const newProjectBtn = document.getElementById('newProjectBtn');
const newProjectModal = document.getElementById('newProjectModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const createBtn = document.getElementById('createBtn');
const projectNameInput = document.getElementById('projectName');
const projectDescriptionInput = document.getElementById('projectDescription');
const createGithubRepoCheckbox = document.getElementById('createGithubRepo');
const githubOptions = document.getElementById('githubOptions');
const repoNameInput = document.getElementById('repoName');
const privateRepoCheckbox = document.getElementById('privateRepo');

// Check for GitHub OAuth session
const githubSession = localStorage.getItem('github_session');
const githubUsername = localStorage.getItem('github_username');

// Load projects on page load
window.addEventListener('DOMContentLoaded', loadProjects);

// Modal controls
newProjectBtn.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalFn);
cancelBtn.addEventListener('click', closeModalFn);
createBtn.addEventListener('click', createProject);

// GitHub repo checkbox
createGithubRepoCheckbox.addEventListener('change', (e) => {
    githubOptions.classList.toggle('hidden', !e.target.checked);
});

// Auto-fill repo name from project name
projectNameInput.addEventListener('input', (e) => {
    if (createGithubRepoCheckbox.checked) {
        const repoName = e.target.value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        repoNameInput.value = repoName;
    }
});

async function loadProjects() {
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    projectsGrid.classList.add('hidden');

    try {
        // Check if user is logged in
        if (!githubSession) {
            showEmptyState('Please log in to view your projects');
            return;
        }

        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${githubSession}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired
                localStorage.removeItem('github_session');
                localStorage.removeItem('github_username');
                window.location.href = '/';
                return;
            }
            throw new Error('Failed to load projects');
        }

        const data = await response.json();
        const projects = data.projects;

        loadingState.classList.add('hidden');

        if (projects.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            projectsGrid.classList.remove('hidden');
            renderProjects(projects);
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        loadingState.classList.add('hidden');
        showEmptyState('Failed to load projects. Please try again.');
    }
}

function renderProjects(projects) {
    projectsGrid.innerHTML = projects.map(project => `
        <div class="project-card" onclick="window.location.href='/project.html?id=${project.id}'">
            <div class="project-header">
                <h3 class="project-title">${escapeHtml(project.name)}</h3>
                ${project.githubRepoUrl ? `
                    <a href="${project.githubRepoUrl}" target="_blank" class="github-badge" onclick="event.stopPropagation()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        GitHub
                    </a>
                ` : ''}
            </div>
            ${project.description ? `<p class="project-description">${escapeHtml(project.description)}</p>` : ''}
            <div class="project-stats">
                <div class="stat">
                    <span class="stat-value">${project._count.tasks}</span>
                    <span class="stat-label">Tasks</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${project._count.generations}</span>
                    <span class="stat-label">Generations</span>
                </div>
                <div class="stat">
                    <span class="stat-value ${project.sandboxStatus === 'active' ? 'active' : ''}">${project.sandboxStatus || 'inactive'}</span>
                    <span class="stat-label">Sandbox</span>
                </div>
            </div>
            <div class="project-footer">
                <span class="project-date">Created ${formatDate(project.createdAt)}</span>
                <button class="btn-small btn-primary" onclick="event.stopPropagation(); window.location.href='/project.html?id=${project.id}'">
                    Open Project
                </button>
            </div>
        </div>
    `).join('');
}

function showEmptyState(message) {
    loadingState.classList.add('hidden');
    emptyState.classList.remove('hidden');
    projectsGrid.classList.add('hidden');

    if (message) {
        emptyState.querySelector('p').textContent = message;
    }
}

function openModal() {
    newProjectModal.classList.remove('hidden');
    projectNameInput.focus();
}

function closeModalFn() {
    newProjectModal.classList.add('hidden');
    projectNameInput.value = '';
    projectDescriptionInput.value = '';
    createGithubRepoCheckbox.checked = false;
    githubOptions.classList.add('hidden');
    repoNameInput.value = '';
    privateRepoCheckbox.checked = true;
}

async function createProject() {
    const name = projectNameInput.value.trim();
    const description = projectDescriptionInput.value.trim();
    const createGitHub = createGithubRepoCheckbox.checked;
    const repoName = repoNameInput.value.trim();
    const isPrivate = privateRepoCheckbox.checked;

    if (!name) {
        alert('Please enter a project name');
        return;
    }

    if (createGitHub && !repoName) {
        alert('Please enter a repository name');
        return;
    }

    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    try {
        let projectResponse;

        if (createGitHub) {
            // Create project with GitHub repo
            projectResponse = await fetch('/api/github/create-project-auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${githubSession}`
                },
                body: JSON.stringify({
                    projectName: name,
                    repoName: repoName,
                    description: description || undefined,
                    private: isPrivate
                })
            });
        } else {
            // Create project without GitHub
            projectResponse = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${githubSession}`
                },
                body: JSON.stringify({
                    name,
                    description: description || undefined
                })
            });
        }

        if (!projectResponse.ok) {
            const errorData = await projectResponse.json();
            throw new Error(errorData.error || 'Failed to create project');
        }

        const projectData = await projectResponse.json();
        const project = projectData.project;

        // Close modal and redirect to the new project (Research tab by default)
        closeModalFn();
        window.location.href = `/project.html?id=${project.id}`;

    } catch (error) {
        console.error('Error creating project:', error);
        alert(`Error: ${error.message}`);
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = 'Create Project';
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}

// Close modal when clicking outside
newProjectModal.addEventListener('click', (e) => {
    if (e.target === newProjectModal) {
        closeModalFn();
    }
});

// Handle escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !newProjectModal.classList.contains('hidden')) {
        closeModalFn();
    }
});

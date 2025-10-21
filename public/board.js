// Get project ID from URL
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

if (!projectId) {
    alert('No project ID provided');
    window.location.href = '/projects.html';
}

// Check for GitHub OAuth session
const githubSession = localStorage.getItem('github_session');

if (!githubSession) {
    alert('Please log in first');
    window.location.href = '/';
}

// DOM Elements
const projectName = document.getElementById('projectName');
const researchColumn = document.getElementById('researchColumn');
const buildingColumn = document.getElementById('buildingColumn');
const testingColumn = document.getElementById('testingColumn');
const doneColumn = document.getElementById('doneColumn');
const researchCount = document.getElementById('researchCount');
const buildingCount = document.getElementById('buildingCount');
const testingCount = document.getElementById('testingCount');
const doneCount = document.getElementById('doneCount');

// New Task Modal
const newTaskBtn = document.getElementById('newTaskBtn');
const newTaskModal = document.getElementById('newTaskModal');
const closeTaskModal = document.getElementById('closeTaskModal');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const createTaskBtn = document.getElementById('createTaskBtn');
const taskTitle = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');
const taskPriority = document.getElementById('taskPriority');

// Task Details Modal
const taskDetailsModal = document.getElementById('taskDetailsModal');
const closeDetailsModal = document.getElementById('closeDetailsModal');
const detailsTaskTitle = document.getElementById('detailsTaskTitle');
const detailsDescription = document.getElementById('detailsDescription');
const detailsColumn = document.getElementById('detailsColumn');
const detailsPriority = document.getElementById('detailsPriority');
const detailsBuildStatus = document.getElementById('detailsBuildStatus');
const detailsBranch = document.getElementById('detailsBranch');
const detailsPrUrl = document.getElementById('detailsPrUrl');
const githubSection = document.getElementById('githubSection');
const generationsSection = document.getElementById('generationsSection');
const generationInfo = document.getElementById('generationInfo');
const moveLeftBtn = document.getElementById('moveLeftBtn');
const moveRightBtn = document.getElementById('moveRightBtn');
const regenerateSandboxBtn = document.getElementById('regenerateSandboxBtn');
const deleteTaskBtn = document.getElementById('deleteTaskBtn');

// State
let currentProject = null;
let currentBoard = null;
let currentTask = null;

// Load board on page load
window.addEventListener('DOMContentLoaded', loadBoard);

// Research Hub navigation
document.getElementById('researchHubBtn').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = `/research.html?id=${projectId}`;
});

// Modal controls
newTaskBtn.addEventListener('click', openNewTaskModal);
closeTaskModal.addEventListener('click', closeNewTaskModal);
cancelTaskBtn.addEventListener('click', closeNewTaskModal);
createTaskBtn.addEventListener('click', createTask);
closeDetailsModal.addEventListener('click', closeTaskDetailsModal);
moveLeftBtn.addEventListener('click', () => moveTask('left'));
moveRightBtn.addEventListener('click', () => moveTask('right'));
regenerateSandboxBtn.addEventListener('click', regenerateSandbox);
deleteTaskBtn.addEventListener('click', deleteTask);

// Load board data
async function loadBoard() {
    try {
        const response = await fetch(`/api/projects/${projectId}/board`, {
            headers: {
                'Authorization': `Bearer ${githubSession}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('github_session');
                alert('Session expired. Please log in again.');
                window.location.href = '/';
                return;
            }
            throw new Error('Failed to load board');
        }

        const data = await response.json();
        currentProject = data.project;
        currentBoard = data.board;

        projectName.textContent = currentProject.name;

        renderBoard();
    } catch (error) {
        console.error('Error loading board:', error);
        alert('Failed to load board. Please try again.');
    }
}

// Render board
function renderBoard() {
    renderColumn('research', researchColumn, researchCount);
    renderColumn('building', buildingColumn, buildingCount);
    renderColumn('testing', testingColumn, testingCount);
    renderColumn('done', doneColumn, doneCount);
}

// Render a single column
function renderColumn(columnName, columnElement, countElement) {
    const tasks = currentBoard[columnName] || [];
    countElement.textContent = tasks.length;

    if (tasks.length === 0) {
        columnElement.innerHTML = '<div class="empty-column">No tasks</div>';
        return;
    }

    columnElement.innerHTML = tasks.map(task => createTaskCard(task)).join('');
}

// Create task card HTML
function createTaskCard(task) {
    const priorityClass = `priority-${task.priority || 'medium'}`;
    const buildStatusClass = `build-${task.buildStatus || 'pending'}`;

    // Get sandbox URL if available
    const sandboxUrl = getSandboxUrl(task);
    const showSandboxButton = task.column === 'testing' && sandboxUrl && task.buildStatus === 'ready';

    return `
        <div class="task-card ${priorityClass}" data-task-id="${task.id}">
            <div onclick="openTaskDetails('${task.id}')" style="cursor: pointer;">
                <div class="task-card-header">
                    <h3 class="task-card-title">${escapeHtml(task.title)}</h3>
                    <span class="priority-indicator ${priorityClass}"></span>
                </div>
                ${task.description ? `<p class="task-card-description">${escapeHtml(task.description)}</p>` : ''}
                <div class="task-card-footer">
                    <span class="build-status-indicator ${buildStatusClass}">${formatBuildStatus(task.buildStatus)}</span>
                    ${task.branchName ? `<span class="task-badge">🔀 ${task.branchName}</span>` : ''}
                </div>
            </div>
            ${showSandboxButton ? `
                <button class="view-sandbox-btn" onclick="event.stopPropagation(); window.open('${sandboxUrl}', '_blank')">
                    🚀 View Sandbox
                </button>
            ` : ''}
        </div>
    `;
}

// Open new task modal
function openNewTaskModal() {
    newTaskModal.classList.remove('hidden');
    taskTitle.focus();
}

// Close new task modal
function closeNewTaskModal() {
    newTaskModal.classList.add('hidden');
    taskTitle.value = '';
    taskDescription.value = '';
    taskPriority.value = 'medium';
}

// Create new task
async function createTask() {
    const title = taskTitle.value.trim();
    const description = taskDescription.value.trim();
    const priority = taskPriority.value;

    if (!title) {
        alert('Please enter a task title');
        return;
    }

    createTaskBtn.disabled = true;
    createTaskBtn.textContent = 'Creating...';

    try {
        const response = await fetch(`/api/projects/${projectId}/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${githubSession}`
            },
            body: JSON.stringify({
                title,
                description: description || undefined,
                priority,
                column: 'research' // New tasks always start in Research
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create task');
        }

        // Reload board
        await loadBoard();
        closeNewTaskModal();

    } catch (error) {
        console.error('Error creating task:', error);
        alert(`Error: ${error.message}`);
    } finally {
        createTaskBtn.disabled = false;
        createTaskBtn.textContent = 'Create Task';
    }
}

// Open task details modal
async function openTaskDetails(taskId) {
    // Find task in current board
    const allTasks = [
        ...currentBoard.research,
        ...currentBoard.building,
        ...currentBoard.testing,
        ...currentBoard.done
    ];

    const task = allTasks.find(t => t.id === taskId);

    if (!task) {
        alert('Task not found');
        return;
    }

    currentTask = task;

    // Populate modal
    detailsTaskTitle.textContent = task.title;
    detailsDescription.textContent = task.description || 'No description';
    detailsColumn.textContent = formatColumnName(task.column);
    detailsColumn.className = `status-badge status-${task.column}`;
    detailsPriority.textContent = task.priority || 'medium';
    detailsPriority.className = `priority-badge priority-${task.priority || 'medium'}`;
    detailsBuildStatus.textContent = formatBuildStatus(task.buildStatus);
    detailsBuildStatus.className = `build-status-badge build-${task.buildStatus || 'pending'}`;

    // GitHub section
    if (task.branchName || task.prUrl) {
        githubSection.style.display = 'block';
        detailsBranch.textContent = task.branchName || '-';

        if (task.prUrl) {
            detailsPrUrl.href = task.prUrl;
            detailsPrUrl.style.display = 'inline';
        } else {
            detailsPrUrl.style.display = 'none';
        }
    } else {
        githubSection.style.display = 'none';
    }

    // Generations section
    if (task.generations && task.generations.length > 0) {
        generationsSection.style.display = 'block';
        const gen = task.generations[0];
        const sandboxUrl = gen.sandboxId ? `https://8000-${gen.sandboxId}.e2b.app` : null;

        generationInfo.innerHTML = `
            <div class="generation-item">
                <div><strong>Status:</strong> ${gen.status}</div>
                <div><strong>Files Created:</strong> ${gen.filesCreated.length}</div>
                ${gen.sandboxId ? `<div><strong>Sandbox ID:</strong> ${gen.sandboxId}</div>` : ''}
                ${sandboxUrl ? `
                    <div style="margin-top: 10px;">
                        <a href="${sandboxUrl}" target="_blank" class="sandbox-link" style="color: #3b82f6; text-decoration: underline;">
                            🚀 Open Sandbox
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        generationsSection.style.display = 'none';
    }

    // Move buttons
    const columnOrder = ['research', 'building', 'testing', 'done'];
    const currentIndex = columnOrder.indexOf(task.column);

    moveLeftBtn.style.display = currentIndex > 0 ? 'inline-block' : 'none';
    moveRightBtn.style.display = currentIndex < columnOrder.length - 1 ? 'inline-block' : 'none';

    if (currentIndex > 0) {
        moveLeftBtn.textContent = `← Move to ${formatColumnName(columnOrder[currentIndex - 1])}`;
    }
    if (currentIndex < columnOrder.length - 1) {
        moveRightBtn.textContent = `Move to ${formatColumnName(columnOrder[currentIndex + 1])} →`;
    }

    // Show regenerate button if task has been built and is in testing/done
    const showRegenerateBtn = task.buildStatus === 'ready' && (task.column === 'testing' || task.column === 'done');
    regenerateSandboxBtn.style.display = showRegenerateBtn ? 'inline-block' : 'none';

    taskDetailsModal.classList.remove('hidden');
}

// Close task details modal
function closeTaskDetailsModal() {
    taskDetailsModal.classList.add('hidden');
    currentTask = null;
}

// Move task
async function moveTask(direction) {
    if (!currentTask) return;

    const columnOrder = ['research', 'building', 'testing', 'done'];
    const currentIndex = columnOrder.indexOf(currentTask.column);
    let newIndex = currentIndex;

    if (direction === 'left' && currentIndex > 0) {
        newIndex = currentIndex - 1;
    } else if (direction === 'right' && currentIndex < columnOrder.length - 1) {
        newIndex = currentIndex + 1;
    }

    if (newIndex === currentIndex) return;

    const newColumn = columnOrder[newIndex];
    const isMovingToBuilding = newColumn === 'building';

    try {
        const response = await fetch(`/api/projects/${projectId}/tasks/${currentTask.id}/move`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${githubSession}`
            },
            body: JSON.stringify({ column: newColumn })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to move task');
        }

        const data = await response.json();

        // Show notification if generation was triggered
        if (data.generationTriggered) {
            alert('✨ Code generation started! The task will automatically update when complete.\n\nCheck back in a few moments to see the results.');
        }

        // Reload board and close modal
        await loadBoard();
        closeTaskDetailsModal();

    } catch (error) {
        console.error('Error moving task:', error);
        alert(`Error: ${error.message}`);
    }
}

// Delete task
async function deleteTask() {
    if (!currentTask) return;

    if (!confirm(`Are you sure you want to delete "${currentTask.title}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/projects/${projectId}/tasks/${currentTask.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${githubSession}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete task');
        }

        // Reload board and close modal
        await loadBoard();
        closeTaskDetailsModal();

    } catch (error) {
        console.error('Error deleting task:', error);
        alert(`Error: ${error.message}`);
    }
}

// Regenerate sandbox
async function regenerateSandbox() {
    if (!currentTask) return;

    if (!confirm('This will move the task back to Building and create a fresh sandbox with new code generation. Continue?')) {
        return;
    }

    regenerateSandboxBtn.disabled = true;
    regenerateSandboxBtn.textContent = 'Regenerating...';

    try {
        // Move task to Building column, which will auto-trigger generation
        const response = await fetch(`/api/projects/${projectId}/tasks/${currentTask.id}/move`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${githubSession}`
            },
            body: JSON.stringify({ column: 'building' })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to regenerate sandbox');
        }

        const data = await response.json();

        if (data.generationTriggered) {
            alert('🔄 Sandbox regeneration started!\n\nThe task has been moved to Building and code generation is in progress. You can move it to Testing once it\'s ready (buildStatus shows "Ready").');
        }

        // Reload board and close modal
        await loadBoard();
        closeTaskDetailsModal();

    } catch (error) {
        console.error('Error regenerating sandbox:', error);
        alert(`Error: ${error.message}`);
    } finally {
        regenerateSandboxBtn.disabled = false;
        regenerateSandboxBtn.textContent = '🔄 Regenerate Sandbox';
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatColumnName(column) {
    const names = {
        'research': 'Research',
        'building': 'Building',
        'testing': 'Testing',
        'done': 'Done'
    };
    return names[column] || column;
}

function formatBuildStatus(status) {
    const statuses = {
        'pending': 'Pending',
        'generating': 'Generating...',
        'ready': 'Ready',
        'failed': 'Failed'
    };
    return statuses[status] || status || 'Pending';
}

function getSandboxUrl(task) {
    if (task.generations && task.generations.length > 0) {
        const gen = task.generations[0];
        if (gen.sandboxId) {
            return `https://8000-${gen.sandboxId}.e2b.app`;
        }
    }
    return null;
}

// Close modals when clicking outside
newTaskModal.addEventListener('click', (e) => {
    if (e.target === newTaskModal) {
        closeNewTaskModal();
    }
});

taskDetailsModal.addEventListener('click', (e) => {
    if (e.target === taskDetailsModal) {
        closeTaskDetailsModal();
    }
});

// Handle escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!newTaskModal.classList.contains('hidden')) {
            closeNewTaskModal();
        }
        if (!taskDetailsModal.classList.contains('hidden')) {
            closeTaskDetailsModal();
        }
    }
});

// Auto-refresh board every 10 seconds to see updates
setInterval(() => {
    if (!newTaskModal.classList.contains('hidden') || !taskDetailsModal.classList.contains('hidden')) {
        return; // Don't refresh while modal is open
    }
    loadBoard();
}, 10000);

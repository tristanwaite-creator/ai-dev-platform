// Pages & Docs - Notion-like interface

let currentProjectId = null;
let currentPageId = null;
let accessToken = null;
let pages = [];
let blocks = [];
let autoSaveTimeout = null;

// Get project ID from URL
function getProjectId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id') || urlParams.get('project');
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

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load all pages for project
async function loadPages() {
    const pagesList = document.getElementById('pagesList');
    try {
        const data = await apiCall(`/projects/${currentProjectId}/pages`);
        pages = data.pages || [];

        if (pages.length === 0) {
            pagesList.innerHTML = `
                <div class="empty-pages-message">
                    <p>No pages yet</p>
                    <p>Create your first page</p>
                </div>
            `;
            return;
        }

        // Build hierarchical structure
        renderPagesList(pages);
    } catch (error) {
        console.error('Failed to load pages:', error);
        pagesList.innerHTML = `
            <div class="error-message">
                Failed to load pages
            </div>
        `;
    }
}

// Render pages list with nesting
function renderPagesList(allPages) {
    const pagesList = document.getElementById('pagesList');

    // Separate into root pages and children
    const rootPages = allPages.filter(p => !p.parentId);
    const childrenMap = {};

    allPages.forEach(page => {
        if (page.parentId) {
            if (!childrenMap[page.parentId]) {
                childrenMap[page.parentId] = [];
            }
            childrenMap[page.parentId].push(page);
        }
    });

    // Sort by order
    rootPages.sort((a, b) => a.order - b.order);
    Object.values(childrenMap).forEach(children => {
        children.sort((a, b) => a.order - b.order);
    });

    // Render
    let html = '';

    function renderPage(page, level = 0) {
        const hasChildren = childrenMap[page.id] && childrenMap[page.id].length > 0;
        const levelClass = level === 0 ? '' : level === 1 ? 'child' : 'grandchild';
        const icon = page.icon || '📄';

        html += `
            <div class="page-item ${levelClass} ${page.id === currentPageId ? 'active' : ''}"
                 data-page-id="${page.id}"
                 draggable="true">
                ${hasChildren ? '<span class="toggle-children">▼</span>' : '<span class="toggle-spacer"></span>'}
                <span class="page-icon">${icon}</span>
                <span class="page-title-text">${escapeHtml(page.title)}</span>
            </div>
        `;

        // Render children
        if (hasChildren) {
            childrenMap[page.id].forEach(child => renderPage(child, level + 1));
        }
    }

    rootPages.forEach(page => renderPage(page));

    pagesList.innerHTML = html;

    // Add click handlers
    document.querySelectorAll('.page-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('toggle-children')) {
                // Handle toggle
                // For now, do nothing - all expanded
                return;
            }
            const pageId = item.dataset.pageId;
            loadPage(pageId);
        });

        // Drag and drop handlers (basic for now)
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragleave', handleDragLeave);
    });
}

// Drag and drop state
let draggedPageId = null;

function handleDragStart(e) {
    draggedPageId = e.target.dataset.pageId;
    e.target.style.opacity = '0.4';
}

function handleDragOver(e) {
    e.preventDefault();
    e.target.closest('.page-item')?.classList.add('drag-over');
    return false;
}

function handleDragLeave(e) {
    e.target.closest('.page-item')?.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    e.target.closest('.page-item')?.classList.remove('drag-over');

    const targetPageId = e.target.closest('.page-item')?.dataset.pageId;

    if (!draggedPageId || !targetPageId || draggedPageId === targetPageId) {
        return;
    }

    try {
        // Move page to be child of target
        await apiCall(`/pages/${draggedPageId}/move`, {
            method: 'POST',
            body: JSON.stringify({ parentId: targetPageId }),
        });

        await loadPages();
        if (currentPageId === draggedPageId) {
            await loadPage(draggedPageId);
        }
    } catch (error) {
        console.error('Failed to move page:', error);
        alert('Failed to move page: ' + error.message);
    }

    draggedPageId = null;
    document.querySelectorAll('.page-item').forEach(item => {
        item.style.opacity = '';
    });
}

// Load specific page
async function loadPage(pageId) {
    currentPageId = pageId;

    // Update active state in sidebar
    document.querySelectorAll('.page-item').forEach(item => {
        item.classList.toggle('active', item.dataset.pageId === pageId);
    });

    try {
        const data = await apiCall(`/pages/${pageId}`);
        const page = data.page;
        blocks = page.blocks || [];

        renderPageContent(page);
    } catch (error) {
        console.error('Failed to load page:', error);
        alert('Failed to load page: ' + error.message);
    }
}

// Render page content
function renderPageContent(page) {
    const icon = page.icon || '📄';

    const html = `
        <div class="page-header">
            <div class="page-icon-large" id="pageIcon" contenteditable="true">${icon}</div>
            <input type="text"
                   class="page-title-input"
                   id="pageTitle"
                   value="${escapeHtml(page.title)}"
                   placeholder="Untitled">
        </div>
        <div class="page-editor" id="pageEditor">
            ${blocks.length === 0 ? '<div class="add-block-btn" id="addFirstBlock">Click to add content...</div>' : ''}
        </div>
    `;

    document.getElementById('pageContent').innerHTML = html;

    // Add title handler
    const titleInput = document.getElementById('pageTitle');
    titleInput.addEventListener('input', () => autoSavePage());

    // Add icon handler
    const iconDiv = document.getElementById('pageIcon');
    iconDiv.addEventListener('blur', () => autoSavePage());

    // Render blocks
    if (blocks.length > 0) {
        renderBlocks();
    } else {
        document.getElementById('addFirstBlock')?.addEventListener('click', () => {
            addBlock();
        });
    }
}

// Render blocks
function renderBlocks() {
    const editor = document.getElementById('pageEditor');

    const blocksHtml = blocks.map((block, index) => {
        const content = block.content.text || '';
        return `
            <div class="block" data-block-id="${block.id}" data-index="${index}">
                <textarea class="block-content"
                          placeholder="${index === 0 ? 'Start typing...' : "Type '/' for commands"}"
                          data-block-id="${block.id}">${content}</textarea>
            </div>
        `;
    }).join('');

    editor.innerHTML = blocksHtml + '<div class="add-block-btn" id="addBlockBtn">Add a block...</div>';

    // Add block handlers
    document.querySelectorAll('.block-content').forEach((textarea, index) => {
        // Auto-resize
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';

        textarea.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
            autoSaveBlock(e.target.dataset.blockId, e.target.value);
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addBlock(index + 1);
            }
        });
    });

    document.getElementById('addBlockBtn')?.addEventListener('click', () => addBlock());
}

// Add new block
async function addBlock(position = null) {
    if (!currentPageId) return;

    try {
        const order = position !== null ? position : blocks.length;

        const data = await apiCall(`/pages/${currentPageId}/blocks`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'text',
                content: { text: '' },
                order,
            }),
        });

        // Reload blocks
        await loadPage(currentPageId);

        // Focus new block
        setTimeout(() => {
            const textareas = document.querySelectorAll('.block-content');
            const newTextarea = textareas[order];
            if (newTextarea) {
                newTextarea.focus();
            }
        }, 100);
    } catch (error) {
        console.error('Failed to add block:', error);
    }
}

// Auto-save page
function autoSavePage() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        if (!currentPageId) return;

        const title = document.getElementById('pageTitle')?.value;
        const icon = document.getElementById('pageIcon')?.textContent.trim();

        try {
            await apiCall(`/pages/${currentPageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ title, icon }),
            });

            // Update in sidebar
            await loadPages();
        } catch (error) {
            console.error('Failed to save page:', error);
        }
    }, 500);
}

// Auto-save block
function autoSaveBlock(blockId, content) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        try {
            await apiCall(`/blocks/${blockId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    content: { text: content },
                }),
            });
        } catch (error) {
            console.error('Failed to save block:', error);
        }
    }, 500);
}

// Create new page
async function createPage() {
    try {
        const data = await apiCall(`/projects/${currentProjectId}/pages`, {
            method: 'POST',
            body: JSON.stringify({
                title: 'Untitled',
                icon: '📄',
            }),
        });

        await loadPages();
        await loadPage(data.page.id);
    } catch (error) {
        console.error('Failed to create page:', error);
        alert('Failed to create page: ' + error.message);
    }
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

    // Load pages
    await loadPages();

    // New Page Button
    document.getElementById('newPageBtn').addEventListener('click', createPage);
});

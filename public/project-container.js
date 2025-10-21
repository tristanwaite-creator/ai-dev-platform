/**
 * Project Container - Main Orchestrator
 * Manages the unified project view with tab navigation
 */

import { api } from './core/api.js';
import { store } from './core/state.js';
import { TabManager } from './components/tabs.js';
import { toast } from './components/toast.js';

class ProjectContainer {
  constructor() {
    this.projectId = this.getProjectId();
    this.tabManager = null;
    this.sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    if (!this.projectId) {
      toast.error('Invalid project ID');
      window.location.href = '/projects.html';
      return;
    }

    this.init();
  }

  /**
   * Get project ID from URL
   */
  getProjectId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  /**
   * Initialize the container
   */
  async init() {
    console.log('ProjectContainer: Initializing...');

    try {
      // Load project data
      console.log('ProjectContainer: Loading project data...');
      await this.loadProject();
      console.log('ProjectContainer: Project loaded');

      // Initialize tab manager
      console.log('ProjectContainer: Initializing tab manager...');
      this.initTabManager();
      console.log('ProjectContainer: Tab manager initialized');

      // Setup event listeners
      console.log('ProjectContainer: Setting up event listeners...');
      this.setupEventListeners();
      console.log('ProjectContainer: Event listeners setup');

      // Initialize sidebar state
      console.log('ProjectContainer: Initializing sidebar state...');
      this.initSidebarState();
      console.log('ProjectContainer: Sidebar state initialized');

      // Load initial tab (from hash or default to research)
      const initialTab = window.location.hash.slice(1) || 'research';
      console.log('ProjectContainer: Switching to initial tab:', initialTab);
      console.log('ProjectContainer: Current URL hash:', window.location.hash);

      // Don't update hash on initial load if it's already set
      const shouldUpdateHash = !window.location.hash;
      await this.switchTab(initialTab, shouldUpdateHash);
      console.log('ProjectContainer: Initial tab loaded');

      // Update active tab UI
      this.updateActiveTab(initialTab);

      console.log('ProjectContainer: Initialization complete!');

    } catch (error) {
      console.error('Failed to initialize project:', error);
      toast.error('Failed to load project');
      setTimeout(() => {
        window.location.href = '/projects.html';
      }, 2000);
    }
  }

  /**
   * Load project data from API
   */
  async loadProject() {
    try {
      const data = await api.get(`/projects/${this.projectId}/view`, {
        skipCache: true
      });

      // Update global state
      store.setState({
        project: data.project,
        projectId: this.projectId,
        researchSessions: data.researchSessions || [],
        board: data.board || { research: [], building: [], testing: [], done: [] },
        stats: data.stats || { researchSessions: 0, tasks: 0, generations: 0 }
      });

      // Update header UI
      this.updateHeader(data.project, data.stats);

    } catch (error) {
      console.error('Error loading project:', error);
      throw error;
    }
  }

  /**
   * Initialize tab manager with lazy-loaded views
   */
  initTabManager() {
    const tabContent = document.querySelector('#tabContent');
    this.tabManager = new TabManager(tabContent);

    // Register tabs with lazy loading
    this.tabManager.registerAll({
      research: () => import('./views/pages-view.js'),
      kanban: () => import('./views/kanban-view.js'),
      settings: () => import('./views/settings-view.js')
    });

    // Set tab change callback (just update UI, don't change hash here)
    this.tabManager.setOnTabChange((tabName) => {
      console.log('TabManager: onTabChange callback triggered for', tabName);
      this.updateActiveTab(tabName);
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Sidebar toggle button
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    sidebarToggleBtn?.addEventListener('click', () => this.toggleSidebar());

    // Sidebar tab navigation
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', async (e) => {
        const tabName = e.currentTarget.dataset.tab;
        await this.switchTab(tabName, true); // true = update hash
      });
    });

    // Settings button (direct shortcut to settings tab)
    const settingsBtn = document.getElementById('settingsBtn');
    settingsBtn?.addEventListener('click', () => this.switchTab('settings', true));

    // Hash change (browser back/forward)
    window.addEventListener('hashchange', async (e) => {
      console.log('=== HASHCHANGE EVENT FIRED ===');
      console.log('Old URL:', e.oldURL);
      console.log('New URL:', e.newURL);
      console.log('Current hash:', window.location.hash);

      const tab = window.location.hash.slice(1) || 'research';
      console.log('Switching to tab from hash:', tab);

      await this.switchTab(tab, false); // false = don't update hash again
    });

    // Listen for state changes to refresh project data
    store.subscribe((state, updates) => {
      if (updates.project) {
        this.updateHeader(state.project, state.stats);
      }
    });
  }

  /**
   * Switch to a tab
   */
  async switchTab(tabName, updateHash = true) {
    console.log(`ProjectContainer: switchTab called - tab: ${tabName}, updateHash: ${updateHash}`);

    const success = await this.tabManager.switchTo(tabName);

    if (success) {
      console.log('ProjectContainer: Tab switch succeeded');
      this.updateActiveTab(tabName);

      if (updateHash) {
        console.log(`ProjectContainer: Updating hash to #${tabName}`);
        window.location.hash = tabName;
      } else {
        console.log('ProjectContainer: Skipping hash update');
      }
    } else {
      console.log('ProjectContainer: Tab switch returned false (already on this tab or failed)');
      // Still update UI to ensure active state is correct
      this.updateActiveTab(tabName);
    }
  }

  /**
   * Update active tab UI
   */
  updateActiveTab(tabName) {
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
    });

    // Update page title
    const project = store.get('project');
    if (project) {
      const tabTitles = {
        research: 'Notes & Docs',
        kanban: 'Kanban',
        settings: 'Settings'
      };
      document.title = `${project.name} - ${tabTitles[tabName] || 'Project'} - AI Dev Platform`;
    }
  }

  /**
   * Update header with project info
   */
  updateHeader(project, stats) {
    // Project title
    const titleEl = document.getElementById('projectTitle');
    if (titleEl) {
      titleEl.textContent = project.name;
    }

    // Project stats
    const statsEl = document.getElementById('projectStats');
    if (statsEl) {
      const parts = [];

      if (stats.researchSessions > 0) {
        parts.push(`${stats.researchSessions} ${stats.researchSessions === 1 ? 'session' : 'sessions'}`);
      }

      if (stats.tasks > 0) {
        parts.push(`${stats.tasks} ${stats.tasks === 1 ? 'task' : 'tasks'}`);
      }

      if (stats.generations > 0) {
        parts.push(`${stats.generations} ${stats.generations === 1 ? 'generation' : 'generations'}`);
      }

      statsEl.textContent = parts.length > 0 ? parts.join(' • ') : 'No activity yet';
    }

    // GitHub link
    const githubLink = document.getElementById('githubLink');
    if (project.githubRepoUrl) {
      githubLink.href = project.githubRepoUrl;
      githubLink.classList.remove('hidden');
    } else {
      githubLink.classList.add('hidden');
    }
  }

  /**
   * Refresh project data
   */
  async refresh() {
    try {
      await this.loadProject();
      await this.tabManager.refresh();
      toast.success('Project refreshed');
    } catch (error) {
      console.error('Error refreshing project:', error);
      toast.error('Failed to refresh project');
    }
  }

  /**
   * Initialize sidebar state from localStorage
   */
  initSidebarState() {
    const sidebar = document.querySelector('.project-sidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');

    if (this.sidebarCollapsed) {
      sidebar?.classList.add('collapsed');
      toggleBtn?.classList.add('active');
    }
  }

  /**
   * Toggle sidebar visibility
   */
  toggleSidebar() {
    const sidebar = document.querySelector('.project-sidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');

    this.sidebarCollapsed = !this.sidebarCollapsed;

    sidebar?.classList.toggle('collapsed', this.sidebarCollapsed);
    toggleBtn?.classList.toggle('active', this.sidebarCollapsed);

    // Save state to localStorage
    localStorage.setItem('sidebarCollapsed', this.sidebarCollapsed.toString());
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  new ProjectContainer();
});

// Export for debugging
window.projectContainer = ProjectContainer;

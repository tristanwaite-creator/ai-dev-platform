/**
 * Quick Start Wizard Component
 * Multi-step wizard for rapid project creation
 */

import { api } from '../core/api.js';
import { showModal } from './modal.js';
import { toast } from './toast.js';

export class QuickStartWizard {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 3;
    this.data = {
      projectName: '',
      description: '',
      createRepo: true,
      repoName: '',
      isPrivate: true,
      taskTitle: '',
      taskDescription: ''
    };
  }

  /**
   * Show the wizard
   */
  show() {
    const content = this.renderWizard();

    this.modal = showModal({
      title: '⚡ Quick Start',
      content,
      size: 'lg',
      showClose: true,
      closeOnBackdrop: false,
      footer: this.renderFooter()
    });

    this.setupEventListeners();
    this.updateStepVisibility();
  }

  /**
   * Render wizard steps
   */
  renderWizard() {
    const container = document.createElement('div');
    container.className = 'quick-start-wizard';

    container.innerHTML = `
      <div class="wizard-subtitle">Create a project and jump straight to building</div>

      <!-- Progress Indicator -->
      <div class="wizard-progress">
        <div class="wizard-progress-bar">
          <div class="wizard-progress-fill" style="width: ${(this.currentStep / this.totalSteps) * 100}%"></div>
        </div>
        <div class="wizard-steps-indicator">
          ${Array.from({ length: this.totalSteps }, (_, i) => `
            <div class="wizard-step-dot ${i + 1 === this.currentStep ? 'active' : ''} ${i + 1 < this.currentStep ? 'completed' : ''}">
              ${i + 1 < this.currentStep ? '✓' : i + 1}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Step 1: Project Details -->
      <div class="wizard-step" data-step="1">
        <h3 class="wizard-step-title">Project Details</h3>
        <p class="wizard-step-subtitle">Give your project a name and description</p>

        <div class="form-group">
          <label class="form-label" for="qs-project-name">Project Name *</label>
          <input
            type="text"
            id="qs-project-name"
            class="form-input"
            placeholder="My Awesome Project"
            value="${this.data.projectName}"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="qs-description">Description</label>
          <textarea
            id="qs-description"
            class="form-textarea"
            rows="3"
            placeholder="What is this project about?"
          >${this.data.description}</textarea>
        </div>
      </div>

      <!-- Step 2: GitHub Repository -->
      <div class="wizard-step hidden" data-step="2">
        <h3 class="wizard-step-title">GitHub Repository</h3>
        <p class="wizard-step-subtitle">Optionally create a GitHub repository</p>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="qs-create-repo" ${this.data.createRepo ? 'checked' : ''} />
            <span>Create GitHub repository</span>
          </label>
        </div>

        <div id="qs-repo-options" class="${!this.data.createRepo ? 'hidden' : ''}">
          <div class="form-group">
            <label class="form-label" for="qs-repo-name">Repository Name *</label>
            <input
              type="text"
              id="qs-repo-name"
              class="form-input"
              placeholder="my-awesome-project"
              value="${this.data.repoName}"
            />
            <span class="form-help">Will be auto-generated from project name</span>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="qs-private-repo" ${this.data.isPrivate ? 'checked' : ''} />
              <span>Make repository private</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Step 3: First Task -->
      <div class="wizard-step hidden" data-step="3">
        <h3 class="wizard-step-title">First Task</h3>
        <p class="wizard-step-subtitle">What do you want to build first?</p>

        <div class="form-group">
          <label class="form-label" for="qs-task-title">Task Title *</label>
          <input
            type="text"
            id="qs-task-title"
            class="form-input"
            placeholder="Build a landing page"
            value="${this.data.taskTitle}"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="qs-task-description">Task Description</label>
          <textarea
            id="qs-task-description"
            class="form-textarea"
            rows="4"
            placeholder="Create a modern landing page with hero section, features, and CTA..."
          >${this.data.taskDescription}</textarea>
          <span class="form-help">Be specific about what you want to build</span>
        </div>
      </div>
    `;

    return container;
  }

  /**
   * Render footer buttons
   */
  renderFooter() {
    return `
      <button class="btn btn-secondary" id="qs-cancel">Cancel</button>
      <div style="flex: 1"></div>
      <button class="btn btn-ghost" id="qs-back" ${this.currentStep === 1 ? 'disabled' : ''}>
        ← Back
      </button>
      <button class="btn btn-primary" id="qs-next">
        ${this.currentStep === this.totalSteps ? 'Create & Start Building →' : 'Next →'}
      </button>
    `;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    const modal = this.modal.element;

    // Cancel button
    modal.querySelector('#qs-cancel')?.addEventListener('click', () => {
      this.modal.close();
    });

    // Back button
    modal.querySelector('#qs-back')?.addEventListener('click', () => {
      this.previousStep();
    });

    // Next/Create button
    modal.querySelector('#qs-next')?.addEventListener('click', () => {
      if (this.currentStep === this.totalSteps) {
        this.create();
      } else {
        this.nextStep();
      }
    });

    // Auto-fill repo name from project name
    modal.querySelector('#qs-project-name')?.addEventListener('input', (e) => {
      const repoName = e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const repoInput = modal.querySelector('#qs-repo-name');
      if (repoInput) repoInput.value = repoName;
    });

    // Toggle repo options
    modal.querySelector('#qs-create-repo')?.addEventListener('change', (e) => {
      const options = modal.querySelector('#qs-repo-options');
      options?.classList.toggle('hidden', !e.target.checked);
    });

    // Form validation on input
    modal.querySelectorAll('input, textarea').forEach(input => {
      input.addEventListener('blur', () => this.validateStep(this.currentStep));
    });
  }

  /**
   * Next step
   */
  async nextStep() {
    if (!this.validateStep(this.currentStep)) {
      return;
    }

    this.saveStepData(this.currentStep);

    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.updateStepVisibility();
      this.updateFooter();
    }
  }

  /**
   * Previous step
   */
  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.updateStepVisibility();
      this.updateFooter();
    }
  }

  /**
   * Update step visibility
   */
  updateStepVisibility() {
    const modal = this.modal.element;

    modal.querySelectorAll('.wizard-step').forEach(step => {
      const stepNum = parseInt(step.dataset.step);
      step.classList.toggle('hidden', stepNum !== this.currentStep);

      if (stepNum === this.currentStep) {
        step.classList.add('animate-fadeIn');
      }
    });

    // Update progress
    const progressFill = modal.querySelector('.wizard-progress-fill');
    if (progressFill) {
      progressFill.style.width = `${(this.currentStep / this.totalSteps) * 100}%`;
    }

    // Update step dots
    modal.querySelectorAll('.wizard-step-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i + 1 === this.currentStep);
      dot.classList.toggle('completed', i + 1 < this.currentStep);
      dot.innerHTML = i + 1 < this.currentStep ? '✓' : i + 1;
    });
  }

  /**
   * Update footer buttons
   */
  updateFooter() {
    const footer = this.modal.element.querySelector('.modal-footer');
    footer.innerHTML = this.renderFooter();
    this.setupEventListeners();
  }

  /**
   * Validate current step
   */
  validateStep(step) {
    const modal = this.modal.element;

    if (step === 1) {
      const projectName = modal.querySelector('#qs-project-name').value.trim();
      if (!projectName) {
        toast.error('Please enter a project name');
        return false;
      }
    }

    if (step === 2) {
      const createRepo = modal.querySelector('#qs-create-repo').checked;
      if (createRepo) {
        const repoName = modal.querySelector('#qs-repo-name').value.trim();
        if (!repoName) {
          toast.error('Please enter a repository name');
          return false;
        }
      }
    }

    if (step === 3) {
      const taskTitle = modal.querySelector('#qs-task-title').value.trim();
      if (!taskTitle) {
        toast.error('Please enter a task title');
        return false;
      }
    }

    return true;
  }

  /**
   * Save step data
   */
  saveStepData(step) {
    const modal = this.modal.element;

    if (step === 1) {
      this.data.projectName = modal.querySelector('#qs-project-name').value.trim();
      this.data.description = modal.querySelector('#qs-description').value.trim();
    }

    if (step === 2) {
      this.data.createRepo = modal.querySelector('#qs-create-repo').checked;
      this.data.repoName = modal.querySelector('#qs-repo-name').value.trim();
      this.data.isPrivate = modal.querySelector('#qs-private-repo').checked;
    }

    if (step === 3) {
      this.data.taskTitle = modal.querySelector('#qs-task-title').value.trim();
      this.data.taskDescription = modal.querySelector('#qs-task-description').value.trim();
    }
  }

  /**
   * Create project and task
   */
  async create() {
    if (!this.validateStep(this.currentStep)) {
      return;
    }

    this.saveStepData(this.currentStep);

    // Show loading
    const nextBtn = this.modal.element.querySelector('#qs-next');
    const originalText = nextBtn.textContent;
    nextBtn.disabled = true;
    nextBtn.innerHTML = '<div class="spinner spinner-sm"></div> Creating...';

    try {
      let project;

      // Create project with or without GitHub
      if (this.data.createRepo) {
        const response = await api.post('/projects/create-with-github', {
          name: this.data.projectName,
          description: this.data.description || undefined,
          repoName: this.data.repoName,
          private: this.data.isPrivate
        });
        project = response.project;
      } else {
        const response = await api.post('/projects', {
          name: this.data.projectName,
          description: this.data.description || undefined
        });
        project = response.project;
      }

      // Create task in "building" column
      await api.post(`/projects/${project.id}/tasks`, {
        title: this.data.taskTitle,
        description: this.data.taskDescription || undefined,
        column: 'building', // Start in building to trigger generation
        priority: 'high'
      });

      // Success!
      toast.success('Project created! Redirecting to Kanban board...');

      // Close modal
      this.modal.close();

      // Redirect to project Kanban tab
      setTimeout(() => {
        window.location.href = `/project.html?id=${project.id}#kanban`;
      }, 500);

    } catch (error) {
      console.error('Error creating project:', error);
      toast.error(error.message || 'Failed to create project. Please try again.');

      // Restore button
      nextBtn.disabled = false;
      nextBtn.textContent = originalText;
    }
  }
}

// Export convenience function
export function showQuickStart() {
  const wizard = new QuickStartWizard();
  wizard.show();
  return wizard;
}

export default QuickStartWizard;

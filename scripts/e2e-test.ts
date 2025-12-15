/**
 * End-to-End Test Suite using Puppeteer
 * Tests all major features of the AI Dev Platform
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FRONTEND_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = './test-screenshots';

// Test user credentials
const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'TestPass123!',
  name: 'Test User',
};

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  screenshots: string[];
}

class E2ETestRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private results: TestResult[] = [];
  private accessToken: string | null = null;

  async setup(): Promise<void> {
    console.log('\n========================================');
    console.log('  AI Dev Platform - E2E Test Suite');
    console.log('========================================\n');

    // Create screenshot directory
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // Clear old screenshots
    const files = fs.readdirSync(SCREENSHOT_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, file));
    }

    console.log('Launching browser...');
    this.browser = await puppeteer.launch({
      headless: false, // Set to true for CI
      slowMo: 50, // Slow down for debugging
      args: ['--window-size=1400,900'],
      defaultViewport: { width: 1400, height: 900 },
    });

    this.page = await this.browser.newPage();

    // Enable console logging from the page
    this.page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') {
        console.log(`  [Browser Error] ${msg.text()}`);
      }
    });

    // Log network errors
    this.page.on('pageerror', (err) => {
      console.log(`  [Page Error] ${err.message}`);
    });

    console.log('Browser launched successfully\n');
  }

  async teardown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    this.printResults();
  }

  async screenshot(name: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    const filename = `${Date.now()}-${name}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await this.page.screenshot({ path: filepath, fullPage: true });
    console.log(`    Screenshot: ${filename}`);
    return filename;
  }

  async runTest(
    name: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    console.log(`\nTest: ${name}`);
    console.log('-'.repeat(40));

    const startTime = Date.now();
    const screenshots: string[] = [];
    const result: TestResult = {
      name,
      passed: false,
      duration: 0,
      screenshots,
    };

    try {
      await testFn();
      result.passed = true;
      console.log(`  PASSED (${Date.now() - startTime}ms)`);
    } catch (error: any) {
      result.error = error.message;
      console.log(`  FAILED: ${error.message}`);

      // Take error screenshot
      try {
        const errorScreenshot = await this.screenshot(`error-${name.replace(/\s+/g, '-')}`);
        screenshots.push(errorScreenshot);
      } catch {}
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
  }

  printResults(): void {
    console.log('\n========================================');
    console.log('  Test Results Summary');
    console.log('========================================\n');

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;

    for (const result of this.results) {
      const status = result.passed ? 'PASS' : 'FAIL';
      const statusIcon = result.passed ? '✓' : '✗';
      console.log(`  ${statusIcon} ${result.name} (${result.duration}ms)`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }

    console.log('\n----------------------------------------');
    console.log(`  Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`  Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log('----------------------------------------\n');

    if (failed > 0) {
      console.log(`Screenshots saved to: ${SCREENSHOT_DIR}/`);
    }
  }

  // ==========================================
  // Test Cases
  // ==========================================

  async testBackendHealth(): Promise<void> {
    console.log('  Checking backend health...');
    const response = await fetch(`${BACKEND_URL}/api/health`);
    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error(`Backend unhealthy: ${JSON.stringify(data)}`);
    }

    console.log(`    API: ${data.services.api}`);
    console.log(`    Database: ${data.services.database}`);
    console.log(`    Claude: ${data.services.claude}`);
    console.log(`    E2B: ${data.services.e2b}`);
  }

  async testFrontendLoads(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('  Loading frontend...');
    await this.page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });

    // Check for login page elements
    const title = await this.page.title();
    console.log(`    Page title: ${title}`);

    await this.screenshot('01-login-page');

    // Look for login form or main content
    const hasLoginForm = await this.page.$('input[type="email"], input[type="text"]');
    const hasGitHubButton = await this.page.$('button');

    if (!hasLoginForm && !hasGitHubButton) {
      throw new Error('Login page elements not found');
    }

    console.log('    Login page loaded successfully');
  }

  async testUserRegistration(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('  Registering new user via API...');

    // Register via API (backend)
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER),
    });

    const data = await response.json();

    if (!response.ok) {
      // User might already exist, try login instead
      console.log('    Registration failed, trying login...');
      return this.testUserLogin();
    }

    console.log(`    User registered: ${data.user?.email || 'success'}`);
    this.accessToken = data.tokens?.accessToken;
    console.log(`    Token received: ${this.accessToken ? 'yes' : 'no'}`);
  }

  async testUserLogin(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('  Logging in user via API...');

    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Login failed: ${data.error || 'Unknown error'}`);
    }

    console.log(`    Login successful`);
    this.accessToken = data.tokens?.accessToken;
    console.log(`    Token received: ${this.accessToken ? 'yes' : 'no'}`);
  }

  async testDashboardNavigation(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    if (!this.accessToken) throw new Error('No access token - login failed');

    console.log('  Navigating to dashboard...');
    console.log(`    Token: ${this.accessToken.substring(0, 20)}...`);

    // Navigate to home first
    await this.page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });

    // Set auth token in localStorage
    await this.page.evaluate((token) => {
      localStorage.setItem('accessToken', token);
      localStorage.setItem('auth', JSON.stringify({ accessToken: token }));
    }, this.accessToken);

    // Now navigate to dashboard
    await this.page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'networkidle2' });
    await wait(2000);

    await this.screenshot('02-dashboard');

    // Check page content
    const content = await this.page.content();
    const hasProjects = content.includes('Projects') || content.includes('project');
    console.log(`    Dashboard loaded: ${hasProjects ? 'yes' : 'checking...'}`);
  }

  async testProjectCreation(): Promise<void> {
    if (!this.page || !this.accessToken) throw new Error('Not initialized');

    console.log('  Creating a new project...');

    // Create project via API
    const response = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        name: `Test Project ${Date.now()}`,
        description: 'E2E Test Project',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Project creation failed: ${data.error || 'Unknown error'}`);
    }

    console.log(`    Project created: ${data.project?.name || data.id}`);

    // Refresh dashboard to see new project
    await this.page.reload({ waitUntil: 'networkidle2' });
    await wait(1000);

    await this.screenshot('03-project-created');
  }

  async testKanbanBoard(): Promise<void> {
    if (!this.page || !this.accessToken) throw new Error('Not initialized');

    console.log('  Testing Kanban board...');

    // Get first project
    const projectsResponse = await fetch(`${BACKEND_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    const projectsData = await projectsResponse.json();

    if (!projectsData.projects || projectsData.projects.length === 0) {
      throw new Error('No projects found');
    }

    const projectId = projectsData.projects[0].id;
    console.log(`    Opening project: ${projectId}`);

    // Navigate to project
    await this.page.goto(`${FRONTEND_URL}/project/${projectId}`, { waitUntil: 'networkidle2' });
    await wait(2000);

    await this.screenshot('04-kanban-board');

    // Look for kanban columns
    const columns = await this.page.$$('[class*="kanban"], [class*="column"], [class*="board"]');
    console.log(`    Found ${columns.length} kanban elements`);

    // Create a task via API
    const taskResponse = await fetch(`${BACKEND_URL}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        title: 'E2E Test Task',
        description: 'Created by automated test',
        status: 'todo',
      }),
    });

    const taskData = await taskResponse.json();
    console.log(`    Task created: ${taskData.id || 'success'}`);

    await this.page.reload({ waitUntil: 'networkidle2' });
    await wait(1000);

    await this.screenshot('05-task-created');
  }

  async testPagesView(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('  Testing Pages view...');

    // Look for Pages tab and click it
    const pagesTab = await this.page.$('text/Pages');
    if (pagesTab) {
      await pagesTab.click();
      await wait(1500);
      console.log('    Switched to Pages view');
    } else {
      // Try clicking by role
      const tabs = await this.page.$$('[role="tab"]');
      for (const tab of tabs) {
        const text = await tab.evaluate((el) => el.textContent);
        if (text?.includes('Pages')) {
          await tab.click();
          await wait(1500);
          console.log('    Switched to Pages view');
          break;
        }
      }
    }

    await this.screenshot('06-pages-view');
  }

  async testAIAssistant(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('  Testing AI Assistant bubble...');

    // Look for the assistant bubble
    const bubbleSelectors = [
      '[class*="assistant"]',
      '[class*="bubble"]',
      '[class*="sparkle"]',
      'button[class*="fixed"]',
    ];

    let bubble = null;
    for (const selector of bubbleSelectors) {
      bubble = await this.page.$(selector);
      if (bubble) break;
    }

    if (bubble) {
      console.log('    Found AI Assistant bubble');
      await bubble.click();
      await wait(1000);
      await this.screenshot('07-ai-assistant-open');
    } else {
      console.log('    AI Assistant bubble not found (may be hidden or different selector)');
    }
  }

  async testThemeToggle(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('  Testing theme toggle...');

    // Look for theme toggle button
    const themeButtons = await this.page.$$('button');
    let themeButton = null;

    for (const btn of themeButtons) {
      const html = await btn.evaluate((el) => el.innerHTML);
      if (html.includes('sun') || html.includes('moon') || html.includes('Sun') || html.includes('Moon')) {
        themeButton = btn;
        break;
      }
    }

    if (themeButton) {
      await themeButton.click();
      await wait(500);
      await this.screenshot('08-theme-toggled');
      console.log('    Theme toggled');
    } else {
      console.log('    Theme toggle not found');
    }
  }

  async testAPIEndpoints(): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated');

    console.log('  Testing API endpoints...');

    const endpoints = [
      { method: 'GET', path: '/api/health', auth: false },
      { method: 'GET', path: '/api/auth/me', auth: true },
      { method: 'GET', path: '/api/projects', auth: true },
    ];

    for (const endpoint of endpoints) {
      const headers: Record<string, string> = {};
      if (endpoint.auth) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await fetch(`${BACKEND_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers,
      });

      console.log(`    ${endpoint.method} ${endpoint.path}: ${response.status}`);

      if (!response.ok && endpoint.auth) {
        throw new Error(`API endpoint failed: ${endpoint.path}`);
      }
    }
  }

  // ==========================================
  // Main Test Runner
  // ==========================================

  async run(): Promise<void> {
    try {
      await this.setup();

      // Run all tests
      await this.runTest('Backend Health Check', () => this.testBackendHealth());
      await this.runTest('Frontend Loads', () => this.testFrontendLoads());
      await this.runTest('User Registration/Login', () => this.testUserRegistration());
      await this.runTest('Dashboard Navigation', () => this.testDashboardNavigation());
      await this.runTest('Project Creation', () => this.testProjectCreation());
      await this.runTest('Kanban Board', () => this.testKanbanBoard());
      await this.runTest('Pages View', () => this.testPagesView());
      await this.runTest('AI Assistant', () => this.testAIAssistant());
      await this.runTest('Theme Toggle', () => this.testThemeToggle());
      await this.runTest('API Endpoints', () => this.testAPIEndpoints());

    } catch (error: any) {
      console.error('Test suite error:', error.message);
    } finally {
      await this.teardown();
    }
  }
}

// Run tests
const runner = new E2ETestRunner();
runner.run().catch(console.error);

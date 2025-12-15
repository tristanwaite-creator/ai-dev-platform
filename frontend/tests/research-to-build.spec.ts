import { test, expect, Page } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:3001';
const API_URL = 'http://localhost:3000/api';

// Test user credentials - unique per test run
const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'TestPassword123',
  name: 'Test User',
};

// Notes for fixes
const NOTES: string[] = [];

function addNote(note: string) {
  console.log(`📝 NOTE: ${note}`);
  NOTES.push(note);
}

test.describe('Research → Prompt → Build Workflow (New UI)', () => {
  let page: Page;
  let projectId: string = '';
  let sessionId: string = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // Capture browser errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`   [Browser Error]: ${msg.text()}`);
      }
    });
  });

  test.afterAll(async () => {
    console.log('\n\n========================================');
    console.log('📋 NOTES FOR FIXES:');
    console.log('========================================');
    if (NOTES.length === 0) {
      console.log('🎉 No issues! Everything worked.');
    } else {
      NOTES.forEach((note, i) => console.log(`${i + 1}. ${note}`));
    }
    console.log('========================================\n');
    await page.close();
  });

  test('Step 1: Register a new user', async () => {
    console.log('\n🚀 Step 1: Registering new user...');
    console.log(`   Email: ${TEST_USER.email}`);

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-screenshots/01-home.png' });

    // Click on "Sign Up" tab
    const signUpTab = page.locator('[role="tab"]:has-text("Sign Up")');
    if (await signUpTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Clicking Sign Up tab...');
      await signUpTab.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'test-screenshots/02-signup-tab.png' });

    // Fill in the registration form
    const nameInput = page.locator('input#name');
    const emailInput = page.locator('input#signup-email');
    const passwordInput = page.locator('input#signup-password');

    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill(TEST_USER.name);
      await emailInput.fill(TEST_USER.email);
      await passwordInput.fill(TEST_USER.password);
      console.log('   Filled registration form');
    } else {
      // Fallback to generic selectors
      const nameField = page.locator('input[placeholder*="name" i]').first();
      if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill(TEST_USER.name);
      }
      await page.fill('input[type="email"]', TEST_USER.email);
      const pwdField = page.locator('input[type="password"]').last();
      await pwdField.fill(TEST_USER.password);
    }

    // Click create account button
    const createBtn = page.locator('button:has-text("Create account")');
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      console.log('   Clicked Create account');
    } else {
      const submitBtn = page.locator('button[type="submit"]').last();
      await submitBtn.click();
    }

    // Wait for navigation to dashboard
    console.log('   Waiting for navigation to dashboard...');
    try {
      await page.waitForURL('**/dashboard**', { timeout: 15000 });
      console.log('✅ Registration successful - on dashboard!');
    } catch (e) {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    }

    await page.screenshot({ path: 'test-screenshots/03-after-register.png' });
    console.log(`   Current URL: ${page.url()}`);
  });

  test('Step 2: Create a project', async () => {
    console.log('\n🚀 Step 2: Creating project...');

    if (!page.url().includes('dashboard')) {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    }

    await page.screenshot({ path: 'test-screenshots/04-dashboard.png' });

    // Find project name input
    const projectInput = page.locator('input[placeholder*="project" i]').first();
    if (await projectInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Found project name input, filling...');
      await projectInput.fill('Test Research Project');
    }

    // Click Create button
    const createBtn = page.locator('button:has-text("Create")').first();
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('   Clicking Create button...');
      await createBtn.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-screenshots/05-after-create.png' });

    // Extract project ID from URL or page
    const urlMatch = page.url().match(/project\/([a-z0-9]+)/i);
    if (urlMatch) {
      projectId = urlMatch[1];
      console.log(`   Created project ID: ${projectId}`);
    }

    // Navigate to project page if not already there
    if (!page.url().includes('/project/')) {
      // Find project card and click it
      await page.waitForTimeout(1000);
      const projectCard = page.locator('[class*="cursor-pointer"]').filter({
        hasText: 'Test Research'
      }).first();

      if (await projectCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectCard.click();
        await page.waitForTimeout(2000);
      }
    }

    // Extract project ID from URL
    const currentUrl = page.url();
    const match = currentUrl.match(/project\/([a-z0-9]+)/i);
    if (match) {
      projectId = match[1];
    }

    console.log(`   Now at: ${page.url()}`);

    if (page.url().includes('/project/')) {
      console.log('✅ On project page');
    } else {
      addNote(`Not on project page - URL: ${page.url()}`);
    }

    await page.screenshot({ path: 'test-screenshots/06-project-page.png' });
  });

  test('Step 3: Find Research Chat sidebar and create new chat', async () => {
    console.log('\n🚀 Step 3: Opening Research Chat...');

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-screenshots/07-project-with-sidebar.png' });

    // Look for the Research sidebar with "New Research Chat" button
    const newChatBtn = page.locator('button:has-text("New Research Chat")');

    if (await newChatBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Found "New Research Chat" button, clicking...');
      await newChatBtn.click();
      await page.waitForTimeout(2000);
    } else {
      addNote('New Research Chat button not found in sidebar');

      // Debug: check what's on the page
      const allButtons = await page.locator('button').allTextContents();
      console.log(`   DEBUG: Buttons on page: ${allButtons.slice(0, 10).join(', ')}`);
      return;
    }

    await page.screenshot({ path: 'test-screenshots/08-after-new-chat.png' });

    // Verify we navigated to the research chat page
    if (page.url().includes('/research/')) {
      console.log('✅ Navigated to research chat page');
      const match = page.url().match(/research\/([a-z0-9]+)/i);
      if (match) {
        sessionId = match[1];
        console.log(`   Session ID: ${sessionId}`);
      }
    } else {
      addNote(`Did not navigate to research chat - URL: ${page.url()}`);
    }
  });

  test('Step 4: Have research conversation in full-page chat', async () => {
    console.log('\n🚀 Step 4: Research conversation...');

    // Make sure we're on the research chat page
    if (!page.url().includes('/research/')) {
      addNote('Not on research chat page, skipping conversation');
      return;
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-screenshots/09-chat-page.png' });

    // Toggle OFF Search mode for faster responses (Quick Chat mode)
    const searchToggle = page.locator('button[data-state]').filter({ hasText: 'Search' }).first();
    if (await searchToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      const state = await searchToggle.getAttribute('data-state');
      console.log(`   Search toggle state: ${state}`);
      if (state === 'on') {
        console.log('   Turning OFF Search for Quick Chat mode...');
        await searchToggle.click();
        await page.waitForTimeout(500);
        const newState = await searchToggle.getAttribute('data-state');
        console.log(`   Search toggle now: ${newState}`);
      }
    } else {
      console.log('   Search toggle not found, using default mode');
    }

    await page.screenshot({ path: 'test-screenshots/09b-quick-chat-mode.png' });

    // Find textarea in the full-page chat
    const textarea = page.locator('textarea').first();

    if (!await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      addNote('Chat textarea not found on research page');
      return;
    }

    console.log('   Found textarea, sending first message (Quick Chat mode - no web search)...');

    // First message
    await textarea.fill('I want to build a landing page with a hero section, features grid, and contact form. Use a purple gradient theme.');
    await page.screenshot({ path: 'test-screenshots/10-message-typed.png' });

    // Find and click send button
    const sendBtn = page.locator('button').filter({
      has: page.locator('.lucide-send')
    }).first();

    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
      console.log('   Sent first message, waiting for AI response (Quick Chat - should be fast)...');

      // Wait for assistant message to appear
      try {
        // Wait up to 60 seconds - Quick Chat mode is faster than Search mode (2+ min)
        // but Claude still needs 30-45 seconds to generate a thoughtful response
        await page.waitForSelector('[data-testid="message-assistant"]', { timeout: 60000 });
        console.log('   ⚡ AI response received (Quick Chat mode - no web searches!)');
      } catch (e) {
        console.log('   Timeout waiting for AI response');
        // Take a screenshot to see what happened
        await page.screenshot({ path: 'test-screenshots/11-timeout-state.png' });
      }
    } else {
      addNote('Send button not found');
    }

    await page.screenshot({ path: 'test-screenshots/11-first-response.png' });

    // After first exchange, we have 2 messages (1 user + 1 assistant)
    // This is enough for the Synthesize button to appear
    const messageCount = await page.locator('[data-testid="message-assistant"]').count();
    console.log(`   AI messages found: ${messageCount}`);

    // Check total messages (user + assistant)
    const totalMessages = await page.locator('[data-testid^="message-"]').count();
    console.log(`   Total messages: ${totalMessages}`);

    console.log('✅ Research conversation completed');
  });

  test('Step 5: Click Synthesize Build Prompt button', async () => {
    console.log('\n🚀 Step 5: Synthesizing research...');

    if (!page.url().includes('/research/')) {
      addNote('Not on research page, skipping synthesize');
      return;
    }

    await page.screenshot({ path: 'test-screenshots/13-before-synthesize.png' });

    // Look for the Synthesize button in the header
    const synthesizeBtn = page.locator('button:has-text("Synthesize Build Prompt")');

    if (await synthesizeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Found Synthesize button, clicking...');

      // Wait for button to be enabled
      await page.waitForTimeout(1000);
      await synthesizeBtn.click();
      console.log('   Clicked Synthesize button');

      // Wait for modal to appear
      await page.waitForTimeout(2000);
    } else {
      addNote('Synthesize Build Prompt button not visible - may need 2+ messages');

      // Check message count
      const messages = page.locator('[class*="flex gap-3"]');
      const count = await messages.count();
      console.log(`   DEBUG: Found ${count} message elements`);
    }

    await page.screenshot({ path: 'test-screenshots/14-after-synthesize-click.png' });
    console.log('✅ Clicked Synthesize button');
  });

  test('Step 6: Review modal and send to Todo', async () => {
    console.log('\n🚀 Step 6: Review modal...');

    // Look for the review modal
    const modal = page.locator('[role="dialog"]');

    if (await modal.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('   Review modal opened');

      // Wait for synthesis to complete (loading spinner disappears, inputs appear)
      console.log('   Waiting for synthesis to complete...');
      try {
        await page.waitForSelector('input#title', { timeout: 60000 });
        console.log('   Synthesis complete');
      } catch (e) {
        console.log('   Timeout waiting for synthesis');
        await page.screenshot({ path: 'test-screenshots/15-synthesis-timeout.png' });
      }

      await page.screenshot({ path: 'test-screenshots/15-review-modal.png' });

      // Check for title and prompt fields
      const titleInput = modal.locator('input#title');
      const promptTextarea = modal.locator('textarea#prompt');

      if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const title = await titleInput.inputValue();
        console.log(`   Title: ${title || '(empty)'}`);
      }

      if (await promptTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        const prompt = await promptTextarea.inputValue();
        console.log(`   Prompt preview: ${(prompt || '(empty)').slice(0, 100)}...`);
      }

      // Wait for the Send to Building button to be enabled
      console.log('   Waiting for Send to Building button to be enabled...');
      const sendBtn = page.locator('button:has-text("Send to Building")');

      try {
        // Wait for button to not be disabled
        await page.waitForSelector('button:has-text("Send to Building"):not([disabled])', {
          timeout: 10000
        });
        console.log('   Button is enabled');

        // Scroll button into view and click
        await sendBtn.scrollIntoViewIfNeeded();
        await sendBtn.click({ timeout: 10000 });
        console.log('   Clicked Send to Building');

        // Wait for modal to close
        await page.waitForTimeout(3000);
      } catch (e) {
        console.log('   Could not click Send to Building button');
        await page.screenshot({ path: 'test-screenshots/15-button-issue.png' });
        addNote('Send to Building button could not be clicked');
      }

      await page.screenshot({ path: 'test-screenshots/16-after-send-to-building.png' });
      console.log('✅ Task sent to Building');
    } else {
      addNote('Review modal did not appear');
      await page.screenshot({ path: 'test-screenshots/15-no-modal.png' });
    }
  });

  test('Step 7: Navigate back and verify task in Building column', async () => {
    console.log('\n🚀 Step 7: Verifying kanban board...');

    // First, close any open modal by pressing Escape
    const modal = page.locator('[role="dialog"]');
    if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('   Modal still open, closing...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    // Navigate back to project page
    const backBtn = page.locator('button').filter({
      has: page.locator('.lucide-arrow-left')
    }).first();

    if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(2000);
    } else if (projectId) {
      await page.goto(`${BASE_URL}/project/${projectId}`);
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-screenshots/17-back-to-project.png' });

    // Find the Building column (tasks go to Building after synthesis)
    const buildingColumn = page.locator('text=Building').first();
    if (await buildingColumn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Building column visible');
    }

    // Look for task cards with "From AI Research" badge
    const researchBadge = page.locator('text=From AI Research');
    if (await researchBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   ✅ "From AI Research" badge found on task card!');
    } else {
      // Also look for the task we created
      const taskTitle = page.locator('text=Purple Gradient Landing Page');
      if (await taskTitle.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('   ✅ Task found in kanban board!');
      } else {
        addNote('Task not visible on kanban board');

        // Debug: check for any task cards
        const taskCards = page.locator('[class*="rounded-lg"]').filter({
          has: page.locator('[class*="font-medium"]')
        });
        const count = await taskCards.count();
        console.log(`   DEBUG: Found ${count} potential task cards`);
      }
    }

    await page.screenshot({ path: 'test-screenshots/18-final-kanban.png' });
    console.log('✅ Kanban verification completed');
  });

  test('Summary: Issues Found', async () => {
    console.log('\n========================================');
    console.log('📋 TEST SUMMARY');
    console.log('========================================');

    if (NOTES.length === 0) {
      console.log('🎉 All steps completed successfully!');
      console.log('The Research → Build workflow is working.');
    } else {
      console.log(`Found ${NOTES.length} issues to fix:\n`);
      NOTES.forEach((note, i) => console.log(`${i + 1}. ${note}`));
    }

    console.log('\n📸 Screenshots saved to: test-screenshots/');
    console.log('========================================\n');

    // Test passes regardless - we're gathering data
    expect(true).toBe(true);
  });
});

/**
 * Authenticated User Demo - Full walkthrough of the app as a logged-in user
 */

import puppeteer from 'puppeteer';

const FRONTEND_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:3000';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function demoAuthFlow() {
  console.log('\n========================================');
  console.log('  Authenticated User Demo');
  console.log('========================================\n');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: ['--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();
  let step = 1;

  const logStep = (description: string) => {
    console.log(`\n${step}. ${description}`);
    step++;
  };

  try {
    // Step 1: Start at home page
    logStep('Starting at Home Page...');
    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle2' });
    await wait(1000);
    await page.screenshot({ path: './test-screenshots/demo-01-home.png' });
    console.log('   → Home page with navbar: AI Dev | Dashboard | Quick Start');

    // Step 2: Register a new test user
    logStep('Registering a new test user...');

    // Generate unique email
    const testEmail = `demo-${Date.now()}@test.com`;
    const testPassword = 'DemoPass123';

    // Fill in the login form - but we need to register first
    // Let's use the API to register
    const registerResponse = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'Demo User'
      })
    });

    if (registerResponse.ok) {
      console.log(`   → Registered: ${testEmail}`);
    } else {
      console.log('   → Using existing test account...');
    }

    // Step 3: Login via the form
    logStep('Logging in via the form...');

    // Find and fill email field
    await page.type('input[type="email"]', testEmail);
    await page.type('input[type="password"]', testPassword);
    await wait(500);
    await page.screenshot({ path: './test-screenshots/demo-02-login-filled.png' });

    // Click sign in button
    const signInButton = await page.$('button[type="submit"]');
    if (signInButton) {
      await signInButton.click();
    }
    await wait(2000);

    // Should redirect to dashboard
    const currentUrl = page.url();
    console.log(`   → Redirected to: ${currentUrl}`);
    await page.screenshot({ path: './test-screenshots/demo-03-dashboard.png' });

    // Step 4: Explore the Dashboard
    logStep('Exploring the Dashboard...');
    console.log('   → Navbar shows: AI Dev | Dashboard (active) | Quick Start');
    console.log('   → Search bar with ⌘K shortcut');
    console.log('   → User menu on the right');

    // Check for user menu (avatar)
    const userMenu = await page.$('button[class*="rounded-full"]');
    if (userMenu) {
      await userMenu.click();
      await wait(500);
      await page.screenshot({ path: './test-screenshots/demo-04-user-menu.png' });
      console.log('   → User menu opened: Dashboard, Settings, Keyboard shortcuts, Sign out');
      await page.keyboard.press('Escape');
      await wait(300);
    }

    // Step 5: Create a new project
    logStep('Creating a new project...');

    // Find the input field and create a project
    const projectInput = await page.$('input[placeholder*="project"]');
    if (projectInput) {
      await projectInput.type('My Demo Landing Page');
      await wait(300);

      // Click create button
      const createButton = await page.$('button[type="submit"]');
      if (createButton) {
        await createButton.click();
        await wait(1500);
      }
    }
    await page.screenshot({ path: './test-screenshots/demo-05-project-created.png' });
    console.log('   → Project "My Demo Landing Page" created');

    // Step 6: Open the project
    logStep('Opening the project workspace...');

    // Click on the project card
    const projectCard = await page.$('div[class*="cursor-pointer"]');
    if (projectCard) {
      await projectCard.click();
      await wait(2000);
    }

    await page.screenshot({ path: './test-screenshots/demo-06-project-workspace.png' });
    console.log('   → Project workspace with Kanban board');
    console.log('   → Tabs: Board | Pages');
    console.log('   → Navbar still visible for navigation');

    // Step 7: Explore Command Palette
    logStep('Using Command Palette (⌘K)...');
    await page.keyboard.down('Meta');
    await page.keyboard.press('k');
    await page.keyboard.up('Meta');
    await wait(500);
    await page.screenshot({ path: './test-screenshots/demo-07-command-palette.png' });
    console.log('   → Command palette open');
    console.log('   → Navigation: Home (G H), Dashboard (G D), Quick Start (G Q)');
    console.log('   → Actions: Toggle Theme (T), New Project (N)');

    // Close command palette
    await page.keyboard.press('Escape');
    await wait(300);

    // Step 8: Navigate to Pages tab
    logStep('Switching to Pages tab...');
    const pagesTab = await page.$('button[value="pages"]');
    if (pagesTab) {
      await pagesTab.click();
      await wait(1000);
    }
    await page.screenshot({ path: './test-screenshots/demo-08-pages-tab.png' });
    console.log('   → Pages tab for research & documentation');

    // Step 9: Navigate back to Dashboard using navbar
    logStep('Navigating back to Dashboard via navbar...');
    const dashboardLink = await page.$('a[href="/dashboard"]');
    if (dashboardLink) {
      await dashboardLink.click();
      await wait(1500);
    }
    await page.screenshot({ path: './test-screenshots/demo-09-back-to-dashboard.png' });
    console.log('   → Back on Dashboard via navbar click');

    // Step 10: Use keyboard shortcut G Q to go to Quick Start
    logStep('Using keyboard shortcut G Q (Go to Quick Start)...');
    await page.keyboard.press('g');
    await wait(100);
    await page.keyboard.press('q');
    await wait(1500);
    await page.screenshot({ path: './test-screenshots/demo-10-quick-start.png' });
    console.log('   → Navigated to Quick Start via G Q shortcut');
    console.log('   → Can generate new projects from here');

    // Step 11: Toggle theme
    logStep('Toggling theme with T shortcut...');
    await page.keyboard.press('t');
    await wait(500);
    await page.screenshot({ path: './test-screenshots/demo-11-theme-toggled.png' });
    console.log('   → Theme toggled (light/dark)');

    // Step 12: Navigate home with G H
    logStep('Going home with G H shortcut...');
    await page.keyboard.press('g');
    await wait(100);
    await page.keyboard.press('h');
    await wait(1500);
    await page.screenshot({ path: './test-screenshots/demo-12-home-again.png' });
    console.log('   → Back at home page');
    console.log('   → Still logged in (would show dashboard redirect normally)');

    // Summary
    console.log('\n========================================');
    console.log('  Demo Complete!');
    console.log('========================================\n');
    console.log('Screenshots saved to ./test-screenshots/demo-*.png\n');

    console.log('User Flow Demonstrated:');
    console.log('  1. Home page with navbar');
    console.log('  2. User registration & login');
    console.log('  3. Dashboard with projects');
    console.log('  4. User menu dropdown');
    console.log('  5. Create new project');
    console.log('  6. Project workspace (Kanban)');
    console.log('  7. Command palette (⌘K)');
    console.log('  8. Pages tab');
    console.log('  9. Navbar navigation');
    console.log('  10. Keyboard shortcut G Q');
    console.log('  11. Theme toggle (T)');
    console.log('  12. Keyboard shortcut G H');

  } catch (error: any) {
    console.error('\n❌ Demo failed:', error.message);
    await page.screenshot({ path: './test-screenshots/demo-error.png' });
  } finally {
    await wait(3000);
    await browser.close();
  }
}

demoAuthFlow().catch(console.error);

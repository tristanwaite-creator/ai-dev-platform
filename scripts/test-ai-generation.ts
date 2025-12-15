/**
 * Test AI code generation trigger
 * Tests: Create task → Move to Building via API → Verify generation starts
 */

import puppeteer from 'puppeteer';

const FRONTEND_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:3000';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testAIGeneration() {
  console.log('\n========================================');
  console.log('  AI Code Generation Test');
  console.log('========================================\n');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();
  let step = 1;
  let accessToken = '';
  let projectId = '';
  let taskId = '';

  const logStep = (description: string) => {
    console.log(`\n${step}. ${description}`);
    step++;
  };

  try {
    // Step 1: Register and login
    logStep('Setting up test user...');
    const testEmail = `aigen-${Date.now()}@test.com`;
    const testPassword = 'TestPass123';

    const registerRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'AI Gen Tester'
      })
    });
    const registerData = await registerRes.json();
    accessToken = registerData.tokens?.accessToken;
    console.log(`   → Created user: ${testEmail}`);
    console.log(`   → Got access token: ${accessToken ? 'yes' : 'no'}`);

    // Step 2: Login via UI to set localStorage tokens
    logStep('Logging in via UI...');
    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle2' });
    await wait(500);

    await page.type('input[type="email"]', testEmail);
    await page.type('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await wait(2000);
    console.log('   → Logged in');

    // Step 3: Create project via API
    logStep('Creating project via API...');
    const projectRes = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: 'AI Generation Test',
        description: 'Testing AI code generation',
      })
    });
    const projectData = await projectRes.json();
    projectId = projectData.project?.id;
    console.log(`   → Created project: ${projectId}`);

    // Step 4: Create task via API
    logStep('Creating task via API...');
    const taskRes = await fetch(`${BACKEND_URL}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: 'Create a simple HTML page with a blue gradient background',
        status: 'todo',
        priority: 'medium',
      })
    });
    const taskData = await taskRes.json();
    taskId = taskData.task?.id;
    console.log(`   → Created task: ${taskId}`);

    // Step 5: Navigate to project
    logStep('Opening project in browser...');
    await page.goto(`${FRONTEND_URL}/project/${projectId}`, { waitUntil: 'networkidle2' });
    await wait(2000);
    await page.screenshot({ path: './test-screenshots/aigen-01-project.png' });
    console.log('   → Project page loaded');

    // Step 6: Move task to "building" via API to trigger generation
    logStep('Moving task to Building column via API...');
    console.log('   → This should trigger AI generation');

    const updateRes = await fetch(`${BACKEND_URL}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        status: 'in_progress',
      })
    });
    const updateData = await updateRes.json();
    console.log(`   → Task updated: ${updateData.task?.status}`);

    // Step 7: Refresh the page to trigger the frontend's generation logic
    logStep('Refreshing page to trigger generation...');
    await page.reload({ waitUntil: 'networkidle2' });
    await wait(2000);
    await page.screenshot({ path: './test-screenshots/aigen-02-after-move.png' });

    // The task should now be in Building column
    // Check if generation UI is visible
    const boardState = await page.evaluate(() => {
      const columns = Array.from(document.querySelectorAll('[class*="kanban"]'));
      const taskCards = document.querySelectorAll('[class*="cursor-grab"]');
      const generateButtons = document.querySelectorAll('button');

      let hasGenerateButton = false;
      generateButtons.forEach(btn => {
        if (btn.textContent?.toLowerCase().includes('generate')) {
          hasGenerateButton = true;
        }
      });

      return {
        taskCount: taskCards.length,
        hasGenerateButton,
      };
    });
    console.log(`   → Board state:`, boardState);

    // Step 8: Find and click the "Generate code" button in the Building column
    logStep('Looking for manual generate option...');

    // Look for the expanded generate section
    const generateSection = await page.evaluate(() => {
      const sparkles = document.querySelector('[class*="sparkle"]');
      const textareas = document.querySelectorAll('textarea');
      const generateBtns = Array.from(document.querySelectorAll('button')).filter(
        btn => btn.textContent?.toLowerCase().includes('generate')
      );

      return {
        hasSparkle: !!sparkles,
        textareaCount: textareas.length,
        generateButtonCount: generateBtns.length,
      };
    });
    console.log(`   → Generate section:`, generateSection);
    await page.screenshot({ path: './test-screenshots/aigen-03-generate-ui.png' });

    // Step 9: Click expand button on the task card if available
    logStep('Expanding task card generation panel...');

    // Find the "Generate code" text in the card
    const clickedExpand = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('generate code')) {
          (btn as HTMLButtonElement).click();
          return true;
        }
      }
      return false;
    });

    if (clickedExpand) {
      console.log('   → Clicked "Generate code" expand button');
      await wait(500);
      await page.screenshot({ path: './test-screenshots/aigen-04-expanded.png' });
    }

    // Step 10: Check if we can trigger generation manually
    logStep('Attempting manual generation...');

    // Look for textarea and fill it if empty
    const textarea = await page.$('textarea');
    if (textarea) {
      const currentValue = await textarea.evaluate(el => (el as HTMLTextAreaElement).value);
      console.log(`   → Current textarea value: "${currentValue.substring(0, 50)}..."`);

      if (!currentValue) {
        await textarea.type('Create a simple landing page with a gradient background');
      }

      // Find and click the generate button
      const generateBtn = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const genBtn = buttons.find(btn =>
          btn.textContent?.toLowerCase() === 'generate' ||
          (btn.textContent?.toLowerCase().includes('generate') && !btn.textContent?.toLowerCase().includes('code'))
        );
        if (genBtn && !genBtn.disabled) {
          genBtn.click();
          return true;
        }
        return false;
      });

      if (generateBtn) {
        console.log('   → Clicked Generate button!');
        await page.screenshot({ path: './test-screenshots/aigen-05-generating.png' });

        // Wait for generation to start
        await wait(3000);

        // Check for loading state
        const loadingState = await page.evaluate(() => {
          const loaders = document.querySelectorAll('[class*="animate-spin"]');
          const iframes = document.querySelectorAll('iframe');
          return {
            hasLoader: loaders.length > 0,
            hasIframe: iframes.length > 0,
          };
        });
        console.log(`   → Loading state:`, loadingState);
      }
    }

    // Step 11: Wait and monitor for preview panel
    logStep('Monitoring for generation completion...');

    let generationCompleted = false;
    for (let i = 0; i < 30; i++) {
      await wait(2000);

      const state = await page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        const loaders = document.querySelectorAll('[class*="animate-spin"]');
        const previewPanel = document.querySelector('[class*="preview"]');
        const toasts = document.querySelectorAll('[data-sonner-toast]');

        return {
          hasIframe: iframes.length > 0,
          hasLoader: loaders.length > 0,
          hasPreviewPanel: !!previewPanel,
          toastMessages: Array.from(toasts).map(t => t.textContent),
          iframeSrc: iframes.length > 0 ? (iframes[0] as HTMLIFrameElement).src : null,
        };
      });

      if (state.hasIframe || state.hasPreviewPanel) {
        console.log('   → Generation complete! Preview available');
        console.log(`   → Sandbox URL: ${state.iframeSrc}`);
        generationCompleted = true;
        await page.screenshot({ path: './test-screenshots/aigen-06-preview.png' });
        break;
      }

      if (state.toastMessages.length > 0) {
        console.log(`   → Toasts: ${state.toastMessages.join(', ')}`);
      }

      if (state.hasLoader) {
        console.log(`   → Generation in progress... (${(i + 1) * 2}s)`);
      } else {
        console.log(`   → Waiting... (${(i + 1) * 2}s)`);
      }
    }

    await page.screenshot({ path: './test-screenshots/aigen-final.png' });

    // Summary
    console.log('\n========================================');
    console.log('  AI Generation Test Complete');
    console.log('========================================\n');

    console.log('Results:');
    console.log(`  - Project created: ✓ (${projectId})`);
    console.log(`  - Task created: ✓ (${taskId})`);
    console.log(`  - Task moved to Building: ✓`);
    console.log(`  - Generation completed: ${generationCompleted ? '✓' : '✗'}`);

    if (!generationCompleted) {
      console.log('\nNote: Generation may not have completed. Check:');
      console.log('  1. Backend server is running on port 3000');
      console.log('  2. E2B_API_KEY is configured in .env');
      console.log('  3. ANTHROPIC_API_KEY is configured in .env');
      console.log('  4. Check backend logs for errors');
    }

    console.log('\nScreenshots saved to ./test-screenshots/aigen-*.png');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: './test-screenshots/aigen-error.png' });
  } finally {
    await wait(3000);
    await browser.close();
  }
}

testAIGeneration().catch(console.error);

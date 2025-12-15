/**
 * Test drag and drop for Kanban board
 */

import puppeteer from 'puppeteer';

const FRONTEND_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:3000';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testDragDrop() {
  console.log('\n=== Testing Drag & Drop ===\n');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // 1. Setup: Login and create project with task
    const testEmail = `dnd-test-${Date.now()}@test.com`;
    const testPassword = 'TestPass123';

    await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'DnD Test' })
    });

    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', testEmail);
    await page.type('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await wait(2000);
    console.log('1. Logged in');

    // Create project
    const projectInput = await page.$('input[placeholder*="project"]');
    if (projectInput) {
      await projectInput.type('DnD Test Project');
      await page.click('button[type="submit"]');
      await wait(1500);
    }
    console.log('2. Project created');

    // Open project
    const projectCard = await page.$('div[class*="cursor-pointer"]');
    if (projectCard) {
      await projectCard.click();
      await wait(2000);
    }
    console.log('3. Project opened');

    // Create a task
    const addTaskBtns = await page.$$('button');
    for (const btn of addTaskBtns) {
      const text = await btn.evaluate(el => el.textContent);
      if (text?.includes('Add task')) {
        await btn.click();
        await wait(300);
        break;
      }
    }

    const taskInput = await page.$('input[placeholder*="task"], input[placeholder*="title"]');
    if (taskInput) {
      await taskInput.type('Test task for drag and drop');
      await page.keyboard.press('Enter');
      await wait(1000);
    }
    console.log('4. Task created');

    await page.screenshot({ path: './test-screenshots/dnd-01-before.png' });

    // 5. Find the task card and columns
    console.log('\n5. Finding task card and columns...');

    const taskCards = await page.$$('[class*="cursor-grab"]');
    console.log(`   Found ${taskCards.length} draggable items`);

    // Get column positions
    const columnInfo = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('[class*="font-medium"]'));
      const columns: { name: string; x: number; y: number }[] = [];

      headers.forEach((h) => {
        const text = h.textContent?.toLowerCase() || '';
        if (['research', 'building', 'testing', 'done'].some(col => text.includes(col))) {
          const rect = h.getBoundingClientRect();
          columns.push({ name: text, x: rect.x + rect.width / 2, y: rect.y + 100 });
        }
      });

      return columns;
    });

    console.log('   Columns:', columnInfo.map(c => c.name));

    if (taskCards.length > 0 && columnInfo.length >= 2) {
      // 6. Perform drag and drop
      console.log('\n6. Performing drag and drop...');

      const taskCard = taskCards[0];
      const taskBox = await taskCard.boundingBox();

      if (taskBox) {
        // Find Building column
        const buildingColumn = columnInfo.find(c => c.name.includes('building'));

        if (buildingColumn) {
          console.log(`   Dragging from (${taskBox.x}, ${taskBox.y}) to (${buildingColumn.x}, ${buildingColumn.y})`);

          // Perform drag
          await page.mouse.move(taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2);
          await page.mouse.down();
          await wait(100);

          // Move in steps for smoother drag
          const steps = 10;
          const dx = (buildingColumn.x - (taskBox.x + taskBox.width / 2)) / steps;
          const dy = (buildingColumn.y - (taskBox.y + taskBox.height / 2)) / steps;

          for (let i = 1; i <= steps; i++) {
            await page.mouse.move(
              taskBox.x + taskBox.width / 2 + dx * i,
              taskBox.y + taskBox.height / 2 + dy * i
            );
            await wait(50);
          }

          await page.mouse.up();
          await wait(1000);

          await page.screenshot({ path: './test-screenshots/dnd-02-after.png' });
          console.log('   Drag completed!');
        }
      }
    }

    // 7. Verify task moved
    console.log('\n7. Verifying task position...');

    const taskPosition = await page.evaluate(() => {
      const cards = document.querySelectorAll('[class*="cursor-grab"]');
      for (const card of cards) {
        // Find which column this card is in
        const parent = card.closest('[class*="min-w"]');
        if (parent) {
          const header = parent.querySelector('[class*="font-medium"]');
          return header?.textContent || 'unknown';
        }
      }
      return 'not found';
    });

    console.log(`   Task is now in: ${taskPosition}`);

    console.log('\n=== Drag & Drop Test Complete ===');
    console.log('Screenshots saved to ./test-screenshots/dnd-*.png');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    await page.screenshot({ path: './test-screenshots/dnd-error.png' });
  } finally {
    await wait(3000);
    await browser.close();
  }
}

testDragDrop().catch(console.error);

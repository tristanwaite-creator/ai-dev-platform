/**
 * Debug test for Pages tab
 */

import puppeteer from 'puppeteer';

const FRONTEND_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:3000';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testPagesTab() {
  console.log('\n=== Testing Pages Tab ===\n');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: ['--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // 1. Login
    const testEmail = `pages-test-${Date.now()}@test.com`;
    const testPassword = 'TestPass123';

    await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'Test' })
    });

    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', testEmail);
    await page.type('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await wait(2000);
    console.log('1. Logged in');

    // 2. Create project
    const projectInput = await page.$('input[placeholder*="project"]');
    if (projectInput) {
      await projectInput.type('Pages Test Project');
      await page.click('button[type="submit"]');
      await wait(1500);
    }
    console.log('2. Project created');

    // 3. Open project
    const projectCard = await page.$('div[class*="cursor-pointer"]');
    if (projectCard) {
      await projectCard.click();
      await wait(2000);
    }
    console.log('3. Project opened');
    await page.screenshot({ path: './test-screenshots/pages-debug-01-board.png' });

    // 4. Find and inspect the tabs
    console.log('\n4. Inspecting tabs...');

    // Get all tab-related elements
    const tabsHtml = await page.evaluate(() => {
      const tabsList = document.querySelector('[role="tablist"]');
      const tabs = document.querySelectorAll('[role="tab"]');
      const tabsInfo: any[] = [];

      tabs.forEach((tab, i) => {
        tabsInfo.push({
          index: i,
          text: tab.textContent,
          ariaSelected: tab.getAttribute('aria-selected'),
          dataState: tab.getAttribute('data-state'),
          value: tab.getAttribute('value'),
          tagName: tab.tagName,
        });
      });

      return {
        hasTabsList: !!tabsList,
        tabsCount: tabs.length,
        tabs: tabsInfo,
      };
    });

    console.log('Tabs found:', JSON.stringify(tabsHtml, null, 2));

    // 5. Try to click the Pages tab
    console.log('\n5. Clicking Pages tab...');

    // Try different selectors
    const selectors = [
      'button[value="pages"]',
      '[role="tab"]:nth-child(2)',
      '[data-value="pages"]',
      'button:has-text("Pages")',
    ];

    let clicked = false;
    for (const selector of selectors) {
      try {
        const elem = await page.$(selector);
        if (elem) {
          console.log(`   Found with selector: ${selector}`);
          await elem.click();
          clicked = true;
          break;
        }
      } catch (e) {
        // Skip invalid selectors
      }
    }

    if (!clicked) {
      // Try clicking by text content
      console.log('   Trying by text content...');
      const tabs = await page.$$('[role="tab"]');
      for (const tab of tabs) {
        const text = await tab.evaluate(el => el.textContent);
        console.log(`   Tab text: "${text}"`);
        if (text?.toLowerCase().includes('pages')) {
          await tab.click();
          clicked = true;
          console.log('   Clicked Pages tab by text!');
          break;
        }
      }
    }

    await wait(1500);
    await page.screenshot({ path: './test-screenshots/pages-debug-02-after-click.png' });

    // 6. Check what's rendered now
    const contentCheck = await page.evaluate(() => {
      // Look for Pages-specific content
      const pagesHeader = document.querySelector('h2');
      const hasPagesSidebar = !!document.querySelector('[class*="page-sidebar"]');
      const hasPageEditor = !!document.querySelector('[class*="blocknote"]');
      const hasKanban = !!document.querySelector('[class*="kanban"]');

      // Check visible text
      const visibleHeadings = Array.from(document.querySelectorAll('h2')).map(h => h.textContent);

      return {
        pagesHeaderText: pagesHeader?.textContent,
        visibleHeadings,
        hasKanban,
        hasPagesSidebar,
        hasPageEditor,
      };
    });

    console.log('\n6. Content check:', JSON.stringify(contentCheck, null, 2));

    // 7. Check tab state after click
    const tabsAfter = await page.evaluate(() => {
      const tabs = document.querySelectorAll('[role="tab"]');
      return Array.from(tabs).map((tab, i) => ({
        index: i,
        text: tab.textContent,
        ariaSelected: tab.getAttribute('aria-selected'),
        dataState: tab.getAttribute('data-state'),
      }));
    });

    console.log('\n7. Tab states after click:', JSON.stringify(tabsAfter, null, 2));

    console.log('\n=== Test Complete ===');
    console.log('Screenshots saved to ./test-screenshots/pages-debug-*.png');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    await page.screenshot({ path: './test-screenshots/pages-debug-error.png' });
  } finally {
    await wait(3000);
    await browser.close();
  }
}

testPagesTab().catch(console.error);

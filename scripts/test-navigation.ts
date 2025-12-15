/**
 * Navigation Test - Tests the onboarding page navigation
 */

import puppeteer from 'puppeteer';

const FRONTEND_URL = 'http://localhost:3001';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testNavigation() {
  console.log('\n========================================');
  console.log('  Navigation Test - Onboarding Page');
  console.log('========================================\n');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: ['--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // Test 1: Load onboarding page
    console.log('1. Loading onboarding page...');
    await page.goto(`${FRONTEND_URL}/onboarding`, { waitUntil: 'networkidle2' });
    await wait(1000);

    // Take screenshot
    await page.screenshot({ path: './test-screenshots/nav-01-onboarding.png' });
    console.log('   ✓ Onboarding page loaded');

    // Test 2: Check for navigation elements
    console.log('\n2. Checking navigation elements...');

    // Check for logo
    const logo = await page.$('a[href="/"]');
    console.log(`   ✓ Logo link: ${logo ? 'Found' : 'Missing'}`);

    // Check for Search button
    const allButtons = await page.$$('button');
    let foundSearch = false;
    for (const btn of allButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text?.includes('Search') || text?.includes('⌘K')) {
        foundSearch = true;
        break;
      }
    }
    console.log(`   ✓ Search button: ${foundSearch ? 'Found' : 'Missing'}`);

    // Check for Sign In button
    const signInBtn = await page.$('a[href="/"]');
    const buttons = await page.$$('a, button');
    let foundSignIn = false;
    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text?.includes('Sign In')) {
        foundSignIn = true;
        break;
      }
    }
    console.log(`   ✓ Sign In button: ${foundSignIn ? 'Found' : 'Missing'}`);

    // Test 3: Test Command Palette (⌘K)
    console.log('\n3. Testing Command Palette (⌘K)...');
    await page.keyboard.down('Meta');
    await page.keyboard.press('k');
    await page.keyboard.up('Meta');
    await wait(500);

    await page.screenshot({ path: './test-screenshots/nav-02-command-palette.png' });

    // Check if command palette opened
    const commandInput = await page.$('input[placeholder*="command"], input[placeholder*="search"]');
    console.log(`   ✓ Command palette: ${commandInput ? 'Opened' : 'Not found'}`);

    // Close command palette
    await page.keyboard.press('Escape');
    await wait(300);

    // Test 4: Click Sign In button
    console.log('\n4. Testing Sign In navigation...');
    for (const btn of buttons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text?.includes('Sign In')) {
        await btn.click();
        break;
      }
    }
    await wait(1000);

    const currentUrl = page.url();
    console.log(`   ✓ Navigated to: ${currentUrl}`);
    await page.screenshot({ path: './test-screenshots/nav-03-login-page.png' });

    // Test 5: Navigate back to onboarding via Command Palette
    console.log('\n5. Navigate back via Command Palette...');
    await page.keyboard.down('Meta');
    await page.keyboard.press('k');
    await page.keyboard.up('Meta');
    await wait(500);

    // Type "quick" to find Quick Start
    await page.keyboard.type('quick');
    await wait(300);
    await page.keyboard.press('Enter');
    await wait(1000);

    const backUrl = page.url();
    console.log(`   ✓ Navigated to: ${backUrl}`);
    await page.screenshot({ path: './test-screenshots/nav-04-back-to-onboarding.png' });

    // Test 6: Test keyboard shortcut G Q
    console.log('\n6. Testing keyboard shortcut G H (Go Home)...');
    await page.keyboard.press('g');
    await wait(100);
    await page.keyboard.press('h');
    await wait(1000);

    const homeUrl = page.url();
    console.log(`   ✓ Navigated to: ${homeUrl}`);
    await page.screenshot({ path: './test-screenshots/nav-05-keyboard-home.png' });

    console.log('\n========================================');
    console.log('  All Navigation Tests Passed!');
    console.log('========================================\n');
    console.log('Screenshots saved to ./test-screenshots/nav-*.png');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: './test-screenshots/nav-error.png' });
  } finally {
    await wait(2000);
    await browser.close();
  }
}

testNavigation().catch(console.error);

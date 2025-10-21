import { chromium } from 'playwright';

async function testPagesDarkMode() {
    console.log('🚀 Starting Playwright test for Pages dark mode...\n');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Go to homepage
        console.log('📍 Navigating to http://localhost:3000');
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(1000);

        // Check if we need to login
        const loginFormVisible = await page.locator('form').count() > 0;

        if (loginFormVisible) {
            console.log('🔐 Logging in...');
            // Try to login with test credentials
            await page.fill('input[type="email"]', 'test@example.com');
            await page.fill('input[type="password"]', 'Password123');
            await page.click('button[type="submit"]');
            await page.waitForTimeout(2000);
        } else {
            console.log('✓ Already logged in');
        }

        // Find and click on first project
        console.log('📂 Looking for projects...');
        await page.waitForTimeout(1000);

        const projectCards = await page.locator('.project-card, [class*="project"]').count();
        console.log(`Found ${projectCards} project elements`);

        if (projectCards > 0) {
            await page.locator('.project-card, [class*="project"]').first().click();
            await page.waitForTimeout(2000);
        } else {
            console.log('⚠️  No projects found, trying to navigate directly...');
            // Get project ID from localStorage or try a known ID
            const projectId = await page.evaluate(() => {
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                    if (key.includes('project')) {
                        return localStorage.getItem(key);
                    }
                }
                return null;
            });

            if (projectId) {
                await page.goto(`http://localhost:3000/pages.html?id=${projectId}`);
            }
        }

        // Try to navigate to pages section
        console.log('📝 Looking for Notes & Docs section...');
        await page.waitForTimeout(1000);

        // Try clicking "Notes & Docs" or "Pages" button/link
        const notesButton = page.locator('text=/notes|docs|pages/i').first();
        const notesButtonExists = await notesButton.count() > 0;

        if (notesButtonExists) {
            console.log('✓ Found Notes button, clicking...');
            await notesButton.click();
            await page.waitForTimeout(2000);
        } else {
            // Try to get project ID and navigate directly
            console.log('📍 Navigating directly to pages.html...');
            const url = page.url();
            const projectId = new URL(url).searchParams.get('id') ||
                             url.match(/id=([^&]+)/)?.[1] ||
                             'cmgugr5yy000dy96r9wf35fzg'; // fallback
            await page.goto(`http://localhost:3000/pages.html?id=${projectId}`);
            await page.waitForTimeout(2000);
        }

        console.log('\n📸 Taking screenshot of current state...');
        await page.screenshot({ path: 'pages-before-fix.png', fullPage: true });
        console.log('✓ Screenshot saved as pages-before-fix.png\n');

        // Inspect element colors
        console.log('🔍 Inspecting element styles:\n');

        const elementsToCheck = [
            { selector: '.pages-container', name: 'Main Container' },
            { selector: '.pages-sidebar', name: 'Sidebar' },
            { selector: '.page-main', name: 'Main Content Area' },
            { selector: '.page-title-input', name: 'Page Title Input' },
            { selector: '.block-content', name: 'Block Content' },
            { selector: '.page-item', name: 'Page Item' },
            { selector: '.new-page-btn', name: 'New Page Button' },
            { selector: 'body', name: 'Body' }
        ];

        for (const element of elementsToCheck) {
            const exists = await page.locator(element.selector).count() > 0;
            if (exists) {
                const styles = await page.locator(element.selector).first().evaluate(el => {
                    const computed = window.getComputedStyle(el);
                    return {
                        backgroundColor: computed.backgroundColor,
                        color: computed.color,
                        borderColor: computed.borderColor
                    };
                });
                console.log(`${element.name} (${element.selector}):`);
                console.log(`  Background: ${styles.backgroundColor}`);
                console.log(`  Text Color: ${styles.color}`);
                console.log(`  Border: ${styles.borderColor}\n`);
            } else {
                console.log(`${element.name} (${element.selector}): NOT FOUND\n`);
            }
        }

        console.log('✅ Test complete! Check pages-before-fix.png for visual inspection.\n');
        console.log('Press Ctrl+C to close the browser...');

        // Keep browser open for manual inspection
        await page.waitForTimeout(60000);

    } catch (error) {
        console.error('❌ Error during test:', error);
        await page.screenshot({ path: 'pages-error.png', fullPage: true });
        console.log('Error screenshot saved as pages-error.png');
    } finally {
        await browser.close();
    }
}

testPagesDarkMode();

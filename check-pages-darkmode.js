import { chromium } from 'playwright';

async function checkPagesDarkMode() {
    console.log('🚀 Checking Pages Dark Mode...\n');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 100
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // First, let's login
        console.log('📍 Step 1: Navigating to login page...');
        await page.goto('http://localhost:3000/');
        await page.waitForTimeout(2000);

        // Check if login form exists
        const loginForm = await page.locator('form').count();
        if (loginForm > 0) {
            console.log('🔐 Step 2: Logging in...');
            await page.fill('input[type="email"]', 'test@example.com');
            await page.fill('input[type="password"]', 'Password123');
            await page.click('button[type="submit"]');
            await page.waitForTimeout(3000);
        } else {
            console.log('✓ Already logged in');
        }

        // Navigate to projects page
        console.log('📂 Step 3: Going to projects page...');
        await page.goto('http://localhost:3000/projects.html');
        await page.waitForTimeout(2000);

        // Click on the first project
        console.log('🎯 Step 4: Opening first project...');
        const projectCard = page.locator('.project-card').first();
        const projectExists = await projectCard.count() > 0;

        if (projectExists) {
            await projectCard.click();
            await page.waitForTimeout(2000);
        } else {
            console.log('⚠️  No projects found, using fallback project ID');
        }

        // Now click on "Notes & Docs" or navigate directly
        console.log('📝 Step 5: Opening Notes & Docs section...');

        // Try to find and click the Notes button
        const notesBtn = page.locator('text=/notes.*docs|pages/i').first();
        const notesBtnExists = await notesBtn.count() > 0;

        if (notesBtnExists) {
            await notesBtn.click();
            await page.waitForTimeout(3000);
        } else {
            // Direct navigation
            const currentUrl = page.url();
            const projectId = currentUrl.match(/id=([^&]+)/)?.[1] || 'cmgugr5yy000dy96r9wf35fzg';
            console.log(`   Using project ID: ${projectId}`);
            await page.goto(`http://localhost:3000/pages.html?id=${projectId}`);
            await page.waitForTimeout(3000);
        }

        // Take screenshot
        console.log('\n📸 Taking screenshot...');
        await page.screenshot({ path: 'pages-current-state.png', fullPage: true });
        console.log('✓ Screenshot saved: pages-current-state.png\n');

        // Inspect all elements
        console.log('🔍 Inspecting page elements:\n');
        console.log('='.repeat(80) + '\n');

        const checks = [
            { selector: 'body', name: 'Body Background' },
            { selector: '.pages-container', name: 'Pages Container' },
            { selector: '.pages-sidebar', name: 'Sidebar' },
            { selector: '.sidebar-header', name: 'Sidebar Header' },
            { selector: '.sidebar-title', name: 'Sidebar Title' },
            { selector: '.back-btn', name: 'Back Button' },
            { selector: '.pages-list', name: 'Pages List' },
            { selector: '.page-item', name: 'Page Items' },
            { selector: '.new-page-btn', name: 'New Page Button' },
            { selector: '.page-main', name: 'Main Content' },
            { selector: '.page-header', name: 'Page Header' },
            { selector: '.page-title-input', name: 'Title Input' },
            { selector: '.page-editor', name: 'Editor Area' },
            { selector: '.block-content', name: 'Block Content' },
            { selector: '.empty-state', name: 'Empty State' }
        ];

        for (const check of checks) {
            const count = await page.locator(check.selector).count();

            if (count > 0) {
                const styles = await page.locator(check.selector).first().evaluate(el => {
                    const cs = window.getComputedStyle(el);
                    return {
                        bg: cs.backgroundColor,
                        color: cs.color,
                        border: cs.borderColor,
                        display: cs.display
                    };
                });

                // Detect light mode issues
                const bgValues = styles.bg.match(/\d+/g) || [];
                const isLightBg = bgValues.length >= 3 &&
                    parseInt(bgValues[0]) > 200 &&
                    parseInt(bgValues[1]) > 200 &&
                    parseInt(bgValues[2]) > 200;

                const colorValues = styles.color.match(/\d+/g) || [];
                const isDarkText = colorValues.length >= 3 &&
                    parseInt(colorValues[0]) < 100 &&
                    parseInt(colorValues[1]) < 100 &&
                    parseInt(colorValues[2]) < 100;

                const status = (isLightBg || isDarkText) ? '⚠️  LIGHT MODE' : '✅ DARK MODE';

                console.log(`${check.name} (${check.selector}): ${status}`);
                console.log(`  Background: ${styles.bg}`);
                console.log(`  Text Color: ${styles.color}`);
                if (isLightBg || isDarkText) {
                    console.log(`  👆 NEEDS FIX!`);
                }
                console.log('');
            } else {
                console.log(`${check.name} (${check.selector}): ❌ NOT FOUND\n`);
            }
        }

        console.log('='.repeat(80));
        console.log('\n✅ Inspection complete!');
        console.log('\nKeeping browser open for 60 seconds for manual review...');
        console.log('Check pages-current-state.png to see the actual state.\n');

        await page.waitForTimeout(60000);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        await page.screenshot({ path: 'pages-error-state.png', fullPage: true });
        console.log('Error screenshot saved: pages-error-state.png');
    } finally {
        await browser.close();
        console.log('\n🔚 Browser closed.');
    }
}

checkPagesDarkMode();

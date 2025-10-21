import { chromium } from 'playwright';

async function inspectPages() {
    console.log('🚀 Inspecting Pages section...\n');

    const browser = await chromium.launch({ headless: false, slowMo: 500 });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Navigate directly to pages with the project ID from logs
        const projectId = 'cmgugr5yy000dy96r9wf35fzg';
        console.log(`📍 Navigating to pages.html with project ${projectId}...`);
        await page.goto(`http://localhost:3000/pages.html?id=${projectId}`);
        await page.waitForTimeout(3000);

        console.log('\n📸 Taking screenshot...');
        await page.screenshot({ path: 'pages-inspection.png', fullPage: true });
        console.log('✓ Screenshot saved as pages-inspection.png\n');

        // Inspect element colors
        console.log('🔍 Inspecting element styles:\n');
        console.log('=' .repeat(80));

        const elementsToCheck = [
            { selector: 'body', name: 'Body' },
            { selector: '.pages-container', name: 'Main Container' },
            { selector: '.pages-sidebar', name: 'Sidebar' },
            { selector: '.page-main', name: 'Main Content Area' },
            { selector: '.sidebar-header', name: 'Sidebar Header' },
            { selector: '.new-page-btn', name: 'New Page Button' },
            { selector: '.pages-list', name: 'Pages List' },
            { selector: '.page-item', name: 'Page Item' },
            { selector: '.page-header', name: 'Page Header' },
            { selector: '.page-title-input', name: 'Page Title Input' },
            { selector: '.page-editor', name: 'Page Editor' },
            { selector: '.block-content', name: 'Block Content' },
            { selector: '.empty-state', name: 'Empty State' }
        ];

        for (const element of elementsToCheck) {
            const count = await page.locator(element.selector).count();
            if (count > 0) {
                const styles = await page.locator(element.selector).first().evaluate(el => {
                    const computed = window.getComputedStyle(el);
                    return {
                        backgroundColor: computed.backgroundColor,
                        color: computed.color,
                        borderColor: computed.borderColor,
                        display: computed.display
                    };
                });

                // Check if background is light (white or near-white)
                const bgIsLight = styles.backgroundColor.includes('255, 255, 255') ||
                                  styles.backgroundColor.includes('rgb(255, 255, 255)') ||
                                  styles.backgroundColor.includes('247, 247, 245') ||
                                  styles.backgroundColor === 'rgba(0, 0, 0, 0)';

                const textIsDark = styles.color.includes('55, 53, 47') ||
                                   styles.color.includes('rgb(55, 53, 47)') ||
                                   styles.color.includes('37, 35, 31');

                const warning = (bgIsLight || textIsDark) ? ' ⚠️  LIGHT MODE!' : ' ✓';

                console.log(`${element.name} (${element.selector}):${warning}`);
                console.log(`  Background: ${styles.backgroundColor}`);
                console.log(`  Text Color: ${styles.color}`);
                console.log(`  Border: ${styles.borderColor}`);
                console.log(`  Display: ${styles.display}\n`);
            } else {
                console.log(`${element.name} (${element.selector}): NOT FOUND\n`);
            }
        }

        console.log('=' .repeat(80));
        console.log('\n✅ Inspection complete!\n');
        console.log('Keeping browser open for 30 seconds for manual inspection...\n');

        // Keep browser open
        await page.waitForTimeout(30000);

    } catch (error) {
        console.error('❌ Error:', error.message);
        await page.screenshot({ path: 'pages-error.png', fullPage: true });
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

inspectPages();

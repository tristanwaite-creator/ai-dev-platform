import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });

try {
  console.log('Loading preview URL...');
  await page.goto('https://8000-iykvk3s9elgxbuh7aca65.e2b.app', { 
    waitUntil: 'networkidle2',
    timeout: 30000 
  });
  
  // Wait a bit for any JS to render
  await new Promise(r => setTimeout(r, 2000));
  
  await page.screenshot({ path: 'test-screenshots/preview.png', fullPage: true });
  console.log('Screenshot saved to test-screenshots/preview.png');
  
  // Also get the page content
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('\nPage title:', title);
  console.log('\nPage content:\n', bodyText);
  
} catch (error) {
  console.error('Error:', error.message);
}

await browser.close();

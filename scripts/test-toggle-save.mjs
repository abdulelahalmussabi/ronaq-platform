import { chromium } from 'playwright';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', err => {
    console.error('[Browser Page Error]:', err.stack || err.message);
  });

  const url = 'https://almahrusa.mken.live/admin.html';
  console.log(`Loading URL: ${url}`);

  try {
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    console.log('Logging in...');
    await page.selectOption('#loginAuthType', 'local');
    await page.fill('#pinInput', 'mken2026');
    await page.click('#loginSubmitBtn');
    await page.waitForSelector('#adminView:not([hidden])', { timeout: 15000 });
    console.log('Login successful!');

    // Wait for the panels to render
    await page.waitForTimeout(3000);

    // Switch to the activities tab
    console.log('Switching to activities tab...');
    await page.click('button[data-tab="activities"]');
    await page.waitForTimeout(1000);

    // Get current checked services
    const checkedBefore = await page.evaluate(() => {
      const checks = document.querySelectorAll('.admin-service__check');
      return Array.from(checks).map(cb => ({
        id: cb.value,
        checked: cb.checked,
        title: cb.closest('.admin-service').querySelector('strong').textContent
      }));
    });
    console.log('Checked services before toggle:', checkedBefore);

    // We will toggle one of the services. Let's toggle 'family-suite' or 'suite-room'.
    // We will find the checkbox with value="suite-room" or "family-suite".
    console.log('Toggling standard-room or suite-room...');
    const targetCheckbox = page.locator('.admin-service__check[value="suite-room"]');
    const isChecked = await targetCheckbox.isChecked();
    console.log(`suite-room checked status before click: ${isChecked}`);

    // Click the label corresponding to this checkbox to toggle it
    await page.click('label.admin-service:has(input[value="suite-room"])');
    await page.waitForTimeout(500);
    
    const isCheckedAfterClick = await targetCheckbox.isChecked();
    console.log(`suite-room checked status after click: ${isCheckedAfterClick}`);

    // Click "حفظ جميع التغييرات"
    console.log('Clicking save button...');
    await page.click('#saveBtn');
    
    // Wait for toast message or network requests to complete
    console.log('Waiting for toast...');
    const toast = page.locator('#toast');
    await toast.waitFor({ state: 'visible', timeout: 10000 });
    const toastText = await toast.textContent();
    console.log(`Toast message: ${toastText}`);

    // Wait a bit, then reload to verify if it persisted
    console.log('Reloading page to verify persistence...');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Login again
    console.log('Logging in again...');
    await page.selectOption('#loginAuthType', 'local');
    await page.fill('#pinInput', 'mken2026');
    await page.click('#loginSubmitBtn');
    await page.waitForSelector('#adminView:not([hidden])', { timeout: 10000 });
    
    await page.click('button[data-tab="activities"]');
    await page.waitForTimeout(1000);

    const checkedAfter = await page.evaluate(() => {
      const checks = document.querySelectorAll('.admin-service__check');
      return Array.from(checks).map(cb => ({
        id: cb.value,
        checked: cb.checked,
        title: cb.closest('.admin-service').querySelector('strong').textContent
      }));
    });
    console.log('Checked services after reload:', checkedAfter);

  } catch (err) {
    console.error('Test run failed:', err.stack || err.message);
  }

  await browser.close();
  console.log('Browser closed.');
}

run().catch(err => {
  console.error('Test script crashed:', err);
});

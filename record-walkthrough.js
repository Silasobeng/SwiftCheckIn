const { chromium } = require('playwright-core');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'walkthrough-video');

(async () => {
  console.log('Launching Chrome...');
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await ctx.newPage();

  async function smoothScroll(pixels, steps = 5) {
    const step = Math.round(pixels / steps);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, step);
      await page.waitForTimeout(400);
    }
  }

  async function scrollToTop() {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(600);
  }

  async function linger(ms = 2500) {
    await page.waitForTimeout(ms);
  }

  try {
    // ─── SCENE 1: LANDING PAGE ───
    console.log('Scene 1: Landing page');
    await page.goto('https://wemotiply.com', { waitUntil: 'networkidle', timeout: 30000 });
    await linger(3500);
    await smoothScroll(600);
    await linger(2500);
    await smoothScroll(600);
    await linger(2500);

    // ─── SCENE 2: LOG IN ───
    console.log('Scene 2: Logging in');
    await page.goto('https://wemotiply.com/login', { waitUntil: 'networkidle', timeout: 30000 });
    await linger(2000);

    const emailInput = page.locator('input[type="email"]');
    await emailInput.click();
    await emailInput.pressSequentially('silasobeng98@gmail.com', { delay: 55 });
    await linger(400);

    const pwInput = page.locator('input[type="password"]');
    await pwInput.click();
    await pwInput.pressSequentially('123456789', { delay: 55 });
    await linger(600);

    const signInBtn = page.locator('button[type="submit"]');
    await signInBtn.click();

    // Wait for either: URL changes to /admin, or a dashboard element appears
    try {
      await Promise.race([
        page.waitForURL('**/admin**', { timeout: 20000 }),
        page.waitForSelector('[class*="panel"]', { timeout: 20000 }),
      ]);
    } catch {
      // Check where we ended up
      console.log('After login, URL is:', page.url());
      const bodyText = await page.textContent('body');
      if (bodyText && bodyText.includes('Dashboard')) {
        console.log('  -> On the dashboard despite URL mismatch');
      } else {
        console.log('  -> Login may have failed. Body snippet:', bodyText?.slice(0, 200));
        // Try navigating directly
        await page.goto('https://wemotiply.com/admin', { waitUntil: 'networkidle', timeout: 20000 });
      }
    }
    await linger(3000);
    console.log('  Now at:', page.url());

    // ─── SCENE 3: DASHBOARD ───
    console.log('Scene 3: Dashboard');
    await linger(3000);
    await smoothScroll(400);
    await linger(2500);
    await scrollToTop();
    await linger(1000);

    // ─── SCENE 4: TODAY'S SERVICE ───
    console.log('Scene 4: Today\'s Service');
    const serviceTab = page.locator('button').filter({ hasText: /Today.*Service|Service/i }).first();
    if (await serviceTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await serviceTab.click();
      await linger(2500);
      await smoothScroll(300);
      await linger(2500);
      await scrollToTop();
    } else {
      console.log('  Service tab not found, skipping');
    }

    // ─── SCENE 5: PEOPLE ───
    console.log('Scene 5: People');
    const peopleTab = page.locator('button').filter({ hasText: /People/i }).first();
    if (await peopleTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await peopleTab.click();
      await linger(2500);

      // Scroll the people list
      await smoothScroll(400);
      await linger(2000);

      // Click first person row to open profile
      const personRow = page.locator('tr[class]').first();
      if (await personRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await personRow.click();
        await linger(3500);
        await smoothScroll(300);
        await linger(2500);
        await page.keyboard.press('Escape');
        await linger(1000);
      }
    } else {
      console.log('  People tab not found, skipping');
    }

    // ─── SCENE 6: MESSAGING ───
    console.log('Scene 6: Messaging');
    const msgTab = page.locator('button').filter({ hasText: /Messaging/i }).first();
    if (await msgTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await msgTab.click();
      await linger(2500);
      await smoothScroll(500);
      await linger(2500);
      await smoothScroll(500);
      await linger(2500);
      await smoothScroll(500);
      await linger(2500);
    } else {
      console.log('  Messaging tab not found, skipping');
    }

    // ─── SCENE 7: GIVING ───
    console.log('Scene 7: Giving');
    const givingTab = page.locator('button').filter({ hasText: /Giving/i }).first();
    if (await givingTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await givingTab.click();
      await linger(2500);
      await smoothScroll(300);
      await linger(2500);
    } else {
      console.log('  Giving tab not found, skipping');
    }

    // ─── SCENE 8: ANALYTICS ───
    console.log('Scene 8: Analytics');
    const analyticsTab = page.locator('button').filter({ hasText: /Analytics/i }).first();
    if (await analyticsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsTab.click();
      await linger(3000);
      await smoothScroll(500);
      await linger(2500);
      await smoothScroll(500);
      await linger(2500);
      await smoothScroll(500);
      await linger(2500);
    } else {
      console.log('  Analytics tab not found, skipping');
    }

    // ─── SCENE 9: SETTINGS ───
    console.log('Scene 9: Settings');
    const settingsTab = page.locator('button').filter({ hasText: /Settings/i }).first();
    if (await settingsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsTab.click();
      await linger(2500);
      await smoothScroll(500);
      await linger(2500);
      await smoothScroll(500);
      await linger(2500);
    } else {
      console.log('  Settings tab not found, skipping');
    }

    // ─── SCENE 10: KIOSK ───
    console.log('Scene 10: Kiosk');
    const kioskLink = page.locator('a').filter({ hasText: /Kiosk/i }).first();
    if (await kioskLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await kioskLink.click();
      await page.waitForTimeout(5000);
      await linger(3000);
      await smoothScroll(300);
      await linger(3000);
    } else {
      console.log('  Kiosk link not found, skipping');
    }

    console.log('Recording complete!');
  } catch (err) {
    console.error('Error during recording:', err.message);
    console.error(err.stack);
  }

  await ctx.close();
  await browser.close();

  console.log(`Video saved in: ${OUTPUT_DIR}`);
  console.log('Done!');
})();

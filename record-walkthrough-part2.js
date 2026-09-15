const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport:{width:1280,height:800}, recordVideo:{dir:path.join(__dirname,'walkthrough-video'),size:{width:1280,height:800}} });
  const page = await ctx.newPage();
  const pause = ms => page.waitForTimeout(ms);
  try {
    await page.goto('https://wemotiply.com/login',{waitUntil:'domcontentloaded'});
    await page.locator('input[type=email]').fill(process.env.WEMOTIPLY_EMAIL);
    await page.locator('input[type=password]').fill(process.env.WEMOTIPLY_PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/admin**',{timeout:20000});
    await pause(1200);
    for (const name of ['Today’s Service','People','Giving','Analytics','Messaging','Settings']) {
      const button = page.getByText(name,{exact:true}).first();
      if (await button.isVisible().catch(()=>false)) { await button.click(); await pause(3500); await page.mouse.wheel(0,350); await pause(1600); await page.evaluate(()=>window.scrollTo(0,0)); }
    }
    const kiosk = page.getByRole('link',{name:/Kiosk/i}).first();
    if (await kiosk.isVisible().catch(()=>false)) { await kiosk.click(); await pause(4500); }
  } catch (e) { console.error(e.message); }
  await ctx.close(); await browser.close();
})();

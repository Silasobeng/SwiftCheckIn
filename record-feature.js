const { chromium } = require('playwright-core');
const path = require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const login=await browser.newContext(); const p=await login.newPage();
 await p.goto('https://wemotiply.com/login',{waitUntil:'domcontentloaded'});
 await p.locator('input[type=email]').fill(process.env.WEMOTIPLY_EMAIL); await p.locator('input[type=password]').fill(process.env.WEMOTIPLY_PASSWORD);
 await p.locator('button[type=submit]').click(); await p.waitForURL('**/admin**',{timeout:20000});
 const state=await login.storageState(); await login.close();
 const ctx=await browser.newContext({storageState:state,viewport:{width:1280,height:800},recordVideo:{dir:path.join(__dirname,'walkthrough-video'),size:{width:1280,height:800}}});
 const page=await ctx.newPage(); await page.goto('https://wemotiply.com/admin',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1600);
 const feature=process.env.FEATURE; const label=feature==='kiosk'?'Kiosk':feature;
 const el=page.getByText(label,{exact:true}).first(); if(await el.isVisible().catch(()=>false)) await el.click(); await page.waitForTimeout(3000); await page.mouse.wheel(0,320); await page.waitForTimeout(3000); await page.mouse.wheel(0,-320); await page.waitForTimeout(1800);
 await ctx.close(); await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});

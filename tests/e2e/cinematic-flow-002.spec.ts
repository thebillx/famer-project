import {expect,test} from '@playwright/test';

for(const viewport of [{width:1440,height:900},{width:375,height:667}]){
 test(`cinematic static flow retains evidence and concise handoff at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
  const apiRequests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/v1'))apiRequests.push(r.url());});
  await page.goto('/');await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#fallback')).toContainText('0.68');await expect(page.locator('#fallback')).toContainText('0.42');
  await expect(page.locator('#fallback')).toContainText('ข้อมูลจำลอง');
  await expect(page.locator('#features')).toHaveCount(0);await expect(page.locator('#farm-insight')).toHaveCount(0);
  await expect(page.locator('#how-it-works h3')).toHaveText(['สร้างฟาร์มและวาดแปลง','เลือกวันที่และตรวจคุณภาพ','เปรียบเทียบและวางแผนตรวจ']);
  await expect(page.locator('#trust')).toContainText('ตัวอย่างจำลอง');expect(apiRequests).toEqual([]);
  await page.getByRole('link',{name:'เข้าสู่ระบบ',exact:true}).first().click();await expect(page).toHaveURL(/\/login\?mode=login$/);
  await expect(page.getByRole('heading',{name:'เข้าสู่ระบบ AgriScope',exact:true})).toBeVisible();
  await expect(page.getByLabel('ชื่อองค์กร')).toHaveCount(0);
 });
 test(`registration handoff selects the existing register form at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.locator('#fallback .text-link').click();await expect(page).toHaveURL(/\/login\?mode=register$/);
  await expect(page.getByLabel('ชื่อองค์กร')).toBeVisible();
 });
}

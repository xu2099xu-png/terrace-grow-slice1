import { test, expect } from '@playwright/test';
import { chooseBeijingDistrict } from './helpers/slice6-flows';

async function clearBrowserState(page: import('@playwright/test').Page) {
  await page.goto('/#/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('about:blank');
}

test('baseline onboarding: fresh home creates identity and builds target grape terrace plan', async ({ page }) => {
  await clearBrowserState(page);

  const [authResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/auth/anonymous') && res.request().method() === 'POST'),
    page.goto('/#/'),
  ]);
  expect(authResponse.status()).toBe(201);
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('token'),
    deviceId: localStorage.getItem('device_id'),
  }))).toMatchObject({
    token: expect.any(String),
    deviceId: expect.stringMatching(/^h5-/),
  });

  await page.goto('/#/perennial');
  await expect(page.getByRole('button', { name: /葡萄/ })).toBeVisible();
  await page.getByRole('button', { name: /葡萄/ }).click();
  await page.waitForURL('**/#/terrace?target_crop_id=crop-grape');

  await expect(page.getByText('您所在的区县？')).toBeVisible();
  await chooseBeijingDistrict(page);
  await page.getByText('阳光充足（大部分白天都有阳光）').click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByText('会淋到雨').click();
  await page.getByRole('button', { name: '完成' }).click();

  await page.waitForURL('**/#/plan/crop-grape');
  await expect(page.getByText('巨峰', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('阳光玫瑰', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('薄雾')).toHaveCount(0);
});

test('baseline onboarding: fresh mine stays on mine and shows terrace CTA', async ({ page }) => {
  await clearBrowserState(page);

  await page.goto('/#/mine');
  await expect(page).toHaveURL(/#\/mine$/);
  await expect(page.getByRole('button', { name: '创建露台档案' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('我的').first()).toBeVisible();
});

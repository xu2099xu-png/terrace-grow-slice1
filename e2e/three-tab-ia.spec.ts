import { expect, test } from '@playwright/test';

const SELECTED_REGION_STORAGE_KEY = 'terrace:selected-region';

async function seedSelectedRegion(page: import('@playwright/test').Page) {
  await page.addInitScript((key) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(key, JSON.stringify({
      admin_code: '330102',
      name: '上城区',
      province_name: '浙江省',
      city_name: '杭州市',
      selected_at: '2026-08-10T00:00:00.000Z',
    }));
  }, SELECTED_REGION_STORAGE_KEY);
}

test('three-tab IA starts on seasonal, navigates to perennial and mine, and keeps legacy deep links', async ({ page }) => {
  await seedSelectedRegion(page);

  await page.goto('/#/');
  const tabbar = page.locator('.van-tabbar');
  await expect(tabbar.getByText('时令种植')).toBeVisible({ timeout: 15000 });
  await expect(tabbar.getByText('长期种植')).toBeVisible();
  await expect(tabbar.getByText('我的')).toBeVisible();
  await expect(page.getByText('浙江省 · 杭州市 · 上城区')).toBeVisible({ timeout: 15000 });

  await tabbar.getByText('时令种植').click();
  await expect(page).toHaveURL(/#\/seasonal$/);
  await expect(page.getByText('浙江省 · 杭州市 · 上城区')).toBeVisible();

  await tabbar.getByText('长期种植').click();
  await expect(page).toHaveURL(/#\/perennial$/);
  await expect(page.getByText('选择多年生作物')).toBeVisible();

  await tabbar.getByText('我的').click();
  await expect(page).toHaveURL(/#\/mine$/);
  await expect(page.getByText('我的').first()).toBeVisible();

  await page.goto('/#/profile');
  await expect(page).toHaveURL(/#\/mine$/);

  await page.goto('/#/seasons/now?city_code=beijing');
  await expect(page).toHaveURL(/#\/seasons\/now\?city_code=beijing$/);
  await expect(page.getByText('这个季节种什么')).toBeVisible({ timeout: 15000 });
});

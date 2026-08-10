import { expect, test } from '@playwright/test';

async function chooseHangzhouDistrict(page: import('@playwright/test').Page) {
  await page.getByTestId('province-option').filter({ hasText: '浙江省' }).click();
  await page.getByRole('tab', { name: '城市' }).click();
  await page.getByTestId('city-option').filter({ hasText: '杭州市' }).click();
  await page.getByRole('tab', { name: '区县' }).click();
  await page.getByTestId('district-option').filter({ hasText: '上城区' }).click();
}

test('TerraceWizard active district selection auto-advances to sunlight', async ({ page }) => {
  await page.goto('/#/terrace?target_crop_id=crop-grape');

  await expect(page.getByText('您所在的区县？')).toBeVisible({ timeout: 15000 });
  await chooseHangzhouDistrict(page);

  await expect(page.getByText('露台日照情况')).toBeVisible();
  await expect(page.getByText('您所在的区县？')).toHaveCount(0);
});

test('TerraceWizard prefilled district does not auto-advance on load', async ({ page }) => {
  await page.route('**/api/terraces/mine', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'prefilled-terrace',
        cityCode: 'hangzhou',
        regionAdminCode: '330102',
        regionName: '上城区',
        provinceName: '浙江省',
        cityName: '杭州市',
        needsDistrictConfirmation: false,
        sunExposureLevel: 'LONG',
        rainExposed: false,
      }),
    });
  });

  await page.goto('/#/terrace');

  await expect(page.getByText('您所在的区县？')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('当前区县')).toBeVisible();
  await expect(page.getByText('浙江省 · 杭州市 · 上城区')).toBeVisible();
  await expect(page.getByText('露台日照情况')).toHaveCount(0);
});

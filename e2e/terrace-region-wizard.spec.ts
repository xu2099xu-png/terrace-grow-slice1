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

test('TerraceWizard preserves perennial plan context after profile creation', async ({ page }) => {
  let terraceBody: any = null;
  await page.route('**/api/terraces', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    terraceBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'terrace-context' }),
    });
  });

  await page.goto('/#/terrace?target_crop_id=crop-grape&variety_id=var-grape-kyoho&admin_code=330106&city_code=hangzhou');

  await expect(page.getByText('您所在的区县？')).toBeVisible({ timeout: 15000 });
  await chooseHangzhouDistrict(page);
  await expect(page.getByText('露台日照情况')).toBeVisible();
  await page.getByText('阳光充足（大部分白天都有阳光）').click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('朝向和日照时段？')).toBeVisible();
  await page.getByText('南', { exact: true }).click();
  await page.getByText('全天', { exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台是否淋雨？')).toBeVisible();
  await page.getByText('会淋到雨').click();
  await page.getByRole('button', { name: '完成' }).click();

  await expect(page).toHaveURL(/#\/perennial\/crop-grape\/plan\?/);
  expect(new URL(page.url()).hash).toContain('variety_id=var-grape-kyoho');
  expect(new URL(page.url()).hash).toContain('admin_code=330106');
  expect(new URL(page.url()).hash).toContain('city_code=hangzhou');
  expect(terraceBody).toMatchObject({
    regionAdminCode: '330102',
    sunExposureLevel: 'LONG',
    rainExposed: true,
  });
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

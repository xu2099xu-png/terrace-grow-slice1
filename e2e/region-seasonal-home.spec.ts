import { expect, test } from '@playwright/test';

const SELECTED_REGION_STORAGE_KEY = 'terrace:selected-region';

async function denyGeolocation(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
        },
      },
    });
  });
}

async function chooseOrdinaryDistrict(page: import('@playwright/test').Page) {
  await page.getByTestId('province-option').filter({ hasText: '浙江省' }).click();
  await page.getByRole('tab', { name: '城市' }).click();
  await page.getByTestId('city-option').filter({ hasText: '杭州市' }).click();
  await page.getByRole('tab', { name: '区县' }).click();
  await page.getByTestId('district-option').filter({ hasText: '上城区' }).click();
}

async function chooseMunicipalityDistrict(page: import('@playwright/test').Page) {
  await page.getByTestId('province-option').filter({ hasText: '北京市' }).click();
  await expect(page.getByTestId('city-option')).toHaveCount(0);
  await page.getByTestId('district-option').filter({ hasText: '东城区' }).click();
}

test('first-use denied location falls back to manual ordinary district seasonal home', async ({ page }) => {
  await denyGeolocation(page);
  await page.goto('/#/');

  await expect(page.getByText('定位未完成，请手动选择区县。')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('region-picker')).toBeVisible();
  await chooseOrdinaryDistrict(page);

  await expect(page.getByText('浙江省 · 杭州市 · 上城区')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/2026-03-20 · 周/)).toBeVisible();
  await expect(page.getByText('天气暂不可用', { exact: true })).toBeVisible();
  await expect(page.locator('a', { hasText: '和风天气/QWeather' })).toHaveCount(0);

  const stored = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return {
      selected: raw ? JSON.parse(raw) : null,
      localStorageDump: JSON.stringify(localStorage),
    };
  }, SELECTED_REGION_STORAGE_KEY);
  expect(stored.selected).toMatchObject({
    admin_code: '330102',
    name: '上城区',
    province_name: '浙江省',
    city_name: '杭州市',
  });
  expect(JSON.stringify(stored.selected)).not.toContain('latitude');
  expect(JSON.stringify(stored.selected)).not.toContain('longitude');
  expect(stored.localStorageDump).not.toContain('30.2');
});

test('manual picker supports direct-controlled municipality without a fake city step', async ({ page }) => {
  await denyGeolocation(page);
  await page.goto('/#/');

  await expect(page.getByTestId('region-picker')).toBeVisible({ timeout: 15000 });
  await chooseMunicipalityDistrict(page);

  await expect(page.getByText('北京市 · 北京市 · 东城区')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/2026-03-20 · 周/)).toBeVisible();
});

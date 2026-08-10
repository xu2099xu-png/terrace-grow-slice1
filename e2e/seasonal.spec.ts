import { test, expect } from '@playwright/test';

/**
 * S3-E2E-01 (Golden Path A) — seasonal flow via the Home entry:
 * Home → 这个季节种什么 → (geolocation mock → beijing) → recommendation list
 * → find an `either` crop whose current window only permits direct seed
 * → card and detail both keep the contextual 建议直播 conclusion.
 * SEASON_DATE=2026-03-20 so lettuce direct_seed hits while nursery_plant does not.
 */
test('S3-E2E-01 seasonal happy path: recommendation list → 建议直播 → detail', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 39.9, longitude: 116.4 });

  await page.goto('/#/');
  await expect(page.getByText('北京市 · 北京市 · 海淀区')).toBeVisible({ timeout: 15000 });

  const lettuceCard = page.getByTestId('seasonal-item').filter({ hasText: '生菜' });
  await expect(lettuceCard).toBeVisible({ timeout: 15000 });
  await expect(lettuceCard.getByText('建议直播')).toBeVisible();

  // Open unified crop detail without losing the recommendation context.
  await lettuceCard.click();
  await page.waitForURL('**/#/crops/crop-lettuce**start_methods=direct_seed**', { timeout: 15000 });
  await expect(page.getByText('生菜').first()).toBeVisible();
  const startMethodCell = page.locator('.van-cell', { hasText: '开始方式' }).first();
  await expect(startMethodCell.locator('.van-cell__value')).toHaveText('建议直播');
});

/**
 * S3-E2E-02 (Golden Path B) — WeatherProvider failure must not kill the page:
 * recommendation still exists AND the page shows the weather degradation hint.
 * The E2E server runs with the http weather provider and no key → unavailable.
 */
test('S3-E2E-02 weather unavailable: recommendations remain + degradation hint', async ({ page }) => {
  await page.goto('/#/seasons/now?city_code=beijing');
  await expect(page.getByText('暂未结合近期天气')).toBeVisible({ timeout: 15000 });
  // recommendations still exist (carrot in window under SEASON_DATE=2026-03-20)
  const carrotCard = page.locator('.crop-card', { hasText: '胡萝卜' });
  await expect(carrotCard).toBeVisible({ timeout: 15000 });
});

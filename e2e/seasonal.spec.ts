import { test, expect } from '@playwright/test';

/**
 * S3-E2E-01 (Golden Path A) — seasonal flow via the Home entry:
 * Home → 这个季节种什么 → (geolocation mock → beijing) → recommendation list
 * → find a direct-seed crop (胡萝卜) showing 建议直播 → open crop detail.
 * SEASON_DATE=2026-04-10 so carrot/lettuce/tomato windows deterministically hit.
 */
test('S3-E2E-01 seasonal happy path: recommendation list → 建议直播 → detail', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 39.9, longitude: 116.4 });

  await page.goto('/#/');
  await expect(page.getByText('这个季节种什么').first()).toBeVisible();
  await page.getByText('这个季节种什么').first().click();

  // geolocation resolves to beijing (mock resolver) → seasons page
  await page.waitForURL('**/#/seasons/now?city_code=beijing', { timeout: 15000 });

  // Recommendation list exists with carrot (direct_seed window hits 04-10).
  const carrotCard = page.locator('.crop-card', { hasText: '胡萝卜' });
  await expect(carrotCard).toBeVisible({ timeout: 15000 });
  await expect(carrotCard.locator('.start-method')).toHaveText('建议直播');

  // Open unified crop detail.
  await carrotCard.click();
  await page.waitForURL('**/#/crops/crop-carrot');
  await expect(page.getByText('胡萝卜').first()).toBeVisible();
  await expect(page.getByText('建议直播').first()).toBeVisible();
});

/**
 * S3-E2E-02 (Golden Path B) — WeatherProvider failure must not kill the page:
 * recommendation still exists AND the page shows the weather degradation hint.
 * The E2E server runs with the http weather provider and no key → unavailable.
 */
test('S3-E2E-02 weather unavailable: recommendations remain + degradation hint', async ({ page }) => {
  await page.goto('/#/seasons/now?city_code=beijing');
  await expect(page.getByText('暂未结合近期天气')).toBeVisible({ timeout: 15000 });
  // recommendations still exist (carrot in window under SEASON_DATE=2026-04-10)
  const carrotCard = page.locator('.crop-card', { hasText: '胡萝卜' });
  await expect(carrotCard).toBeVisible({ timeout: 15000 });
});

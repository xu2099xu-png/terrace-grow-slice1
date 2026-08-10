import { test, expect } from '@playwright/test';
import { createSunnyTerrace } from './helpers/slice6-flows';

test('B-E2E-01 plan route crop change ignores stale previous response', async ({ page }) => {
  let releaseBlueberry!: () => void;
  const blueberryGate = new Promise<void>((resolve) => {
    releaseBlueberry = resolve;
  });
  let sawBlueberryRequest = false;

  await page.route('**/api/recommendations/perennial', async (route) => {
    const body = route.request().postDataJSON() as { crop_id?: string } | null;
    if (body?.crop_id === 'crop-blueberry') {
      sawBlueberryRequest = true;
      await blueberryGate;
    }
    await route.continue();
  });

  await createSunnyTerrace(page);
  await expect(page.getByText('生成方案中')).toBeVisible();
  expect(sawBlueberryRequest).toBe(true);

  const grapeResponse = page.waitForResponse((res) => {
    const request = res.request();
    return (
      res.url().includes('/api/recommendations/perennial') &&
      request.method() === 'POST' &&
      request.postDataJSON()?.crop_id === 'crop-grape'
    );
  });
  await page.goto('/#/plan/crop-grape');
  await grapeResponse;

  const grapeVariety = page.locator('.van-cell', { hasText: '巨峰 已选' }).first();
  await expect(grapeVariety).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('奥尼尔')).toHaveCount(0);

  const staleBlueberryResponse = page.waitForResponse((res) => {
    const request = res.request();
    return (
      res.url().includes('/api/recommendations/perennial') &&
      request.method() === 'POST' &&
      request.postDataJSON()?.crop_id === 'crop-blueberry'
    );
  });
  releaseBlueberry();
  await staleBlueberryResponse;
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/#\/plan\/crop-grape$/);
  await expect(grapeVariety).toBeVisible();
  await expect(page.getByText('奥尼尔')).toHaveCount(0);

  await page.getByRole('button', { name: '开始种植' }).click();
  await page.waitForURL('**/#/planting-start?*');
  expect(page.url()).toContain('crop_id=crop-grape');
  expect(page.url()).toContain('container_type_id=ct-clay-pot');
  expect(page.url()).toContain('variety_id=var-grape-kyoho');
  expect(page.url()).not.toContain('crop-blueberry');
  expect(page.url()).not.toContain('var-oneal');
});

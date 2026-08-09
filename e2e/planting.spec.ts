import { test, expect } from '@playwright/test';

/**
 * S2-E2E-01 — Happy path.
 * Anonymous → terrace → grape → valid plan → start planting → confirm date
 * → PlantingRecord → current stage → complete an action → refresh browser
 * → action still completed.
 */
test('S2-E2E-01 happy path: grape plan to persistent current stage', async ({ page }) => {
  await page.goto('/#/terrace');
  await page.locator('input').first().fill('beijing');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台日照情况')).toBeVisible();
  await page.getByText('阳光充足（大部分白天都有阳光）').click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台是否淋雨？')).toBeVisible();
  await page.getByText('会淋到雨').click();
  await page.getByRole('button', { name: '完成' }).click();
  // wizard navigates to blueberry plan; wait for it to settle before leaving
  await page.waitForURL('**/#/plan/crop-blueberry');

  // Home offers grape entry (reload to guarantee the SPA re-mounts Home).
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByText('葡萄').first()).toBeVisible();
  await page.getByText('葡萄').first().click();
  await page.waitForURL('**/#/plan/crop-grape');

  // Valid plan shows "开始种植".
  await expect(page.getByText('适合种植', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: '开始种植' })).toBeVisible({ timeout: 15000 });

  // Start planting → confirm page → confirm.
  await page.getByRole('button', { name: '开始种植' }).click();
  await page.waitForURL('**/#/planting-start?*');
  await expect(page.getByRole('heading', { name: '确认开始种植' })).toBeVisible();
  await page.getByRole('button', { name: '确认开始种植' }).click();

  // Enter current stage page.
  await page.waitForURL('**/#/plantings/**');
  await expect(page.getByText('现在要做什么')).toBeVisible();

  // Complete the known fixture action deterministically.
  const actionRow = page.locator('.van-cell', { hasText: '完成定植初期操作' });
  await expect(actionRow).toBeVisible();
  await actionRow.getByRole('button', { name: '完成' }).click();
  await expect(actionRow.getByRole('button', { name: '已完成' })).toBeVisible();

  // Refresh browser → action still completed.
  await page.reload();
  await expect(page.getByText('现在要做什么')).toBeVisible();
  const actionRowAfter = page.locator('.van-cell', { hasText: '完成定植初期操作' });
  await expect(actionRowAfter.getByRole('button', { name: '已完成' })).toBeVisible();
});

/**
 * S2-E2E-02 — NO_MATCH. Grape plan with unsuitable sunlight shows "not
 * suitable", NO "开始种植" button, and no way into the planting flow.
 */
test('S2-E2E-02 NO_MATCH: no start-planting button, no flow entry', async ({ page }) => {
  // Create terrace with north + rarely => LOW 0-1h => NO_MATCH.
  await page.goto('/#/terrace');
  await page.locator('input').first().fill('beijing');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台日照情况')).toBeVisible();
  await page.getByText('我不太确定').click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('辅助判断')).toBeVisible();
  // auxiliary: north + rarely
  await page.getByText('北', { exact: true }).click();
  await page.getByText('很少', { exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台是否淋雨？')).toBeVisible();
  await page.getByText('会淋到雨').click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForURL('**/#/plan/crop-blueberry');

  // Open grape plan (reload to guarantee SPA re-mounts Home).
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByText('葡萄').first()).toBeVisible();
  await page.getByText('葡萄').first().click();
  await page.waitForURL('**/#/plan/crop-grape');

  // Unsuitable shown, no start button.
  await expect(page.getByText('为什么暂不推荐')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: '开始种植' })).toHaveCount(0);
});

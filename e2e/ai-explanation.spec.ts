import { test, expect, type Page } from '@playwright/test';

async function createSunnyTerrace(page: Page) {
  await page.goto('/#/terrace?target_crop_id=crop-blueberry');
  await expect(page.getByText('您所在的城市？')).toBeVisible();
  await page.getByRole('button', { name: '北京' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台日照情况')).toBeVisible();
  await page.getByText('阳光充足（大部分白天都有阳光）').click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台是否淋雨？')).toBeVisible();
  await page.getByText('会淋到雨').click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForURL('**/#/plan/crop-blueberry');
}

async function openGrapePlan(page: Page) {
  await createSunnyTerrace(page);
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByText('葡萄').first()).toBeVisible();
  await page.getByText('葡萄').first().click();
  await page.waitForURL('**/#/plan/crop-grape');
  await expect(page.getByRole('button', { name: '开始种植' })).toBeVisible({ timeout: 15000 });
}

async function authenticate(page: Page) {
  const response = await page.request.post('/api/auth/anonymous', {
    data: { device_id: `ai-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  expect(response.status()).toBe(201);
  const { token } = await response.json();
  await page.goto('/#/');
  await page.evaluate((value) => localStorage.setItem('token', value), token);
}

async function submitExplanation(page: Page, question: string) {
  await page.getByTestId('ai-explain-button').first().click();
  await page.getByPlaceholder('问一句关于当前建议的问题').fill(question);
  const [response] = await Promise.all([
    page.waitForResponse((res) => (
      res.url().includes('/api/ai/ask') &&
      res.request().method() === 'POST'
    )),
    page.getByTestId('ai-submit-button').click(),
  ]);
  return response;
}

function expectExactKeys(value: Record<string, unknown>, keys: string[]) {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

async function expectAnsweredAiResponse(response: Awaited<ReturnType<typeof submitExplanation>>) {
  expect(response.status()).toBe(200);
  const json = await response.json();
  expectExactKeys(json, ['status', 'answer', 'source', 'cache_hit', 'citations', 'warnings']);
  expect(json.status).toBe('answered');
  expect(json.source).toBe('ai');
  expect(typeof json.cache_hit).toBe('boolean');
  expect(Array.isArray(json.citations)).toBe(true);
  expect(json.citations.length).toBeGreaterThan(0);
  expect(Array.isArray(json.warnings)).toBe(true);
  return json;
}

test('S5-E2E-01 perennial plan explanation posts refs and renders cited response', async ({ page }) => {
  await openGrapePlan(page);
  await expect(page.getByText('容器建议')).toBeVisible();

  const response = await submitExplanation(page, '为什么推荐这个方案？');
  const body = response.request().postDataJSON();
  expect(body).toEqual({
    context_type: 'perennial_plan',
    question: '为什么推荐这个方案？',
    crop_id: 'crop-grape',
    selected_container_type_id: 'ct-clay-pot',
    selected_variety_id: 'var-grape-kyoho',
  });
  expectExactKeys(body, [
    'context_type',
    'question',
    'crop_id',
    'selected_container_type_id',
    'selected_variety_id',
  ]);
  expect(body).not.toHaveProperty('soil_mix');
  expect(body).not.toHaveProperty('sunlight_status');
  expect(body).not.toHaveProperty('weather');
  expect(body).not.toHaveProperty('plan');

  await expectAnsweredAiResponse(response);
  await expect(page.getByTestId('ai-state')).toHaveText(/AI 解释/);
  await expect(page.getByTestId('ai-answer')).toBeVisible();
  await expect(page.getByTestId('ai-citation').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '开始种植' })).toBeVisible();
});

test('S5-E2E-02 seasonal item explanation renders provider failure rules fallback without navigation loss', async ({ page }) => {
  await authenticate(page);
  await page.goto('/#/seasons/now?city_code=beijing');
  const carrotCard = page.locator('.crop-card', { hasText: '胡萝卜' });
  await expect(carrotCard).toBeVisible({ timeout: 15000 });

  await carrotCard.getByTestId('ai-explain-button').click();
  await page.getByPlaceholder('问一句关于当前建议的问题').fill('[mock:provider_unavailable]');
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/ai/ask') && res.request().method() === 'POST'),
    page.getByTestId('ai-submit-button').click(),
  ]);
  expect(response.status()).toBe(200);
  const body = response.request().postDataJSON();
  expect(body).toEqual({
    context_type: 'seasonal_item',
    question: '[mock:provider_unavailable]',
    city_code: 'beijing',
    crop_id: 'crop-carrot',
  });
  const json = await response.json();
  expectExactKeys(json, ['status', 'answer', 'source', 'cache_hit', 'citations', 'warnings']);
  expect(json.status).toBe('provider_unavailable');
  expect(json.source).toBe('rules');
  expect(json.cache_hit).toBe(false);
  expect(Array.isArray(json.citations)).toBe(true);
  expect(json.citations.length).toBeGreaterThan(0);
  await expect(page.getByTestId('ai-state')).toHaveText('AI 暂时不可用，以下为规则解释');
  await expect(page.getByTestId('ai-answer')).toBeVisible();
  await expect(carrotCard).toBeVisible();

  await page.getByLabel('关闭').click();
  await expect(page.getByTestId('ai-explain-panel')).toBeHidden();
  await carrotCard.locator('.name').click();
  await page.waitForURL('**/#/crops/crop-carrot**');
  await expect(page.getByText('胡萝卜').first()).toBeVisible();
});

test('S5-E2E-03 planting current-stage explanation keeps action completion usable', async ({ page }) => {
  await openGrapePlan(page);
  await page.getByRole('button', { name: '开始种植' }).click();
  await page.waitForURL('**/#/planting-start?*');
  await expect(page.getByRole('heading', { name: '确认开始种植' })).toBeVisible();
  await page.getByRole('button', { name: '确认开始种植' }).click();

  await page.waitForURL('**/#/plantings/**');
  await expect(page.getByText('现在要做什么')).toBeVisible();
  const response = await submitExplanation(page, '为什么现在要做这些操作？');
  const body = response.request().postDataJSON();
  expectExactKeys(body, ['context_type', 'question', 'planting_id']);
  expect(body).toMatchObject({
    context_type: 'planting_now',
    question: '为什么现在要做这些操作？',
  });
  expect(typeof body.planting_id).toBe('string');
  expect(body.planting_id.length).toBeGreaterThan(0);
  expect(body).not.toHaveProperty('current_stage');
  expect(body).not.toHaveProperty('actions');

  await expectAnsweredAiResponse(response);
  await expect(page.getByTestId('ai-state')).toHaveText(/AI 解释/);
  await expect(page.getByTestId('ai-answer')).toBeVisible();

  await page.getByLabel('关闭').click();
  const actionRow = page.locator('.van-cell', { hasText: '完成定植初期操作' });
  await expect(actionRow).toBeVisible();
  await actionRow.getByRole('button', { name: '完成' }).click();
  await expect(actionRow.getByRole('button', { name: '已完成' })).toBeVisible();
});

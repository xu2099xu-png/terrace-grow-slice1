import { expect, type Page } from '@playwright/test';

export async function chooseBeijingDistrict(page: Page) {
  await page.getByTestId('popular-region').filter({ hasText: /^北京$/ }).click();
  await page.getByTestId('district-option').filter({ hasText: '东城区' }).click();
}

export async function createSunnyTerrace(page: Page, targetCropId = 'crop-blueberry') {
  await page.goto(`/#/terrace?target_crop_id=${targetCropId}`);
  await expect(page.getByText('您所在的区县？')).toBeVisible();
  await chooseBeijingDistrict(page);
  await expect(page.getByText('露台日照情况')).toBeVisible();
  await page.getByText('阳光充足（大部分白天都有阳光）').click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台是否淋雨？')).toBeVisible();
  await page.getByText('会淋到雨').click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForURL(`**/#/plan/${targetCropId}`);
}

export async function createLowSunTerrace(page: Page, targetCropId = 'crop-blueberry') {
  await page.goto(`/#/terrace?target_crop_id=${targetCropId}`);
  await expect(page.getByText('您所在的区县？')).toBeVisible();
  await chooseBeijingDistrict(page);
  await expect(page.getByText('露台日照情况')).toBeVisible();
  await page.getByText('我不太确定').click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('辅助判断')).toBeVisible();
  await page.getByText('北', { exact: true }).click();
  await page.getByText('很少', { exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('露台是否淋雨？')).toBeVisible();
  await page.getByText('会淋到雨').click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForURL(`**/#/plan/${targetCropId}`);
}

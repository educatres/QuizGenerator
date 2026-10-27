import { expect, test } from '@playwright/test';

test('opens the five-step local-first workflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Teacher Exam Studio/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '連接你的 AI' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '連接你的 AI' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '製作流程' }).getByRole('button')).toHaveCount(5);
  await page.getByRole('button', { name: /下一步：加入教材/ }).click();
  await expect(page.getByRole('heading', { name: '加入命題教材' })).toBeVisible();
});

test('opens API settings on demand and persists a key in this browser', async ({ page }) => {
  await page.goto('/');
  await page.locator('.ai-settings-toggle').click();
  const dialog = page.getByRole('dialog', { name: '連接你的 AI' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('API Key').fill('test-browser-key');
  await dialog.getByRole('button', { name: '儲存 API Key' }).click();
  await expect(dialog.getByText('這個瀏覽器已保存')).toBeVisible();
  await page.reload();
  await page.locator('.ai-settings-toggle').click();
  await expect(page.getByRole('dialog', { name: '連接你的 AI' }).getByRole('button', { name: '清除 API Key' })).toBeVisible();
});

test('accepts pasted teaching material and opens the blueprint', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /下一步：加入教材/ }).click();
  await page.getByPlaceholder('貼上講義、文章或課程內容…').fill('光合作用會利用光能，將二氧化碳與水轉換成葡萄糖，並釋放氧氣。這是植物獲得能量的重要過程。');
  await page.getByRole('button', { name: '加入文字教材' }).click();
  await expect(page.getByText(/1 份 · 1 個片段/)).toBeVisible();
  await page.getByRole('button', { name: /下一步：設定題型/ }).click();
  await expect(page.getByRole('heading', { name: '設定題型與難度' })).toBeVisible();
  await expect(page.getByText('10', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '產生候選題' }).click();
  await expect(page.getByRole('dialog', { name: '連接你的 AI' })).toBeVisible();
  await expect(page.getByText('請先設定 API Key；設定面板已為你開啟。')).toBeVisible();
});

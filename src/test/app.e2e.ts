import { expect, test } from '@playwright/test';

test('opens the five-step local-first workflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /QuizGenerator/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16px');
  await expect(page.getByRole('heading', { name: '連接你的 AI' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '連接你的 AI' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '製作流程' }).getByRole('button')).toHaveCount(5);
  await expect(page.locator('.app-footer')).toHaveCount(0);
  await page.getByRole('button', { name: /下一步：加入教材/ }).click();
  await expect(page.getByRole('heading', { name: '加入命題教材' })).toBeVisible();
});

test('loads the AI concepts sample material', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /下一步：加入教材/ }).click();
  await page.getByRole('button', { name: /載入 AI 概念入門範例/ }).click();
  await expect(page.getByText('AI_概念入門_範例.txt')).toBeVisible();
  await expect(page.getByText(/已載入「AI 概念入門」範例/)).toBeVisible();
  await expect(page.getByRole('button', { name: /下一步：設定題型/ })).toBeEnabled();
});

test('opens API settings on demand and persists a key in this browser', async ({ page }) => {
  await page.goto('/');
  await page.locator('.ai-settings-toggle').click();
  const dialog = page.getByRole('dialog', { name: '連接你的 AI' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('BASE URL')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'air.cgu.edu.tw' })).toHaveAttribute('href', 'https://air.cgu.edu.tw/');
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
  await page.getByLabel('出題語言').selectOption('en');
  await expect(page.locator('.generation-summary').getByText('英文', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '聚焦核心概念與推理，避免死記硬背。' }).click();
  await expect(page.getByLabel('額外命題要求')).toHaveValue('聚焦核心概念與推理，避免死記硬背。');
  await page.getByRole('button', { name: '產生候選題' }).click();
  await expect(page.getByRole('dialog', { name: '連接你的 AI' })).toBeVisible();
  await expect(page.getByText('請先設定 API Key；設定面板已為你開啟。')).toBeVisible();
  await page.waitForTimeout(5_200);
  await expect(page.getByText('請先設定 API Key；設定面板已為你開啟。')).toBeVisible();
});

test('separates review batches and can clear every reviewed question at once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('TeacherExamStudio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const base = {
      type: 'true_false', correctBoolean: true, explanation: '解析', sources: [], difficulty: 'easy', points: 5,
      status: 'candidate', revision: 1, providerId: 'cgu', modelId: 'luna-test', createdAt: '2026-10-27T12:00:00.000Z',
    };
    const transaction = database.transaction('snapshots', 'readwrite');
    transaction.objectStore('snapshots').put({
      id: 'current', materials: [], exam: { title: '測驗', subtitle: '', duration: 50, seed: 2026 }, updatedAt: new Date().toISOString(),
      questions: [
        { ...base, id: 'run-a-question', generationId: 'run-a', stem: '第一次產出的題目' },
        { ...base, id: 'run-b-question', generationId: 'run-b', stem: '第二次產出的題目', status: 'accepted', createdAt: '2026-10-27T12:05:00.000Z' },
      ],
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await page.getByRole('navigation', { name: '製作流程' }).getByRole('button', { name: /審核題庫/ }).click();

  const batchTabs = page.getByRole('tablist', { name: '產題批次' });
  await expect(batchTabs.getByRole('tab')).toHaveCount(2);
  await expect(batchTabs.getByRole('tab', { name: /第 2 次產出/ })).toHaveAttribute('aria-selected', 'true');
  await batchTabs.getByRole('tab', { name: /第 1 次產出/ }).click();
  await expect(page.locator('[data-question-id="run-a-question"]')).toBeVisible();
  await expect(page.locator('[data-question-id="run-b-question"]')).toHaveCount(0);

  await page.getByRole('navigation', { name: '製作流程' }).getByRole('button', { name: /匯出試卷/ }).click();
  await expect(page.getByRole('button', { name: /一般考卷 DOCX/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /A／B 卷 DOCX/ })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /純文字試題 TXT/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('quiz-generator.txt');
  await expect(page.getByText(/考卷 HTML/)).toHaveCount(0);
  await page.getByRole('navigation', { name: '製作流程' }).getByRole('button', { name: /審核題庫/ }).click();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清除全部題目' }).click();
  await expect(page.getByText('已清除審核頁面的全部題目。')).toBeVisible();
  await expect(batchTabs.getByRole('tab')).toHaveCount(0);
});

test('imports a past exam and lets the teacher choose how to use it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /下一步：加入教材/ }).click();
  await page.getByLabel('匯入考古題檔案').setInputFiles({
    name: '歷屆期中考.txt', mimeType: 'text/plain', buffer: Buffer.from('第一題：請說明人工智慧與機器學習的關係。'),
  });
  await expect(page.getByText('歷屆期中考.txt')).toBeVisible();
  const strategies = page.getByRole('radiogroup', { name: '考古題使用方式' });
  await expect(strategies.getByRole('radio', { name: /根據考古題變換題型/ })).toHaveAttribute('aria-checked', 'true');
  await strategies.getByRole('radio', { name: /避開考古題/ }).click();
  await expect(strategies.getByRole('radio', { name: /避開考古題/ })).toHaveAttribute('aria-checked', 'true');
});

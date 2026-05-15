// Baseline Playwright smoke test — proves the dev server is up and the
// app's chrome renders. New lesson tests live alongside this file.

import { test, expect } from '@playwright/test';

test('app loads with the default lesson visible', async ({ page }) => {
  await page.goto('/');
  // Puzzle bar carries the lesson title — wait for it to render.
  await expect(page.locator('.puzzle-info h1')).toBeVisible();
  // Default lesson is L1 ("Build a Computer").
  await expect(page.locator('.lesson-pill')).toContainText(/Lesson 1\b/);
});

test('Palette renders both track pills', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.track-pill', { hasText: 'Systems' })).toBeVisible();
  await expect(page.locator('.track-pill', { hasText: 'JavaScript' })).toBeVisible();
});

test('Hint button is present on L1', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hint-button')).toBeVisible();
});

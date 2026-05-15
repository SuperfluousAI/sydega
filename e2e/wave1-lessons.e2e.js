// End-to-end browser tests for the 5 wave-1 easy lessons added in Parts
// 26-30: L4.1 Your First Request, L4.2 When the Server Can't Keep Up,
// L6.5 What a Cache Hit Rate Means, L6.7 Latency Adds Up, L8.5 Why Have
// Two. Each test:
//
//   1. Loads the app.
//   2. Selects the lesson from the Palette by clicking its title.
//   3. Clicks "Show solution" to clobber the canvas with the canonical
//      passing graph.
//   4. Clicks "▶ Run".
//   5. Asserts the green "Puzzle solved!" banner appears.
//
// This is the cheapest comprehensive test: it exercises the real Vite
// build + the real React Flow drag/drop infrastructure + the real
// simulator + the real CSS. Each test takes ~5 seconds.

import { test, expect } from '@playwright/test';

const LESSONS = [
  { title: 'Your First Request' },
  { title: "When the Server Can't Keep Up" },
  { title: 'What a Cache Hit Rate Means' },
  { title: 'Latency Adds Up' },
  { title: 'Why Have Two' },
];

for (const lesson of LESSONS) {
  test(`${lesson.title}: Show solution + Run produces the green banner`, async ({ page }) => {
    await page.goto('/');
    // The lesson list lives inside .lessons-list; each row has a
    // .lesson-title span carrying the puzzle title. Click the row.
    await page.locator('.lesson-item', { hasText: lesson.title }).click();
    // PuzzleBar h1 should now carry the new title — proves the puzzle switched.
    await expect(page.locator('.puzzle-info h1')).toContainText(lesson.title);
    // Click "✨ Show solution" — replaces the canvas with the canonical graph.
    await page.locator('button', { hasText: 'Show solution' }).click();
    // Click "▶ Run".
    await page.locator('button', { hasText: 'Run' }).first().click();
    // The puzzle's pass banner is .banner.good.celebrate carrying the
    // "🎉 Puzzle solved!" text.
    await expect(page.locator('.banner.good.celebrate')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.banner.good.celebrate')).toContainText('Puzzle solved');
  });
}

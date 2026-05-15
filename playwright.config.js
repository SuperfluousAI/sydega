// Playwright config — end-to-end tests against the real Vite dev server.
// Vitest covers unit + DOM-presence tests in jsdom with a mocked reactflow;
// Playwright covers what jsdom can't: HTML5 drag/drop, CSS layout, the full
// click-through experience of a lesson in a real browser.
//
// Run locally: `npm run e2e` (starts the dev server + runs tests).
// CI integration is deferred — see journal Part 25.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Vitest lives under src/ ending in .test.js[x]; this glob keeps the two
  // test runners from overlapping.
  testMatch: '**/*.e2e.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the Vite dev server before running tests if it isn't already up.
  // `reuseExistingServer` so the operator's running dev server is honored.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

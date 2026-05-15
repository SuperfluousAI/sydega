import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so LAN devices can reach the dev server.
    // Without this Vite listens on 127.0.0.1 only.
    host: '0.0.0.0',
  },
  test: {
    environment: 'jsdom',
    // Worktrees from the Agent isolation runs live under .claude/worktrees/
    // and each carries a full copy of src/ — including test files. Without
    // this exclude, vitest re-runs every test once per worktree and the
    // count balloons from ~600 to thousands. Also exclude e2e/ (Playwright
    // runs those separately).
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/e2e/**'],
  },
})

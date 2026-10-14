import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const e2eDatabaseUrl = `file:${path.join(process.cwd(), "prisma", "e2e.db")}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx prisma migrate reset --force && npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      DISABLE_FEED_SCHEDULER: "true",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

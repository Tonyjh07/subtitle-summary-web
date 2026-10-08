import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 锁定测试（纯前端形态）：全部 /api/* 由 route interception 提供 fixture（e2e/fixtures.ts）。
 *
 * webServer 会自动启动 `pnpm start`（需先 pnpm build）；本地若已有服务在跑则复用。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm start",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

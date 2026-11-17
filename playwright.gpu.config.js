// Art reviews on the real GPU (hardware ANGLE/D3D11) — what a PC player sees. SwiftShader (the default config)
// renders the terrain at ~1 s/frame and skips the PC tier, so its images can't judge the art.
//   npx playwright test -c playwright.gpu.config.js      → .superpowers/look-gpu/*.png
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/look-gpu',
  timeout: 240_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8081',
    viewport: { width: 1600, height: 900 },
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] },
  },
  webServer: { command: 'npx http-server -p 8081 -c-1 -s .', port: 8081, reuseExistingServer: true, timeout: 60_000 },
});

# E2E tests

- Install browsers once: `npx playwright install chromium`
- Run against auto-started local server: `npm run test:e2e`
- Run against already-running server:
  - PowerShell: `$env:PLAYWRIGHT_USE_EXISTING_SERVER="1"; npm run test:e2e`
- Optional base URL override:
  - PowerShell: `$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:3001"; npm run test:e2e`

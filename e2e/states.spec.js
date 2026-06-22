import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures/mock-api.js';

// Empty-data and API-error handling: the app must degrade gracefully (no white
// screen, no uncaught errors) and surface a retry affordance on a failed refresh.

test('should_render_without_crashing_when_the_api_returns_no_data', async ({ page }) => {
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) jsErrors.push(m.text()); });

  await mockApi(page, { latest: [], history: [] });
  await page.goto('/lv/');

  // Shell still renders (no white screen) and no prices are shown.
  await expect(page.getByText('cenometrs.lv').first()).toBeVisible();
  await expect(page.getByText(/\b\d\.\d{3}\b/)).toHaveCount(0);
  expect(jsErrors, `JS errors:\n${jsErrors.join('\n')}`).toEqual([]);
});

test('should_show_an_error_toast_when_a_refresh_fails', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/');
  await expect(page.getByText(/\b\d\.\d{3}\b/).first()).toBeVisible(); // data loaded first

  // Make every API call fail, then trigger a manual refresh.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
  );
  await page.getByRole('button', { name: /refresh/i }).first().click();

  // The error toast appears (after the built-in retry) and a stale-data banner;
  // the previously loaded prices stay on screen rather than blanking out.
  await expect(page.getByText("Couldn't refresh", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/showing last loaded data/i)).toBeVisible();
  await expect(page.getByText(/\b\d\.\d{3}\b/).first()).toBeVisible();
});

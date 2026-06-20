import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures/mock-api.js';

// Highest-value E2E: the page must render real prices without crashing. This one
// smoke catches the blank-screen / JS-crash class of regression on both desktop
// and mobile (the two configured projects), which unit tests cannot see.
test.describe('home page', () => {
  test('should_load_and_show_prices_without_js_errors', async ({ page }) => {
    // Uncaught JS exceptions = a real crash. Resource-load 404s (favicon,
    // blocked analytics assets) are network noise, not app bugs — ignore those.
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/Failed to load resource/i.test(msg.text())) {
        jsErrors.push(msg.text());
      }
    });

    await mockApi(page);
    await page.goto('/');

    // App shell mounted.
    await expect(page.locator('#root')).not.toBeEmpty();

    // A station brand name appears (the prices view rendered).
    await expect(page.getByText(/Circle K|Neste|Vir[sš]i|Viada/).first()).toBeVisible();

    // At least one price in the X.XXX format is on screen.
    await expect(page.getByText(/\b\d\.\d{3}\b/).first()).toBeVisible();

    // No uncaught JS errors during initial render/fetch.
    expect(jsErrors, `JS errors:\n${jsErrors.join('\n')}`).toEqual([]);
  });

  test('should_render_without_horizontal_overflow_on_mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'mobile-only check');
    await mockApi(page);
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    // Allow a 1px rounding slack; anything more is a real horizontal-scroll bug.
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

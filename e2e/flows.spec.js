import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures/mock-api.js';

// Critical user flows against the built client with a mocked API. Kept to a
// small, high-value set (E2E is the most expensive layer to maintain); pure
// logic (filtering, discount rule, brush window) is covered by unit tests.
//
// Note: fuel/station labels are title-case in the DOM ("95 Petrol") and only
// uppercased via CSS, so locators use the DOM casing.

// These flows assert English DOM labels ("95 Petrol", etc.), so they run against
// the /en/ language document (language now lives in the URL path).
test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/');
  await expect(page.getByText(/\b\d\.\d{3}\b/).first()).toBeVisible(); // data rendered
});

test('should_filter_to_one_provider_via_the_stations_dropdown', async ({ page }) => {
  await page.getByRole('button', { name: /stations/i }).first().click();
  const nesteRow = page.locator('div.group').filter({ has: page.getByRole('button', { name: 'Neste', exact: true }) });
  await nesteRow.getByRole('button', { name: /only/i }).click();
  await page.mouse.click(2, 2); // outside-click to dismiss the popover before asserting

  await expect(page).toHaveURL(/stations=Neste/);
  // Scoped to <main>: the footer always links to all stations/fuels regardless
  // of the active filter, so an unscoped getByText would match it too.
  await expect(page.locator('main').getByText('Viada')).toHaveCount(0);     // other chains gone (global filter)
  await expect(page.locator('main').getByText('Circle K')).toHaveCount(0);
});

test('should_filter_to_one_fuel_via_the_fuel_dropdown', async ({ page }) => {
  await page.getByRole('button', { name: /fuel/i }).first().click();
  const row95 = page.locator('div.group').filter({ has: page.getByRole('button', { name: '95 Petrol', exact: true }) });
  await row95.getByRole('button', { name: /only/i }).click();
  await page.mouse.click(2, 2); // outside-click to dismiss the popover

  await expect(page).toHaveURL(/fuels=95/);
  await expect(page.locator('main').getByText('95 Petrol').first()).toBeVisible();
  await expect(page.locator('main').getByText('98 Petrol')).toHaveCount(0);
});

test('should_toggle_discount_shading_on_and_off', async ({ page }) => {
  const btn = page.getByRole('button', { name: /discounts/i });
  await btn.click();                                  // default ON -> OFF
  await expect(page).toHaveURL(/discounts=off/);
  await btn.click();                                  // OFF -> ON (param omitted)
  await expect(page).not.toHaveURL(/discounts=off/);
});

test('should_change_the_history_date_preset', async ({ page }) => {
  await page.getByRole('button', { name: '90 d.' }).click();
  await expect(page).toHaveURL(/h_preset=90/);
  await expect(page.getByText(/\d{2}\.\d{2}\.\d{2}\s*—\s*\d{2}\.\d{2}\.\d{2}/)).toBeVisible();
});

test('should_restore_filters_from_the_url_after_reload', async ({ page }) => {
  await page.getByRole('button', { name: /stations/i }).first().click();
  const nesteRow = page.locator('div.group').filter({ has: page.getByRole('button', { name: 'Neste', exact: true }) });
  await nesteRow.getByRole('button', { name: /only/i }).click();
  await expect(page).toHaveURL(/stations=Neste/);

  await page.reload();
  await expect(page).toHaveURL(/stations=Neste/);
  await expect(page.locator('main').getByText('Viada')).toHaveCount(0); // filter persisted
});

test('should_deep_link_station_and_fuel_filters', async ({ page }) => {
  await page.goto('/en/?stations=Neste&fuels=95');
  await expect(page.locator('main').getByText('95 Petrol').first()).toBeVisible();
  await expect(page.locator('main').getByText('98 Petrol')).toHaveCount(0);
  await expect(page.locator('main').getByText('Viada')).toHaveCount(0);
});

test('should_render_the_charts_and_timeline_slider', async ({ page }) => {
  await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
  const dots = await page.locator('.recharts-dot, .recharts-wrapper circle').count();
  expect(dots).toBeGreaterThan(0);
  await expect(page.getByText(/^\d{2}\.\d{2}\.\s*-\s*\d{2}\.\d{2}\.$/).first()).toBeVisible();
});

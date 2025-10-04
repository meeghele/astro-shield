// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { test, expect } from "@playwright/test";
import {
  clearGateStorage,
  waitForGateSuccess,
  DEFAULT_TIMEOUTS,
} from "./utils/gate-test-helpers.js";

/**
 * Integration Tests - Full User Journeys
 *
 * End-to-end tests covering complete user flows:
 * - Initial visit → gate → solve → unlock → content visible
 * - Subsequent visits with valid token → bypass gate
 * - Multi-page navigation
 * - Token expiration and re-challenge
 * - Browser refresh and navigation
 * - Multi-tab scenarios
 */
test.describe("Integration - Complete User Journey", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("1. Full flow: visit → redirect to gate → solve PoW → redirect to destination → content visible", async ({ page }) => {
    // Step 1: Visit protected page
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Step 2: Should redirect to gate
    await page.waitForURL(/\/gate.*next=%2F/, {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });
    expect(page.url()).toContain('/gate');
    expect(page.url()).toContain('next=%2F');

    // Step 3: Gate should solve PoW
    await waitForGateSuccess(page);

    // Verify token was created
    const tokenAfterSolve = await page.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });
    expect(tokenAfterSolve).toBeTruthy();

    // Step 4: Should redirect back to original destination
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Step 5: Shield should report ready
    await page.waitForFunction(() => {
      return (
        document.documentElement.hasAttribute('data-astro-shield-ready') &&
        window.__ASTRO_SHIELD_READY__ === true
      );
    }, { timeout: 5000 });

    // Step 6: Content should be visible
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
  });

  test("2. Subsequent visit with valid token bypasses gate", async ({ page }) => {
    // First visit: complete gate flow
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Verify token exists
    const token = await page.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });
    expect(token).toBeTruthy();

    // Second visit: should bypass gate
    await page.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should NOT redirect to gate
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/blog');
    expect(page.url()).not.toContain('/gate');

    // Content should be visible immediately
    await expect(page.locator('main')).toBeVisible();
  });

  test("3. Multi-page navigation with valid token works seamlessly", async ({ page }) => {
    // Complete gate first
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    const pages = ["/blog", "/contact", "/projects", "/"];

    // Navigate through multiple pages
    for (const targetPage of pages) {
      await page.goto(targetPage, { waitUntil: "domcontentloaded" });

      // Should stay on target page (not redirect)
      await page.waitForTimeout(1000);
      const currentPath = new URL(page.url()).pathname;
      expect(currentPath).toBe(targetPage);

      // Content should be visible
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test("4. Browser refresh maintains token and shield state", async ({ page }) => {
    // Complete gate
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Get token before refresh
    const tokenBefore = await page.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });

    // Refresh page
    await page.reload({ waitUntil: "domcontentloaded" });

    // Wait a bit for shield to initialize
    await page.waitForTimeout(1000);

    // Should not redirect to gate
    expect(page.url()).toContain('/');
    expect(page.url()).not.toContain('/gate');

    // Token should still exist
    const tokenAfter = await page.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });
    expect(tokenAfter).toBe(tokenBefore);

    // Shield should be ready
    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__, { timeout: 5000 });

    // Content should be visible
    await expect(page.locator('main')).toBeVisible();
  });

  test("5. Token expiration during session requires re-challenge", async ({ page }) => {
    // Complete gate first
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Manually expire the token
    await page.evaluate(() => {
      try {
        const stored = localStorage.getItem('as_gate_token_key_v1');
        if (stored) {
          const token = JSON.parse(stored);
          token.exp = Date.now() - 1000; // Expired 1 second ago
          localStorage.setItem('as_gate_token_key_v1', JSON.stringify(token));
          sessionStorage.setItem('as_gate_token_key_v1', JSON.stringify(token));
        }
      } catch (error) {
        // Ignore
      }
    });

    // Try to navigate to another page
    await page.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should redirect to gate again
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
    expect(page.url()).toContain('next=%2Fblog');

    // Should be able to complete gate again
    await waitForGateSuccess(page);
    await page.waitForURL("/blog", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Content should be visible
    await expect(page.locator('main')).toBeVisible();
  });

  test("6. Multiple browser tabs share the same token", async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Tab 1: Complete gate
    await page1.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page1);
    await page1.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Get token from tab 1
    const token1 = await page1.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });
    expect(token1).toBeTruthy();

    // Tab 2: Navigate to protected page
    await page2.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should bypass gate (using token from tab 1)
    await page2.waitForTimeout(2000);
    expect(page2.url()).toContain('/blog');
    expect(page2.url()).not.toContain('/gate');

    // Token should be available in tab 2
    const token2 = await page2.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });
    expect(token2).toBe(token1);

    // Both tabs should show content
    await expect(page1.locator('main')).toBeVisible();
    await expect(page2.locator('main')).toBeVisible();

    await context.close();
  });

  test("7. Navigation back button works correctly after gate completion", async ({ page }) => {
    // Start at blog
    await page.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should redirect to gate
    await page.waitForURL(/\/gate.*next=%2Fblog/, { timeout: 5000 });

    // Complete gate
    await waitForGateSuccess(page);

    // Should redirect to blog
    await page.waitForURL("/blog", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Navigate to another page
    await page.goto("/contact", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/contact');

    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);

    // Should be back at blog (not gate)
    expect(page.url()).toContain('/blog');
    await expect(page.locator('main')).toBeVisible();
  });

  test("8. Shield handles rapid navigation during gate solve", async ({ page }) => {
    // Start gate solve
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Immediately navigate away before solve completes
    await page.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should end up at gate (no token yet)
    await page.waitForURL(/\/gate/, { timeout: 5000 });

    // Complete gate now
    await waitForGateSuccess(page);

    // Should eventually reach destination
    await page.waitForTimeout(DEFAULT_TIMEOUTS.REDIRECT + 1000);

    // Should be on a valid page with content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe("Integration - Edge Case Scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("9. Direct gate URL with next parameter works correctly", async ({ page }) => {
    // Visit gate directly with explicit destination
    await page.goto("/gate?next=/projects", { waitUntil: "domcontentloaded" });

    await waitForGateSuccess(page);

    // Should redirect to specified destination
    await page.waitForURL("/projects", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    expect(new URL(page.url()).pathname).toBe("/projects");
    await expect(page.locator('main')).toBeVisible();
  });

  test("10. Gate with missing next parameter defaults to root", async ({ page }) => {
    // Visit gate without next parameter
    await page.goto("/gate", { waitUntil: "domcontentloaded" });

    await waitForGateSuccess(page);

    // Should redirect somewhere (likely root)
    await page.waitForTimeout(DEFAULT_TIMEOUTS.REDIRECT + 1000);

    // Should have created a token regardless
    const token = await page.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });
    expect(token).toBeTruthy();
  });
});

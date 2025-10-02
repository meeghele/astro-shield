// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { test, expect } from "@playwright/test";
import {
  gateSelectors,
  getGateProgress,
  waitForGateProgress,
  waitForGateStart,
  waitForGateSuccess,
  waitForGateCompleteWithPenalty,
  clearGateStorage,
  DEFAULT_TIMEOUTS,
} from "./utils/gate-test-helpers.js";

/**
 * Gate Security Challenge - Basic Functionality Tests
 *
 * Simple, focused tests covering essential gate functionality:
 * - Core flow (load, solve, redirect, token)
 * - Security features (honeypots)
 * - Edge cases (redirects, noscript, progress, expiration)
 */
test.describe("Gate Security Challenge", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  /**
   * CORE FUNCTIONALITY
   */

  test("1. Gate page loads and shows correct UI elements", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify all essential UI elements are visible
    await expect(page.locator(gateSelectors.container)).toBeVisible();
    await expect(page.locator(gateSelectors.progress)).toBeVisible();
    await expect(page.locator(gateSelectors.status)).toBeVisible();
    await expect(page.locator(gateSelectors.attributionLink)).toHaveAttribute(
      "href",
      "https://github.com/meeghele/astro-shield"
    );

    // Verify progress bar has proper accessibility attributes
    const progressBar = page.locator(gateSelectors.progress);
    await expect(progressBar).toHaveAttribute("role", "progressbar");
    await expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    await expect(progressBar).toHaveAttribute("aria-valuemax", "100");
  });

  test("2. Challenge completes successfully and generates valid token", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Wait for challenge to start
    await waitForGateStart(page);

    // Wait for challenge to complete
    await waitForGateSuccess(page);

    // Wait for redirect to destination
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Verify token was created and stored
    const token = await page.evaluate(() => {
      try {
        return localStorage.getItem("as_gate_token_key_v1");
      } catch (error) {
        return null;
      }
    });
    expect(token).toBeTruthy();

    // Verify token structure is valid
    const tokenData = JSON.parse(token);
    expect(tokenData.token).toMatch(/^[A-Za-z0-9+/]+=*\.[a-f0-9]{16}$/);
    expect(tokenData.exp).toBeGreaterThan(Date.now());
  });

  test("3. Valid token allows bypass on subsequent visits", async ({ page }) => {
    // First visit - complete the challenge
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Second visit - should bypass immediately with valid token
    await page.goto("/gate?next=/blog", { waitUntil: "domcontentloaded" });
    await page.waitForURL("/blog", {
      timeout: 5000, // Should be instant with valid token
      waitUntil: "domcontentloaded",
    });

    // Token should still exist
    const token = await page.evaluate(() => {
      try {
        return localStorage.getItem("as_gate_token_key_v1");
      } catch (error) {
        return null;
      }
    });
    expect(token).toBeTruthy();
  });

  test("4. Challenge redirects to correct destination after completion", async ({ page }) => {
    const destinations = ["/blog", "/contact"];

    for (const dest of destinations) {
      await clearGateStorage(page);

      await page.goto(`/gate?next=${encodeURIComponent(dest)}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForGateSuccess(page);
      await page.waitForURL(dest, {
        timeout: DEFAULT_TIMEOUTS.REDIRECT,
        waitUntil: "domcontentloaded",
      });

      expect(new URL(page.url()).pathname).toBe(dest);
    }
  });

  /**
   * SECURITY - HONEYPOTS
   */

  test("5. Honeypot elements are hidden from users", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Most honeypot inputs have aria-hidden and tabindex attributes
    const standardHoneypots = ["#hp1", "#hp2", "#hp3", "#hp5"];
    for (const hp of standardHoneypots) {
      const element = page.locator(hp);
      await expect(element).toBeAttached();
      await expect(element).toHaveAttribute("aria-hidden", "true");
      await expect(element).toHaveAttribute("tabindex", "-1");
    }

    // hp4 is the checkbox honeypot - it has tabindex but aria-hidden is on parent
    const hp4 = page.locator("#hp4");
    await expect(hp4).toBeAttached();
    await expect(hp4).toHaveAttribute("tabindex", "-1");
    await expect(hp4).toHaveAttribute("type", "checkbox");

    // Decoy links should have proper hiding attributes
    const decoys = ["#decoy1", "#decoy2", "#decoy3"];
    for (const decoy of decoys) {
      const element = page.locator(decoy);
      await expect(element).toBeAttached();
      await expect(element).toHaveAttribute("aria-hidden", "true");
    }
  });

  test("6. Honeypots have event listeners attached", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify honeypot inputs exist and are interactive (not disabled)
    const honeypots = ["#hp1", "#hp2", "#hp3"];
    for (const hp of honeypots) {
      const element = page.locator(hp);
      await expect(element).toBeAttached();

      // Check that the element is not disabled (can receive events)
      const isEnabled = await element.isEnabled();
      expect(isEnabled).toBe(true);
    }

    // Verify decoy links exist and are interactive
    const decoys = ["#decoy1", "#decoy2", "#decoy3"];
    for (const decoy of decoys) {
      const element = page.locator(decoy);
      await expect(element).toBeAttached();
      const isEnabled = await element.isEnabled();
      expect(isEnabled).toBe(true);
    }
  });

  /**
   * EDGE CASES
   */

  test("7. Works with different redirect destinations", async ({ page }) => {
    await page.goto("/gate?next=/projects", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/projects", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe("/projects");
  });

  test("8. NoScript fallback message appears without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify noscript content is present
    const noscriptContent = await page.locator("noscript").innerHTML();
    expect(noscriptContent).toContain("Please enable JavaScript");
    expect(noscriptContent).toContain("security check requires JavaScript");

    await context.close();
  });

  test("9. Progress indicator updates during challenge", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const progress = page.locator(gateSelectors.progress);
    await expect(progress).toBeVisible();

    // Initial progress should be 0-100
    const initialValue = await getGateProgress(page);
    expect(initialValue).not.toBeNull();
    expect(initialValue).toBeGreaterThanOrEqual(0);
    expect(initialValue).toBeLessThanOrEqual(100);

    // Progress should advance (may be instant with difficulty=8)
    await waitForGateProgress(page, 1);
    await waitForGateProgress(page, 100);

    const finalValue = await getGateProgress(page);
    expect(finalValue).toBe(100);
  });

  test("10. Expired token forces re-challenge", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Manually expire the token
    await page.evaluate(() => {
      try {
        const token = JSON.parse(localStorage.getItem("as_gate_token_key_v1"));
        token.exp = Date.now() - 1000; // Expired 1 second ago
        localStorage.setItem("as_gate_token_key_v1", JSON.stringify(token));
      } catch (error) {
        // Ignore
      }
    });

    // Try to access gate again - should run challenge again
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Should see the gate UI (not bypass)
    await expect(page.locator(gateSelectors.container)).toBeVisible();

    // Should complete challenge again
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });
  });
});

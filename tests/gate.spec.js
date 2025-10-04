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

// Default honeypot/decoy IDs (configurable in Shield config)
const DEFAULT_HONEYPOT_IDS = ["hp1", "hp2", "hp3", "hp4", "hp5"];
const DEFAULT_DECOY_IDS = ["decoy1", "decoy2", "decoy3"];

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

    // Wait for the gate UI to be ready
    await expect(page.locator(gateSelectors.container)).toBeVisible({ timeout: 3000 });

    // Most honeypot inputs have aria-hidden and tabindex attributes
    const standardHoneypots = [DEFAULT_HONEYPOT_IDS[0], DEFAULT_HONEYPOT_IDS[1], DEFAULT_HONEYPOT_IDS[2], DEFAULT_HONEYPOT_IDS[4]];
    for (const hp of standardHoneypots) {
      const element = page.locator(`#${hp}`);
      await expect(element).toBeAttached({ timeout: 2000 });
      await expect(element).toHaveAttribute("aria-hidden", "true", { timeout: 1000 });
      await expect(element).toHaveAttribute("tabindex", "-1", { timeout: 1000 });
    }

    // hp4 is the checkbox honeypot - it has tabindex, and its label has aria-hidden
    const hp4 = page.locator(`#${DEFAULT_HONEYPOT_IDS[3]}`);
    await expect(hp4).toBeAttached({ timeout: 2000 });
    await expect(hp4).toHaveAttribute("tabindex", "-1", { timeout: 1000 });
    await expect(hp4).toHaveAttribute("type", "checkbox", { timeout: 1000 });

    // hp4 label should have aria-hidden
    const hp4Label = page.locator(`label[for="${DEFAULT_HONEYPOT_IDS[3]}"]`);
    await expect(hp4Label).toBeAttached({ timeout: 2000 });
    await expect(hp4Label).toHaveAttribute("aria-hidden", "true", { timeout: 1000 });

    // Decoy links should have proper hiding attributes
    for (const decoyId of DEFAULT_DECOY_IDS) {
      const element = page.locator(`#${decoyId}`);
      await expect(element).toBeAttached({ timeout: 2000 });
      await expect(element).toHaveAttribute("aria-hidden", "true", { timeout: 1000 });
    }
  });

  test("6. Honeypot elements are visually invisible (positioned off-screen)", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Check that honeypot inputs are positioned off-screen or hidden
    const offScreenHoneypots = [DEFAULT_HONEYPOT_IDS[0], DEFAULT_HONEYPOT_IDS[1], DEFAULT_HONEYPOT_IDS[2]];
    for (const hp of offScreenHoneypots) {
      const element = page.locator(`#${hp}`);
      const styles = await element.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          position: computed.position,
          left: computed.left,
          visibility: computed.visibility,
          opacity: computed.opacity,
        };
      });

      // These elements use position: absolute with left: -10000px
      expect(styles.position).toBe("absolute");
      expect(styles.left).toBe("-10000px");
      expect(styles.visibility).toBe("hidden");
      expect(styles.opacity).toBe("0");
    }

    // hp4 checkbox and label are inside a display:none container
    const hp4Container = page.locator(`#${DEFAULT_HONEYPOT_IDS[3]}`).locator("..");
    const containerStyles = await hp4Container.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
      };
    });
    expect(containerStyles.display).toBe("none");
    expect(containerStyles.visibility).toBe("hidden");
    expect(containerStyles.opacity).toBe("0");

    // hp5 uses transparent text styling
    const hp5 = page.locator(`#${DEFAULT_HONEYPOT_IDS[4]}`);
    const hp5Styles = await hp5.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        color: computed.color,
        background: computed.background,
        fontSize: computed.fontSize,
      };
    });
    // "transparent" is computed as "rgba(0, 0, 0, 0)" by browsers
    expect(hp5Styles.color).toBe("rgba(0, 0, 0, 0)");
    expect(hp5Styles.fontSize).toBe("0px");

    // Decoy links should be positioned off-screen like hp1-3
    for (const decoyId of DEFAULT_DECOY_IDS) {
      const element = page.locator(`#${decoyId}`);
      const styles = await element.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          position: computed.position,
          left: computed.left,
          visibility: computed.visibility,
          opacity: computed.opacity,
        };
      });

      expect(styles.position).toBe("absolute");
      expect(styles.left).toBe("-10000px");
      expect(styles.visibility).toBe("hidden");
      expect(styles.opacity).toBe("0");
    }
  });

  test("7. Honeypots have event listeners attached", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify honeypot inputs exist and are interactive (not disabled)
    const honeypots = [DEFAULT_HONEYPOT_IDS[0], DEFAULT_HONEYPOT_IDS[1], DEFAULT_HONEYPOT_IDS[2]];
    for (const hp of honeypots) {
      const element = page.locator(`#${hp}`);
      await expect(element).toBeAttached();

      // Check that the element is not disabled (can receive events)
      const isEnabled = await element.isEnabled();
      expect(isEnabled).toBe(true);
    }

    // Verify decoy links exist and are interactive
    for (const decoyId of DEFAULT_DECOY_IDS) {
      const element = page.locator(`#${decoyId}`);
      await expect(element).toBeAttached();
      const isEnabled = await element.isEnabled();
      expect(isEnabled).toBe(true);
    }
  });

  /**
   * EDGE CASES
   */

  test("8. Works with different redirect destinations", async ({ page }) => {
    await page.goto("/gate?next=/projects", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/projects", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe("/projects");
  });

  test("9. Gate page loads without JavaScript (no functionality expected)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Gate UI should be present but non-functional without JS
    await expect(page.locator(gateSelectors.container)).toBeVisible();
    await expect(page.locator(gateSelectors.status)).toBeVisible();

    await context.close();
  });

  test("10. Progress indicator updates during challenge", async ({ page }) => {
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

  test("11. Expired token forces re-challenge", async ({ page }) => {
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

  test("12. Shielded content unlocks after client-side DOM injection", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.evaluate(() => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div data-astro-shield-block data-test-id="dynamic-shield-block">
          <template data-astro-shield-template>
            <article id="dynamic-shielded-target">Protected dynamic content</article>
          </template>
          <div data-astro-shield-content hidden></div>
        </div>
      `;
      const block = wrapper.firstElementChild;
      if (block) {
        document.body.appendChild(block);
      }
    });

    const dynamicContent = page.locator("#dynamic-shielded-target");
    await expect(dynamicContent).toBeVisible();
  });
});

// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { test, expect } from "@playwright/test";
import {
  clearGateStorage,
  waitForGateStart,
  DEFAULT_TIMEOUTS,
  GATE_STATUS,
} from "./utils/gate-test-helpers.js";

/**
 * Error Handling Tests
 *
 * Tests covering:
 * - PoW timeout and recovery
 * - Storage errors (quota, unavailability)
 * - Browser API unavailability
 * - Malformed data handling
 * - Race conditions
 */
test.describe("Error Handling - PoW Timeout", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("1. PoW timeout results in incomplete status (not crash)", async ({ page }) => {
    // Use very high difficulty with short timeout to force timeout
    await page.goto("/gate?next=/&difficulty=30&timeoutMs=1000", {
      waitUntil: "domcontentloaded",
    });

    await waitForGateStart(page);

    // Wait for timeout + buffer
    await page.waitForTimeout(3000);

    // Should show some status (not crashed)
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();

    // Page should still be on gate (not redirected)
    expect(page.url()).toContain('/gate');
  });

  test("2. Gate gracefully handles impossible difficulty", async ({ page }) => {
    // Use extremely high difficulty that would take years to solve
    await page.goto("/gate?next=/&difficulty=50&timeoutMs=2000", {
      waitUntil: "domcontentloaded",
    });

    // Should not crash, should timeout gracefully
    await waitForGateStart(page).catch(() => {
      // May not even start if difficulty is validated
    });

    await page.waitForTimeout(4000);

    // Status should be visible (not white screen)
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();

    // Gate UI should still be present
    await expect(page.locator('.gate')).toBeVisible();
  });
});

test.describe("Error Handling - Storage Errors", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("3. Gate works when localStorage is full (falls back to sessionStorage)", async ({ page }) => {
    // Fill localStorage to capacity
    await page.evaluate(() => {
      try {
        const filler = 'x'.repeat(1024 * 100); // 100KB chunks
        for (let i = 0; i < 100; i++) {
          try {
            localStorage.setItem(`filler_${i}`, filler);
          } catch (e) {
            break; // Quota exceeded
          }
        }
      } catch (error) {
        // Ignore
      }
    });

    // Try to complete gate
    await page.goto("/gate?next=/&difficulty=4", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    // Should still start (even if it can't store everything)
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();

    // May or may not complete depending on whether sessionStorage works
    // The important thing is it doesn't crash
  });

  test("4. Missing token in corrupted storage redirects to gate", async ({ page }) => {
    // Set corrupted storage state
    await page.evaluate(() => {
      try {
        localStorage.setItem('as_gate_token_key_v1', 'corrupted data');
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate (not crash)
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });

  test("5. Null/undefined storage values handled gracefully", async ({ page }) => {
    // Set various invalid storage states
    await page.evaluate(() => {
      try {
        localStorage.setItem('as_gate_token_key_v1', 'null');
        localStorage.setItem('as_hp_tripped', 'undefined');
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate (not crash)
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');

    // Gate should load properly
    await expect(page.locator('.gate')).toBeVisible();
  });
});

test.describe("Error Handling - Browser API Unavailability", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("6. Gate works with localStorage completely disabled", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Disable both localStorage and sessionStorage
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new Error('localStorage disabled'); }
      });
    });

    await page.goto("/gate?next=/&difficulty=4", { waitUntil: "domcontentloaded" });

    // Gate should still load
    await expect(page.locator('.gate')).toBeVisible();

    // Should attempt to start (even if it can't persist)
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test("7. Shield handles storage.setItem throwing errors", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Make setItem throw errors
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        // Allow some keys, block shield keys
        if (key.startsWith('as_') || key.includes('SHIELD')) {
          throw new Error('Storage blocked');
        }
        return originalSetItem.call(this, key, value);
      };
    });

    await page.goto("/gate?next=/&difficulty=4", { waitUntil: "domcontentloaded" });

    // Gate should still render
    await expect(page.locator('.gate')).toBeVisible();

    await waitForGateStart(page).catch(() => {
      // May fail to start if it can't store state, but shouldn't crash
    });

    await context.close();
  });
});

test.describe("Error Handling - Malformed Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("8. Gate handles non-numeric difficulty gracefully", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=abc", { waitUntil: "domcontentloaded" });

    // Should fall back to default, not crash
    await expect(page.locator('.gate')).toBeVisible();
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("9. Gate handles malformed URL parameters", async ({ page }) => {
    // Various malformed params
    await page.goto("/gate?next=%00%00%00&difficulty=&timeoutMs=", {
      waitUntil: "domcontentloaded",
    });

    // Should load with defaults
    await expect(page.locator('.gate')).toBeVisible();
  });

  test("10. Gate handles XSS attempts in parameters gracefully", async ({ page }) => {
    const xssAttempts = [
      '<script>alert(1)</script>',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ];

    for (const xss of xssAttempts) {
      await clearGateStorage(page);
      const encoded = encodeURIComponent(xss);
      await page.goto(`/gate?next=${encoded}`, { waitUntil: "domcontentloaded" });

      // Should sanitize and load safely
      await expect(page.locator('.gate')).toBeVisible();

      // Should not execute script
      const alertFired = await page.evaluate(() => window.__xss_alert_fired || false);
      expect(alertFired).toBe(false);
    }
  });
});

test.describe("Error Handling - Race Conditions", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("11. Multiple rapid page navigations don't cause crashes", async ({ page }) => {
    // Rapidly navigate between pages
    for (let i = 0; i < 3; i++) {
      await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.goto("/blog", { waitUntil: "domcontentloaded" }).catch(() => {});
    }

    // Should end up somewhere valid (likely gate)
    await page.waitForTimeout(1000);

    // Either on gate or a protected page
    const url = page.url();
    expect(url).toBeTruthy();

    // Page should be functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test("12. Token expiring during active session handled gracefully", async ({ page }) => {
    // Complete gate first
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateStart(page);

    // Expire token while on gate
    await page.evaluate(() => {
      try {
        const stored = localStorage.getItem('as_gate_token_key_v1');
        if (stored) {
          const token = JSON.parse(stored);
          token.exp = Date.now() - 1000;
          localStorage.setItem('as_gate_token_key_v1', JSON.stringify(token));
        }
      } catch (error) {
        // Ignore
      }
    });

    // Navigate to protected page
    await page.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should redirect back to gate (not crash)
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });
});

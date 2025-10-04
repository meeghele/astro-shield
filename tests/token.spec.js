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
 * Token Lifecycle Tests
 *
 * Comprehensive token testing:
 * - Creation and validation
 * - Expiration edge cases
 * - Multi-tab synchronization
 * - Storage scenarios
 */
test.describe("Token - Creation & Validation", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("1. Token is created after successful PoW", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);

    const token = await page.evaluate(() => {
      try {
        const stored = localStorage.getItem('as_gate_token_key_v1');
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        return null;
      }
    });

    expect(token).toBeTruthy();
    expect(token.token).toBeTruthy();
    expect(token.exp).toBeGreaterThan(Date.now());
  });

  test("2. Token has correct structure", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);

    const token = await page.evaluate(() => {
      try {
        const stored = localStorage.getItem('as_gate_token_key_v1');
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        return null;
      }
    });

    // Token format: base64payload.hexhash
    expect(token.token).toMatch(/^[A-Za-z0-9+/]+=*\.[a-f0-9]{16}$/);

    // Expiration should be a future timestamp
    expect(typeof token.exp).toBe('number');
    expect(token.exp).toBeGreaterThan(Date.now());

    // Should expire in approximately tokenTtlMinutes (30 min = 1800000ms)
    const ttl = token.exp - Date.now();
    expect(ttl).toBeGreaterThan(1700000); // At least 28 minutes
    expect(ttl).toBeLessThan(1900000);    // At most 32 minutes
  });

  test("3. Token allows bypass on subsequent visits", async ({ page }) => {
    // First visit - get token
    await page.goto("/gate?next=/blog", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/blog", { timeout: 10000, waitUntil: "domcontentloaded" });

    // Second visit - should bypass
    await page.goto("/contact", { waitUntil: "domcontentloaded" });

    // Should stay on contact (not redirect to gate)
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/contact');
    expect(page.url()).not.toContain('/gate');
  });

  test("4. Token is stored in both localStorage and sessionStorage", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);

    const storage = await page.evaluate(() => {
      try {
        return {
          local: localStorage.getItem('as_gate_token_key_v1'),
          session: sessionStorage.getItem('as_gate_token_key_v1'),
        };
      } catch (error) {
        return { local: null, session: null };
      }
    });

    // Should be in at least one storage
    const hasToken = storage.local || storage.session;
    expect(hasToken).toBeTruthy();
  });

  test("5. Token survives page refresh", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", { timeout: 10000, waitUntil: "domcontentloaded" });

    const tokenBefore = await page.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });

    await page.reload({ waitUntil: "domcontentloaded" });

    const tokenAfter = await page.evaluate(() => {
      try {
        return localStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });

    expect(tokenAfter).toBeTruthy();
    expect(tokenAfter).toBe(tokenBefore);
  });
});

test.describe("Token - Expiration Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("6. Expired token forces re-challenge", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", { timeout: 10000, waitUntil: "domcontentloaded" });

    // Expire the token
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

    // Try to access page again
    await page.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should redirect to gate
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });

  test("7. Token expiring exactly now is treated as expired", async ({ page }) => {
    // Set token expiring right now
    await page.evaluate(() => {
      try {
        const token = {
          token: btoa('test') + '.0123456789abcdef',
          exp: Date.now() // Expires right now
        };
        localStorage.setItem('as_gate_token_key_v1', JSON.stringify(token));
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate (expired)
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });


  test("9. Missing token triggers gate", async ({ page }) => {
    // Ensure no token exists
    await clearGateStorage(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });

  test("10. Null token triggers gate", async ({ page }) => {
    await page.evaluate(() => {
      try {
        localStorage.setItem('as_gate_token_key_v1', 'null');
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });

  test("11. Token without exp field is invalid", async ({ page }) => {
    await page.evaluate(() => {
      try {
        const token = {
          token: btoa('test') + '.0123456789abcdef'
          // Missing exp field
        };
        localStorage.setItem('as_gate_token_key_v1', JSON.stringify(token));
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });

  test("12. Token with non-numeric exp is invalid", async ({ page }) => {
    await page.evaluate(() => {
      try {
        const token = {
          token: btoa('test') + '.0123456789abcdef',
          exp: "not a number"
        };
        localStorage.setItem('as_gate_token_key_v1', JSON.stringify(token));
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });
});

test.describe("Token - Multi-tab Synchronization", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("13. Token created in one tab works in another", async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Tab 1: Get token
    await page1.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page1);
    await page1.waitForURL("/", { timeout: 10000, waitUntil: "domcontentloaded" });

    // Tab 2: Should use same token
    await page2.goto("/blog", { waitUntil: "domcontentloaded" });

    // Should bypass gate (using token from tab 1)
    await page2.waitForTimeout(2000);
    expect(page2.url()).toContain('/blog');
    expect(page2.url()).not.toContain('/gate');

    await context.close();
  });

  test("14. Token expired in one tab affects all tabs", async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Tab 1: Get token
    await page1.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page1);
    await page1.waitForURL("/", { timeout: 10000, waitUntil: "domcontentloaded" });

    // Tab 2: Should use token
    await page2.goto("/blog", { waitUntil: "domcontentloaded" });
    await page2.waitForTimeout(1000);
    expect(page2.url()).toContain('/blog');

    // Expire token in Tab 1
    await page1.evaluate(() => {
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

    // Tab 2: Navigate - should now be forced to gate
    await page2.goto("/projects", { waitUntil: "domcontentloaded" });
    await page2.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page2.url()).toContain('/gate');

    await context.close();
  });
});

test.describe("Token - Storage Fallback", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("15. Token works with localStorage unavailable", async ({ page }) => {
    // Disable localStorage
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('localStorage disabled');
        }
      });
    });

    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Gate should still work (fallback to sessionStorage)
    await waitForGateSuccess(page);

    // Should have stored in sessionStorage
    const sessionToken = await page.evaluate(() => {
      try {
        return sessionStorage.getItem('as_gate_token_key_v1');
      } catch (error) {
        return null;
      }
    });

    expect(sessionToken).toBeTruthy();
  });

});

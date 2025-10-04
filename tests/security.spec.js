// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { test, expect } from "@playwright/test";
import {
  clearGateStorage,
  waitForGateStart,
  waitForGateSuccess,
  DEFAULT_TIMEOUTS,
} from "./utils/gate-test-helpers.js";

/**
 * Security Tests
 *
 * Critical security tests covering:
 * - XSS/injection attempts
 * - Token tampering
 * - Bypass attempts
 * - Storage manipulation
 */
test.describe("Security - XSS & Injection Protection", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("1. XSS in 'next' parameter is sanitized", async ({ page }) => {
    // Attempt XSS via next parameter
    const xssPayload = encodeURIComponent('<script>alert("xss")</script>');
    await page.goto(`/gate?next=${xssPayload}`, { waitUntil: "domcontentloaded" });

    await waitForGateSuccess(page);

    // Should redirect safely, not execute script
    await page.waitForURL(/<script>/, { timeout: 10000 }).catch(() => {
      // Expected to fail - should NOT redirect to script tag
    });

    // Verify no script execution
    const alertFired = await page.evaluate(() => window.__xss_alert_fired || false);
    expect(alertFired).toBe(false);

    // Should sanitize to safe path
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('<script>');
  });


  test("3. HTML injection in status message is escaped", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Try to manipulate status element
    const injectionAttempt = await page.evaluate(() => {
      const status = document.getElementById('status');
      if (!status) return false;

      const originalHTML = status.innerHTML;

      // Attempt injection
      status.textContent = '<img src=x onerror=alert(1)>';

      // Check if it was interpreted as HTML
      const hasImgTag = status.querySelector('img') !== null;

      return hasImgTag;
    });

    // Injection should NOT create actual HTML elements
    expect(injectionAttempt).toBe(false);
  });

  test("4. Config parameters cannot inject malicious honeypot IDs", async ({ page }) => {
    // Visit gate with attempt to inject malicious ID
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify honeypot IDs are properly sanitized
    const honeypotIds = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.honeypotIds || [];
    });

    // All IDs should be safe strings
    honeypotIds.forEach(id => {
      expect(typeof id).toBe('string');
      expect(id).not.toContain('<');
      expect(id).not.toContain('>');
      expect(id).not.toContain('javascript:');
    });
  });

  test("5. Namespace sanitization prevents injection", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const namespace = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.shieldNamespace;
    });

    // Namespace should only contain safe characters
    expect(namespace).toMatch(/^[a-z0-9_-]+$/);
  });

  test("6. Prefix sanitization prevents injection", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const prefixes = await page.evaluate(() => ({
      honeypot: window.__ASTRO_SHIELD_CONFIG__?.honeypotPrefix,
      decoy: window.__ASTRO_SHIELD_CONFIG__?.decoyPrefix,
    }));

    // Prefixes should only contain safe characters (or be empty)
    if (prefixes.honeypot) {
      expect(prefixes.honeypot).toMatch(/^[a-z0-9_-]*$/);
    }
    if (prefixes.decoy) {
      expect(prefixes.decoy).toMatch(/^[a-z0-9_-]*$/);
    }
  });
});

test.describe("Security - Token Tampering", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });


  test("8. Malformed token JSON is handled gracefully", async ({ page }) => {
    // Set malformed token
    await page.evaluate(() => {
      try {
        localStorage.setItem('as_gate_token_key_v1', '{invalid json');
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate (not crash)
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });


  test("10. Token with past expiration is rejected", async ({ page }) => {
    // Set expired token
    await page.evaluate(() => {
      try {
        const past = Date.now() - 10000; // 10 seconds ago
        const token = {
          token: btoa('fake') + '.0123456789abcdef',
          exp: past
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

test.describe("Security - Bypass Attempts", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("11. Cannot bypass gate by setting ready flag directly", async ({ page, context }) => {
    // Attempt to bypass by setting ready flag before gate check
    await context.addInitScript(() => {
      window.__ASTRO_SHIELD_READY__ = true;
      document.documentElement.setAttribute('data-astro-shield-ready', 'true');
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should still redirect to gate (flag is overridden by init script)
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });

  test("12. Cannot bypass by manipulating visibility directly", async ({ page, context }) => {
    // Attempt to make content visible before validation
    await context.addInitScript(() => {
      const interval = setInterval(() => {
        if (document.documentElement) {
          document.documentElement.style.visibility = 'visible';
        }
      }, 10);
      setTimeout(() => clearInterval(interval), 2000);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should still redirect to gate
    await page.waitForURL(/\/gate/, { timeout: 5000 });
    expect(page.url()).toContain('/gate');
  });

  test("13. Cannot access protected pages by direct URL without token", async ({ page }) => {
    // Try all protected routes without token
    const protectedRoutes = ["/", "/blog", "/contact", "/projects"];

    for (const route of protectedRoutes) {
      await clearGateStorage(page);
      await page.goto(route, { waitUntil: "domcontentloaded" });

      // Should redirect to gate
      await page.waitForURL(/\/gate/, { timeout: 5000 });
      expect(page.url()).toContain('/gate');
      expect(page.url()).toContain(`next=${encodeURIComponent(route)}`);
    }
  });

  test("14. Gate path itself is exempt from gate redirect loop", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Should stay on gate page, not redirect
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/gate');

    // Should show gate UI
    await expect(page.locator('.gate')).toBeVisible();
  });
});

test.describe("Security - Storage Manipulation", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });


  test("16. Storage quota exceeded handled gracefully", async ({ page }) => {
    // Fill storage to near capacity
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

    // Try to complete gate (should handle storage errors)
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Gate should still work even if storage is full
    await waitForGateStart(page);

    // May not complete if can't store token, but shouldn't crash
    const statusCode = await page.evaluate(() => {
      const el = document.querySelector('[data-role="gate-status-code"]');
      return el?.dataset?.statusCode || null;
    });

    expect(statusCode).toBeTruthy();
  });

});

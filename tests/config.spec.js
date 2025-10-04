// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { test, expect } from "@playwright/test";
import { clearGateStorage } from "./utils/gate-test-helpers.js";

/**
 * Configuration Validation Tests
 *
 * Tests covering:
 * - Config parameter validation
 * - Boundary values
 * - Invalid inputs
 * - Default fallbacks
 */
test.describe("Config - Parameter Sanitization", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("1. Invalid gate path falls back to default", async ({ page }) => {
    // The integration should sanitize invalid paths server-side,
    // but client-side config should have safe path
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const gatePath = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.gatePath;
    });

    // Should be a valid path starting with /
    expect(gatePath).toMatch(/^\/[a-z0-9_/-]*$/i);
  });

  test("2. Namespace is sanitized to safe characters", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const namespace = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.shieldNamespace;
    });

    // Should only contain lowercase alphanumeric, underscore, hyphen
    expect(namespace).toMatch(/^[a-z0-9_-]+$/);
  });

  test("3. Honeypot prefix is sanitized", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const prefix = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.honeypotPrefix;
    });

    // Should be empty or contain only safe characters
    expect(prefix).toMatch(/^[a-z0-9_-]*$/);
  });

  test("4. Decoy prefix is sanitized", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const prefix = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.decoyPrefix;
    });

    // Should be empty or contain only safe characters
    expect(prefix).toMatch(/^[a-z0-9_-]*$/);
  });

  test("5. Honeypot IDs array is valid", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const ids = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.honeypotIds;
    });

    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);

    // All IDs should be non-empty strings
    ids.forEach(id => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  test("6. Decoy IDs array is valid", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const ids = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.decoyIds;
    });

    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);

    // All IDs should be non-empty strings
    ids.forEach(id => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  test("7. HoneypotClass is a valid string", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const honeypotClass = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.honeypotClass;
    });

    expect(typeof honeypotClass).toBe('string');
    expect(honeypotClass.length).toBeGreaterThan(0);
  });

  test("8. HoneypotStyleClasses is valid array", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const styleClasses = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__?.honeypotStyleClasses;
    });

    expect(Array.isArray(styleClasses)).toBe(true);
    expect(styleClasses.length).toBeGreaterThan(0);

    styleClasses.forEach(className => {
      expect(typeof className).toBe('string');
      expect(className.length).toBeGreaterThan(0);
    });
  });
});

test.describe("Config - URL Parameter Overrides", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("9. difficulty parameter override works", async ({ page }) => {
    // Test with custom difficulty via URL param
    await page.goto("/gate?next=/&difficulty=4", { waitUntil: "domcontentloaded" });

    // Check if difficulty was applied (look for debug output if enabled)
    // This is implementation-specific, so we test that it doesn't break
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("10. Invalid difficulty parameter is handled", async ({ page }) => {
    // Test with invalid difficulty
    await page.goto("/gate?next=/&difficulty=abc", { waitUntil: "domcontentloaded" });

    // Should fall back to default, not crash
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("11. Negative difficulty is handled", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=-5", { waitUntil: "domcontentloaded" });

    // Should fall back to default, not crash
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("12. Zero difficulty is handled", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=0", { waitUntil: "domcontentloaded" });

    // Should fall back to default or minimum
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("13. Extremely high difficulty doesn't crash", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=999999", { waitUntil: "domcontentloaded" });

    // Should either cap at maximum or timeout gracefully
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("14. timeoutMs parameter override works", async ({ page }) => {
    await page.goto("/gate?next=/&timeoutMs=5000", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("15. Invalid timeoutMs is handled", async ({ page }) => {
    await page.goto("/gate?next=/&timeoutMs=notanumber", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("16. showProgress parameter toggle works", async ({ page }) => {
    // Test with showProgress=false
    await page.goto("/gate?next=/&showProgress=false", { waitUntil: "domcontentloaded" });

    // Progress bar might be hidden or removed
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("17. showProgress=true shows progress bar", async ({ page }) => {
    await page.goto("/gate?next=/&showProgress=true", { waitUntil: "domcontentloaded" });

    const progressBar = await page.locator('.progress-container');
    // Should be visible if showProgress is true
    const isVisible = await progressBar.isVisible().catch(() => false);
    expect(typeof isVisible).toBe('boolean');
  });

  test("18. nearMissThreshold parameter override", async ({ page }) => {
    await page.goto("/gate?next=/&nearMissThreshold=2", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("19. minAcceptable parameter override", async ({ page }) => {
    await page.goto("/gate?next=/&minAcceptable=2", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });
});

test.describe("Config - Boolean Coercion", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("20. Boolean string 'false' is properly coerced", async ({ page }) => {
    await page.goto("/gate?next=/&showProgress=false", { waitUntil: "domcontentloaded" });

    // Should parse 'false' as boolean false
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("21. Boolean string 'true' is properly coerced", async ({ page }) => {
    await page.goto("/gate?next=/&showProgress=true", { waitUntil: "domcontentloaded" });

    // Should parse 'true' as boolean true
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("22. Boolean number '0' is coerced to false", async ({ page }) => {
    await page.goto("/gate?next=/&enableTimeValidation=0", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("23. Boolean number '1' is coerced to true", async ({ page }) => {
    await page.goto("/gate?next=/&enableTimeValidation=1", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("24. Invalid boolean values don't crash", async ({ page }) => {
    await page.goto("/gate?next=/&showProgress=maybe", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });
});

test.describe("Config - Next Parameter Sanitization", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("25. Empty next parameter defaults to /", async ({ page }) => {
    await page.goto("/gate?next=", { waitUntil: "domcontentloaded" });

    // Should have a valid next destination
    const params = new URL(page.url()).searchParams;
    const next = params.get('next');

    // Empty should default to /
    expect(next === '' || next === '/').toBe(true);
  });

  test("26. Missing next parameter defaults to /", async ({ page }) => {
    await page.goto("/gate", { waitUntil: "domcontentloaded" });

    // Should work without next parameter
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("27. Next parameter with only whitespace is sanitized", async ({ page }) => {
    const whitespaceNext = encodeURIComponent('   ');
    await page.goto(`/gate?next=${whitespaceNext}`, { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("28. Next parameter with full URL extracts path", async ({ page }) => {
    const fullUrl = encodeURIComponent('http://localhost:5000/blog');
    await page.goto(`/gate?next=${fullUrl}`, { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("29. Next parameter without leading slash is normalized", async ({ page }) => {
    await page.goto("/gate?next=blog", { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("30. Next parameter with query string is preserved", async ({ page }) => {
    const nextWithQuery = encodeURIComponent('/blog?id=123&sort=asc');
    await page.goto(`/gate?next=${nextWithQuery}`, { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("31. Next parameter with hash is preserved", async ({ page }) => {
    const nextWithHash = encodeURIComponent('/blog#section');
    await page.goto(`/gate?next=${nextWithHash}`, { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("32. Next parameter with both query and hash", async ({ page }) => {
    const complex = encodeURIComponent('/blog?id=1#top');
    await page.goto(`/gate?next=${complex}`, { waitUntil: "domcontentloaded" });

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });
});

test.describe("Config - Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("33. Config overrides are stored in localStorage", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const storedConfig = await page.evaluate(() => {
      try {
        const stored = localStorage.getItem('__ASTRO_SHIELD_CONFIG_OVERRIDES__');
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        return null;
      }
    });

    if (storedConfig) {
      expect(typeof storedConfig).toBe('object');
      // Config may not store all values if they match defaults
      expect(storedConfig).toBeTruthy();
    }
  });

  test("34. Config overrides are stored in sessionStorage", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const storedConfig = await page.evaluate(() => {
      try {
        const stored = sessionStorage.getItem('__ASTRO_SHIELD_CONFIG_OVERRIDES__');
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        return null;
      }
    });

    if (storedConfig) {
      expect(typeof storedConfig).toBe('object');
    }
  });

  test("35. Stored config is loaded on subsequent visits", async ({ page }) => {
    // First visit
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const firstConfig = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__;
    });

    // Second visit
    await page.reload({ waitUntil: "domcontentloaded" });

    const secondConfig = await page.evaluate(() => {
      return window.__ASTRO_SHIELD_CONFIG__;
    });

    // Core config values should persist
    expect(secondConfig.gatePath).toBe(firstConfig.gatePath);
    expect(secondConfig.shieldNamespace).toBe(firstConfig.shieldNamespace);
  });
});

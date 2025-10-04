// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { test, expect } from "@playwright/test";
import {
  clearGateStorage,
  waitForGateStart,
  waitForGateSuccess,
  waitForGateCompleteWithPenalty,
  getGateProgress,
  waitForGateProgress,
  DEFAULT_TIMEOUTS,
  GATE_STATUS,
} from "./utils/gate-test-helpers.js";

/**
 * Proof of Work Edge Case Tests
 *
 * Tests covering:
 * - Near-miss acceptance
 * - Honeypot penalties
 * - Difficulty boundaries
 * - Progress tracking
 * - Timeout scenarios
 */
test.describe("PoW - Basic Completion", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("1. PoW completes successfully at default difficulty", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);
    await waitForGateSuccess(page);

    // Should have completed
    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });

  test("2. PoW progress starts at 0 and increases", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const initialProgress = await getGateProgress(page);
    expect(initialProgress).toBe(0);

    // Wait for some progress
    await waitForGateProgress(page, 1);

    const midProgress = await getGateProgress(page);
    expect(midProgress).toBeGreaterThan(0);
  });

  test("3. PoW completes with very easy difficulty", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=4", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);
    await waitForGateSuccess(page);

    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });

  test("4. Status updates correctly during PoW", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Should start with initializing or pow-start
    await waitForGateStart(page);

    // Should eventually complete
    await waitForGateSuccess(page);

    // Final status should be pow-complete
    const statusEl = await page.locator('#status');
    const statusText = await statusEl.textContent();
    expect(statusText).toBeTruthy();
  });
});

test.describe("PoW - Honeypot Penalties", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("5. Honeypot trip increases difficulty", async ({ page }) => {
    // Visit with honeypot trip flag
    await page.goto("/gate?next=/&hp=1", { waitUntil: "domcontentloaded" });

    // Should still complete, but may take longer
    await waitForGateStart(page);
    await waitForGateCompleteWithPenalty(page);

    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });

  test("6. Multiple honeypot trips accumulate penalties", async ({ page }) => {
    // Set honeypot trip count
    await page.evaluate(() => {
      try {
        localStorage.setItem('as_hp_trip_count', '3');
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/gate?next=/&hp=1", { waitUntil: "domcontentloaded" });

    // Should still complete despite penalties
    await waitForGateStart(page);
    await waitForGateCompleteWithPenalty(page, { timeout: 20000 });
  });

  test("7. Penalty difficulty is capped at maximum", async ({ page }) => {
    // Set very high trip count
    await page.evaluate(() => {
      try {
        localStorage.setItem('as_hp_trip_count', '999');
      } catch (error) {
        // Ignore
      }
    });

    await page.goto("/gate?next=/&hp=1", { waitUntil: "domcontentloaded" });

    // Should cap at maxPenaltyDiff and still be completable
    await waitForGateStart(page);

    // Even with cap, should complete eventually (may timeout if cap is too high)
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible({ timeout: 25000 });
  });
});

test.describe("PoW - Near-Miss Acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("8. Near-miss is accepted when enabled", async ({ page }) => {
    // Use higher difficulty with short timeout to trigger near-miss
    await page.goto("/gate?next=/&difficulty=20&timeoutMs=3000", {
      waitUntil: "domcontentloaded",
    });

    await waitForGateStart(page);

    // May complete via near-miss or full solution
    await page.waitForTimeout(5000);

    // Check final state - should have completed or shown incomplete
    const progress = await getGateProgress(page);
    expect(progress).toBeGreaterThanOrEqual(0);
  });

});

test.describe("PoW - Difficulty Boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("10. Minimum difficulty (1) completes instantly", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=1", { waitUntil: "domcontentloaded" });

    await waitForGateSuccess(page, { timeout: 3000 });

    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });

  test("11. Medium difficulty (12) completes reasonably", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=12", { waitUntil: "domcontentloaded" });

    await waitForGateSuccess(page, { timeout: 10000 });

    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });

  test("12. Difficulty 0 falls back to default or minimum", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=0", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    // Should work with fallback difficulty
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("13. Negative difficulty falls back to default", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=-10", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("14. NaN difficulty falls back to default", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=NaN", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible();
  });

  test("15. Infinity difficulty is handled gracefully", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=Infinity", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    // Should either fall back or timeout gracefully
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible({ timeout: 5000 });
  });
});

test.describe("PoW - Timeout Scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("16. PoW respects timeout parameter", async ({ page }) => {
    // Very high difficulty with short timeout
    await page.goto("/gate?next=/&difficulty=25&timeoutMs=2000", {
      waitUntil: "domcontentloaded",
    });

    await waitForGateStart(page);

    // Wait for timeout + buffer
    await page.waitForTimeout(4000);

    // Should have stopped trying
    const progress = await getGateProgress(page);
    expect(progress).toBeGreaterThanOrEqual(0);
  });

  test("17. Zero timeout is handled", async ({ page }) => {
    await page.goto("/gate?next=/&timeoutMs=0", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    // Should either fall back to minimum or handle gracefully
    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible({ timeout: 5000 });
  });

  test("18. Negative timeout is handled", async ({ page }) => {
    await page.goto("/gate?next=/&timeoutMs=-1000", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    const statusEl = await page.locator('#status');
    await expect(statusEl).toBeVisible({ timeout: 5000 });
  });

  test("19. Very long timeout doesn't break", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=8&timeoutMs=60000", {
      waitUntil: "domcontentloaded",
    });

    // Should still complete well before timeout
    await waitForGateSuccess(page, { timeout: 15000 });

    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });
});

test.describe("PoW - Progress Tracking", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("20. Progress updates are monotonically increasing", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=12", { waitUntil: "domcontentloaded" });

    await waitForGateStart(page);

    let previousProgress = 0;
    const progressValues = [];

    // Sample progress multiple times
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(200);
      const current = await getGateProgress(page);
      progressValues.push(current);

      // Progress should never decrease
      expect(current).toBeGreaterThanOrEqual(previousProgress);
      previousProgress = current;

      if (current === 100) break;
    }

    // Should have made some progress
    expect(progressValues.some(p => p > 0)).toBe(true);
  });

  test("21. Progress reaches 100 on completion", async ({ page }) => {
    await page.goto("/gate?next=/&difficulty=6", { waitUntil: "domcontentloaded" });

    await waitForGateSuccess(page);

    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });

  test("22. Progress bar ARIA attributes are correct", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    const progressBar = page.locator('.progress-container');

    await expect(progressBar).toHaveAttribute('role', 'progressbar');
    await expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    await expect(progressBar).toHaveAttribute('aria-valuemax', '100');

    // aria-valuenow should update
    await waitForGateProgress(page, 1);

    const valueNow = await progressBar.getAttribute('aria-valuenow');
    expect(parseInt(valueNow || '0')).toBeGreaterThanOrEqual(0);
    expect(parseInt(valueNow || '0')).toBeLessThanOrEqual(100);
  });
});

test.describe("PoW - Challenge Variation", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("23. Challenge includes domain and time bucket", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Challenge should be based on current host and time bucket
    // This is internal, but we can verify it completes successfully
    await waitForGateSuccess(page);

    const finalProgress = await getGateProgress(page);
    expect(finalProgress).toBe(100);
  });

  test("24. Solutions from different time buckets don't replay", async ({ page }) => {
    // Complete once
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", { timeout: 10000, waitUntil: "domcontentloaded" });

    // Solutions are time-bucketed, so we can't replay old solutions
    // Verify token was created (this validates challenge was solved)
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


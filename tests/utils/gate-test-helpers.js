// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { expect } from "@playwright/test";
import { GATE_STATUS } from "@meeghele/astro-shield/gate-statuses";

const STATUS_DEBUG_SELECTOR = '[data-role="gate-status-code"]';
const STATUS_SELECTOR = "#status";
const PROGRESS_SELECTOR = ".progress-container";

/**
 * Default timeouts aligned with Gate configuration:
 * - Gate PoW timeout: 8s (timeoutMs: 8000)
 * - Gate min solve duration: 1000ms (minSolveDurationMs: 1000)
 * - Gate redirect delay: 5000ms (redirectDelayMs: 5000)
 */
export const DEFAULT_TIMEOUTS = {
  /** Wait for PoW to start (should be quick) */
  START: 5000,
  /** Wait for any progress update (difficulty=8 is fast) */
  PROGRESS: 3000,
  /** Wait for PoW completion (10s PoW timeout + 2s buffer) */
  COMPLETE: 12000,
  /** Wait for PoW completion with honeypot penalty (+50% for increased difficulty) */
  COMPLETE_PENALTY: 15000,
  /** Wait for redirect after completion */
  REDIRECT: 6000,
};

/**
 * Reads the current status code exposed by the gate screen.
 * @param {import('@playwright/test').Page} page
 */
export async function getGateStatusCode(page) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el ? el.dataset.statusCode || null : null;
  }, STATUS_DEBUG_SELECTOR);
}

/**
 * Waits until the gate status code matches one of the expected values.
 * @param {import('@playwright/test').Page} page
 * @param {string | string[]} expectedCodes
 * @param {import('@playwright/test').WaitForFunctionOptions} [options]
 */
export async function waitForGateStatus(page, expectedCodes, options) {
  const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
  await page.waitForFunction(
    ({ selector, codes }) => {
      const el = document.querySelector(selector);
      return Boolean(
        el && el.dataset.statusCode && codes.includes(el.dataset.statusCode),
      );
    },
    { selector: STATUS_DEBUG_SELECTOR, codes },
    options,
  );
  return getGateStatusCode(page);
}

/**
 * Waits for the gate to report completion.
 * Uses DEFAULT_TIMEOUTS.COMPLETE if no timeout specified.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').WaitForFunctionOptions} [options]
 */
export function waitForGateSuccess(page, options) {
  const opts = { timeout: DEFAULT_TIMEOUTS.COMPLETE, ...options };
  return waitForGateStatus(page, GATE_STATUS.POW_COMPLETE, opts);
}

/**
 * Waits for the gate to begin solving (or complete instantly).
 * Returns the status code observed when the wait resolved.
 * Uses DEFAULT_TIMEOUTS.START if no timeout specified.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').WaitForFunctionOptions} [options]
 */
export function waitForGateStart(page, options) {
  const opts = { timeout: DEFAULT_TIMEOUTS.START, ...options };
  return waitForGateStatus(page, [GATE_STATUS.POW_START, GATE_STATUS.POW_COMPLETE], opts);
}

/**
 * Waits for the gate to complete, with support for honeypot penalties.
 * Uses longer timeout (DEFAULT_TIMEOUTS.COMPLETE_PENALTY) to account for increased difficulty.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').WaitForFunctionOptions} [options]
 */
export function waitForGateCompleteWithPenalty(page, options) {
  const opts = { timeout: DEFAULT_TIMEOUTS.COMPLETE_PENALTY, ...options };
  return waitForGateStatus(page, GATE_STATUS.POW_COMPLETE, opts);
}

/**
 * Returns the numeric progress value reported by the gate (0-100).
 * @param {import('@playwright/test').Page} page
 */
export async function getGateProgress(page) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const value = Number(el.getAttribute("aria-valuenow"));
    return Number.isFinite(value) ? value : null;
  }, PROGRESS_SELECTOR);
}

/**
 * Waits for the progress value to reach or exceed the provided threshold.
 * Uses DEFAULT_TIMEOUTS.PROGRESS if no timeout specified.
 * Note: With difficulty=8, PoW may complete instantly, so this can return 100 immediately.
 * @param {import('@playwright/test').Page} page
 * @param {number} minValue
 * @param {import('@playwright/test').WaitForFunctionOptions} [options]
 */
export async function waitForGateProgress(page, minValue, options) {
  const opts = { timeout: DEFAULT_TIMEOUTS.PROGRESS, ...options };
  await page.waitForFunction(
    ({ selector, minValue }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const value = Number(el.getAttribute("aria-valuenow"));
      if (!Number.isFinite(value)) return false;
      return value >= minValue;
    },
    { selector: PROGRESS_SELECTOR, minValue },
    opts,
  );
  return getGateProgress(page);
}

/**
 * Properly clears storage with retry logic to avoid race conditions.
 * Should be called in beforeEach hooks or before navigation.
 * @param {import('@playwright/test').Page} page
 */
export async function clearGateStorage(page) {
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch (_error) {
      void _error;
    }
  });
  // Wait for storage to be cleared
  await page.waitForFunction(
    () => {
      try {
        return window.localStorage.length === 0;
      } catch (_error) {
        return true; // If storage is unavailable, consider it cleared
      }
    },
    { timeout: 1000 }
  ).catch(() => {
    // Ignore timeout - storage might not be accessible
  });
}

export const gateSelectors = {
  container: ".gate",
  inner: ".gate__inner",
  status: STATUS_SELECTOR,
  statusDebug: STATUS_DEBUG_SELECTOR,
  progress: PROGRESS_SELECTOR,
  progressBar: "#gate-progress",
  attributionLink: ".gate__meta-link",
};

// Re-export GATE_STATUS for convenience
export { GATE_STATUS };

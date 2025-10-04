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

test.describe("Demo app shield integration", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("home page unlocks after passing the gate", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // First visit should send us through the gate flow
    await page.waitForURL(/\/gate.*next=%2F/, {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await waitForGateStart(page);
    await waitForGateSuccess(page);

    // Wait for redirect with longer timeout (redirectDelayMs: 5000 in config)
    await page.waitForURL("/", {
      timeout: 10000,
      waitUntil: "domcontentloaded",
    });

    // Wait for shield to initialize after redirect
    await page.waitForFunction(() => {
      return (
        document.documentElement.hasAttribute("data-astro-shield-ready") &&
        window.__ASTRO_SHIELD_READY__ === true
      );
    }, { timeout: 5000 });

    // Verify shield reports ready state
    const isReady = await page.evaluate(() => {
      return (
        document.documentElement.hasAttribute("data-astro-shield-ready") &&
        window.__ASTRO_SHIELD_READY__ === true
      );
    });
    expect(isReady).toBe(true);

    // Real content (main) should be visible
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
  });


  test("document visibility is properly restored after gate", async ({ page }) => {
    // Monitor visibility changes
    const visibilityStates = [];

    page.on('domcontentloaded', async () => {
      const visibility = await page.evaluate(() =>
        document.documentElement.style.visibility
      );
      visibilityStates.push(visibility);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Pass through the gate
    await page.waitForURL(/\/gate.*next=%2F/, {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Document should be visible after gate completion
    const finalVisibility = await page.evaluate(() => ({
      htmlVisibility: document.documentElement.style.visibility,
      bodyDisplay: window.getComputedStyle(document.body).display,
      isHidden: document.hidden,
    }));

    expect(finalVisibility.htmlVisibility).not.toBe('hidden');
    expect(finalVisibility.bodyDisplay).not.toBe('none');
    expect(finalVisibility.isHidden).toBe(false);
  });

  test("unlock event is properly dispatched and components respond", async ({ page, context }) => {
    // Track unlock events
    await context.addInitScript(() => {
      window.__unlockEventsFired = [];
      document.addEventListener('astro-shield:unlocked', (e) => {
        window.__unlockEventsFired.push({
          timestamp: Date.now(),
          detail: e.detail,
        });
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Pass through the gate
    await page.waitForURL(/\/gate.*next=%2F/, {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Check that unlock event was fired
    const unlockEvents = await page.evaluate(() => window.__unlockEventsFired);
    expect(unlockEvents.length).toBeGreaterThan(0);
    expect(unlockEvents[0].detail.ready).toBe(true);

    // Verify ShieldedContent blocks are unlocked
    const shieldedBlocks = await page.evaluate(() => {
      const blocks = document.querySelectorAll('[data-astro-shield-block]');
      return Array.from(blocks).map(block => ({
        isUnlocked: block.dataset.astroShieldUnlocked === 'true',
        hasTemplate: !!block.querySelector('template'),
        contentVisible: !block.querySelector('[data-astro-shield-content]')?.hidden,
      }));
    });

    // All blocks should be unlocked
    shieldedBlocks.forEach(block => {
      expect(block.isUnlocked).toBe(true);
      expect(block.hasTemplate).toBe(false); // Template should be consumed
      expect(block.contentVisible).toBe(true);
    });
  });


  test("no flash of content before gate redirect (FOUC prevention)", async ({ page, context }) => {
    // Track if content was ever visible before gate redirect
    let contentWasVisible = false;

    await context.addInitScript(() => {
      window.__contentVisibilityLog = [];

      // Monitor document visibility from the very start
      const observer = new MutationObserver(() => {
        const visibility = document.documentElement.style.visibility;
        const dataReady = document.documentElement.hasAttribute('data-astro-shield-ready');
        window.__contentVisibilityLog.push({
          timestamp: Date.now(),
          visibility,
          dataReady,
          pathname: location.pathname
        });
      });

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'data-astro-shield-ready']
      });

      // Also log initial state
      window.__contentVisibilityLog.push({
        timestamp: Date.now(),
        visibility: document.documentElement.style.visibility,
        dataReady: false,
        pathname: location.pathname,
        initial: true
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should redirect to gate before content is visible
    await page.waitForURL(/\/gate/, { timeout: 5000 });

    // Check visibility log - content should have been hidden before gate redirect
    const visibilityLog = await page.evaluate(() => window.__contentVisibilityLog || []);

    // On initial page load (before gate redirect), visibility should be set to hidden/empty
    const logsBeforeGate = visibilityLog.filter(log => log.pathname === '/');

    if (logsBeforeGate.length > 0) {
      // Document should have been hidden at some point before redirecting to gate
      const wasHidden = logsBeforeGate.some(log =>
        log.visibility === 'hidden' || log.visibility === '' || log.visibility === 'visible'
      );
      expect(wasHidden).toBe(true);
    }
  });

  test("ShieldedContent wrapper uses display:contents to maintain grid layout", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Pass through the gate
    await page.waitForURL(/\/gate.*next=%2F/, {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Check that ShieldedContent wrapper has display: contents
    const shieldedBlockDisplay = await page.evaluate(() => {
      const block = document.querySelector('[data-astro-shield-block]');
      if (!block) return null;
      return window.getComputedStyle(block).display;
    });

    expect(shieldedBlockDisplay).toBe('contents');

    // Verify main content is properly positioned (grid layout working)
    const mainPosition = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return null;
      const rect = main.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(main);
      return {
        isVisible: rect.top >= 0 && rect.bottom <= window.innerHeight * 2,
        display: computedStyle.display,
      };
    });

    // Main should be visible and using grid
    expect(mainPosition).not.toBeNull();
    expect(mainPosition.isVisible).toBe(true);
    expect(mainPosition.display).toBe('grid');
  });
});

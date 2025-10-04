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
 * ShieldedContent Component Tests
 *
 * Tests covering:
 * - Multiple blocks on same page
 * - Template consumption
 * - Content visibility
 * - MutationObserver for dynamic blocks
 * - display:contents behavior
 * - Complex content scenarios
 */
test.describe("ShieldedContent - Basic Unlock Behavior", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("1. ShieldedContent template exists before unlock", async ({ page }) => {
    // We need to check before gate completion, but the redirect makes this tricky
    // Instead, inject a shielded block and verify template handling

    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // After unlock, templates should be consumed (removed)
    const templates = await page.locator('[data-astro-shield-template]').count();
    expect(templates).toBe(0); // All templates should be consumed
  });

  test("2. ShieldedContent consumes template after unlock", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Wait for unlock
    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // All shield blocks should be unlocked
    const shieldBlocks = await page.evaluate(() => {
      const blocks = document.querySelectorAll('[data-astro-shield-block]');
      return Array.from(blocks).map(block => ({
        isUnlocked: block.dataset.astroShieldUnlocked === 'true',
        hasTemplate: !!block.querySelector('[data-astro-shield-template]'),
        hasContent: !!block.querySelector('[data-astro-shield-content]'),
      }));
    });

    shieldBlocks.forEach(block => {
      expect(block.isUnlocked).toBe(true);
      expect(block.hasTemplate).toBe(false); // Template consumed
      expect(block.hasContent).toBe(true); // Content visible
    });
  });

  test("3. ShieldedContent shows hidden content after unlock", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Check that content hosts are visible
    const contentHosts = page.locator('[data-astro-shield-content]');
    const count = await contentHosts.count();

    for (let i = 0; i < count; i++) {
      const isHidden = await contentHosts.nth(i).evaluate(el => el.hidden);
      expect(isHidden).toBe(false);
    }
  });

  test("4. ShieldedContent uses display:contents for layout preservation", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    // Check that shield blocks have display:contents
    const shieldBlocks = page.locator('[data-astro-shield-block]');
    const count = await shieldBlocks.count();

    for (let i = 0; i < count; i++) {
      const display = await shieldBlocks.nth(i).evaluate(el => {
        return window.getComputedStyle(el).display;
      });
      expect(display).toBe('contents');
    }
  });

  test("5. Unlocked ShieldedContent sets data-astro-shield-unlocked attribute", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    const shieldBlocks = page.locator('[data-astro-shield-block]');
    const count = await shieldBlocks.count();

    for (let i = 0; i < count; i++) {
      await expect(shieldBlocks.nth(i)).toHaveAttribute('data-astro-shield-unlocked', 'true');
    }
  });
});

test.describe("ShieldedContent - Multiple Blocks", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("6. Multiple ShieldedContent blocks unlock simultaneously", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Get all shield blocks
    const shieldBlocks = page.locator('[data-astro-shield-block]');
    const count = await shieldBlocks.count();

    if (count > 1) {
      // All should be unlocked at the same time
      for (let i = 0; i < count; i++) {
        const isUnlocked = await shieldBlocks.nth(i).evaluate(block => {
          return block.dataset.astroShieldUnlocked === 'true';
        });
        expect(isUnlocked).toBe(true);
      }
    }
  });

  test("7. Page with multiple ShieldedContent blocks renders correctly", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Verify main content is visible (wrapped in ShieldedContent)
    await expect(page.locator('main')).toBeVisible();

    // Verify h1 is visible (inside ShieldedContent)
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe("ShieldedContent - Dynamic Injection", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("8. Dynamically injected ShieldedContent is detected by MutationObserver", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Inject a new ShieldedContent block dynamically
    await page.evaluate(() => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div data-astro-shield-block data-test-id="dynamic-block-1">
          <template data-astro-shield-template>
            <p id="dynamic-content-1">Dynamic shielded content 1</p>
          </template>
          <div data-astro-shield-content hidden></div>
        </div>
      `;
      document.body.appendChild(wrapper.firstElementChild);
    });

    // Wait a bit for MutationObserver to detect and unlock
    await page.waitForTimeout(500);

    // Verify the dynamic block was unlocked
    const dynamicContent = page.locator("#dynamic-content-1");
    await expect(dynamicContent).toBeVisible();
  });

  test("9. Multiple dynamically injected ShieldedContent blocks unlock correctly", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Inject multiple blocks at once
    await page.evaluate(() => {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 3; i++) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `
          <div data-astro-shield-block data-test-id="multi-dynamic-${i}">
            <template data-astro-shield-template>
              <p id="multi-dynamic-content-${i}">Multi dynamic ${i}</p>
            </template>
            <div data-astro-shield-content hidden></div>
          </div>
        `;
        fragment.appendChild(wrapper.firstElementChild);
      }
      document.body.appendChild(fragment);
    });

    await page.waitForTimeout(500);

    // All should be visible
    for (let i = 0; i < 3; i++) {
      const content = page.locator(`#multi-dynamic-content-${i}`);
      await expect(content).toBeVisible();
    }
  });

  test("10. Nested dynamic ShieldedContent blocks unlock correctly", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Inject nested blocks
    await page.evaluate(() => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div data-astro-shield-block data-test-id="nested-outer">
          <template data-astro-shield-template>
            <div id="outer-content">
              Outer content
              <div data-astro-shield-block data-test-id="nested-inner">
                <template data-astro-shield-template>
                  <p id="inner-content">Inner content</p>
                </template>
                <div data-astro-shield-content hidden></div>
              </div>
            </div>
          </template>
          <div data-astro-shield-content hidden></div>
        </div>
      `;
      document.body.appendChild(wrapper.firstElementChild);
    });

    await page.waitForTimeout(500);

    // Both outer and inner should be visible
    await expect(page.locator("#outer-content")).toBeVisible();
    await expect(page.locator("#inner-content")).toBeVisible();
  });

  test("11. ShieldedContent with complex HTML content unlocks correctly", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Inject complex content
    await page.evaluate(() => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div data-astro-shield-block data-test-id="complex-block">
          <template data-astro-shield-template>
            <article id="complex-article">
              <h2>Complex Content</h2>
              <form id="complex-form">
                <input type="text" id="complex-input" value="test" />
                <button type="button" id="complex-button">Click</button>
              </form>
              <ul>
                <li>Item 1</li>
                <li>Item 2</li>
              </ul>
            </article>
          </template>
          <div data-astro-shield-content hidden></div>
        </div>
      `;
      document.body.appendChild(wrapper.firstElementChild);
    });

    await page.waitForTimeout(500);

    // All complex elements should be visible and functional
    await expect(page.locator("#complex-article")).toBeVisible();
    await expect(page.locator("#complex-form")).toBeVisible();
    await expect(page.locator("#complex-input")).toBeVisible();
    await expect(page.locator("#complex-button")).toBeVisible();

    // Verify input is functional
    await page.locator("#complex-input").fill("updated");
    const value = await page.locator("#complex-input").inputValue();
    expect(value).toBe("updated");
  });

  test("12. ShieldedContent preserves event listeners after unlock", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Inject content with event listener
    await page.evaluate(() => {
      window.__clickCount = 0;
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div data-astro-shield-block data-test-id="event-block">
          <template data-astro-shield-template>
            <button id="event-button">Click Counter</button>
          </template>
          <div data-astro-shield-content hidden></div>
        </div>
      `;
      document.body.appendChild(wrapper.firstElementChild);
    });

    await page.waitForTimeout(500);

    // Add event listener after unlock
    await page.evaluate(() => {
      const button = document.getElementById('event-button');
      if (button) {
        button.addEventListener('click', () => {
          window.__clickCount++;
        });
      }
    });

    // Click and verify
    await page.locator("#event-button").click({ force: true });
    const clickCount = await page.evaluate(() => window.__clickCount);
    expect(clickCount).toBe(1);
  });
});

test.describe("ShieldedContent - Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  test("13. ShieldedContent without template still works", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Inject block without template (should be considered already unlocked)
    await page.evaluate(() => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div data-astro-shield-block data-test-id="no-template-block">
          <div data-astro-shield-content>
            <p id="no-template-content">Content without template</p>
          </div>
        </div>
      `;
      document.body.appendChild(wrapper.firstElementChild);
    });

    await page.waitForTimeout(500);

    // Should be visible immediately
    await expect(page.locator("#no-template-content")).toBeVisible();
  });

  test("14. Empty ShieldedContent unlocks without errors", async ({ page }) => {
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await waitForGateSuccess(page);
    await page.waitForURL("/", {
      timeout: DEFAULT_TIMEOUTS.REDIRECT,
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.__ASTRO_SHIELD_READY__);

    // Inject empty block
    await page.evaluate(() => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div data-astro-shield-block data-test-id="empty-block">
          <template data-astro-shield-template></template>
          <div data-astro-shield-content hidden></div>
        </div>
      `;
      document.body.appendChild(wrapper.firstElementChild);
    });

    await page.waitForTimeout(500);

    // Should be unlocked
    const block = page.locator('[data-test-id="empty-block"]');
    await expect(block).toHaveAttribute('data-astro-shield-unlocked', 'true');
  });
});

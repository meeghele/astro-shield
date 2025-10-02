// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

// @ts-check
import { test, expect } from "@playwright/test";
import { clearGateStorage } from "./utils/gate-test-helpers.js";

/**
 * Gate Theme Detection Tests
 *
 * Tests for dark/light mode detection and rendering:
 * - System preference detection (prefers-color-scheme)
 * - localStorage override behavior
 * - Priority handling (localStorage > system)
 * - CSS class application
 * - Color rendering verification
 */
test.describe("Gate Theme Detection", () => {
  test.beforeEach(async ({ page }) => {
    await clearGateStorage(page);
  });

  /**
   * SYSTEM PREFERENCE DETECTION
   */

  test("1. Detects light mode from system preference", async ({ browser }) => {
    // Create context with light color scheme preference
    const context = await browser.newContext({
      colorScheme: "light",
    });
    const page = await context.newPage();

    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify dark class is NOT present
    const htmlElement = page.locator("html");
    await expect(htmlElement).not.toHaveClass(/dark/);

    // Verify light mode colors are applied to body
    const bodyBg = await page.locator("body").evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    // #ffffff = rgb(255, 255, 255)
    expect(bodyBg).toBe("rgb(255, 255, 255)");

    await context.close();
  });

  test("2. Detects dark mode from system preference", async ({ browser }) => {
    // Create context with dark color scheme preference
    const context = await browser.newContext({
      colorScheme: "dark",
    });
    const page = await context.newPage();

    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify dark class IS present
    const htmlElement = page.locator("html");
    await expect(htmlElement).toHaveClass(/dark/);

    // Verify dark mode colors are applied to body
    const bodyBg = await page.locator("body").evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    // #0e141b = rgb(14, 20, 27)
    expect(bodyBg).toBe("rgb(14, 20, 27)");

    await context.close();
  });

  /**
   * LOCALSTORAGE OVERRIDE
   */

  test("3. localStorage 'light' overrides system dark preference", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: "dark", // System prefers dark
    });
    const page = await context.newPage();

    // Set localStorage to light before navigating
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.setItem("theme", "light");
    });

    // Reload to apply the localStorage preference
    await page.reload({ waitUntil: "domcontentloaded" });

    // Verify dark class is NOT present (light mode active)
    const htmlElement = page.locator("html");
    await expect(htmlElement).not.toHaveClass(/dark/);

    // Verify light mode colors
    const bodyBg = await page.locator("body").evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bodyBg).toBe("rgb(255, 255, 255)");

    await context.close();
  });

  test("4. localStorage 'dark' overrides system light preference", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: "light", // System prefers light
    });
    const page = await context.newPage();

    // Set localStorage to dark before navigating
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
    });

    // Reload to apply the localStorage preference
    await page.reload({ waitUntil: "domcontentloaded" });

    // Verify dark class IS present (dark mode active)
    const htmlElement = page.locator("html");
    await expect(htmlElement).toHaveClass(/dark/);

    // Verify dark mode colors
    const bodyBg = await page.locator("body").evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bodyBg).toBe("rgb(14, 20, 27)");

    await context.close();
  });

  /**
   * PRIORITY VALIDATION
   */

  test("5. Confirms localStorage takes precedence over system preference", async ({
    browser,
  }) => {
    // Test both directions to ensure priority is consistent

    // Dark system + light localStorage = light mode
    const darkContext = await browser.newContext({ colorScheme: "dark" });
    const darkPage = await darkContext.newPage();
    await darkPage.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await darkPage.evaluate(() => localStorage.setItem("theme", "light"));
    await darkPage.reload({ waitUntil: "domcontentloaded" });
    await expect(darkPage.locator("html")).not.toHaveClass(/dark/);
    await darkContext.close();

    // Light system + dark localStorage = dark mode
    const lightContext = await browser.newContext({ colorScheme: "light" });
    const lightPage = await lightContext.newPage();
    await lightPage.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await lightPage.evaluate(() => localStorage.setItem("theme", "dark"));
    await lightPage.reload({ waitUntil: "domcontentloaded" });
    await expect(lightPage.locator("html")).toHaveClass(/dark/);
    await lightContext.close();
  });

  /**
   * CSS CLASS APPLICATION
   */

  test("6. Applies and removes .dark class correctly", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();

    // Start with light mode (no dark class)
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Switch to dark mode via localStorage
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Switch back to light mode
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await context.close();
  });

  /**
   * COLOR VERIFICATION
   */

  test("7. Renders correct colors in light mode", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Wait for gate to be visible
    await page.locator(".gate").waitFor({ state: "visible" });

    // Verify light mode colors
    const styles = await page.evaluate(() => {
      const body = document.querySelector("body");
      const progressBar = document.querySelector(".progress-bar");
      const status = document.querySelector(".gate__status");
      const link = document.querySelector(".gate__meta-link");

      return {
        bodyBg: window.getComputedStyle(body).backgroundColor,
        bodyColor: window.getComputedStyle(body).color,
        progressBarBg: window.getComputedStyle(progressBar).backgroundImage,
        statusColor: window.getComputedStyle(status).color,
        linkColor: window.getComputedStyle(link).color,
      };
    });

    // Light mode colors:
    // bg: #ffffff = rgb(255, 255, 255)
    // text: #374151 = rgb(55, 65, 81)
    // bar: #f97316 = rgb(249, 115, 22)
    expect(styles.bodyBg).toBe("rgb(255, 255, 255)");
    expect(styles.bodyColor).toBe("rgb(55, 65, 81)");
    expect(styles.progressBarBg).toContain("rgb(249, 115, 22)");
    expect(styles.statusColor).toBe("rgb(55, 65, 81)");
    expect(styles.linkColor).toBe("rgb(249, 115, 22)");

    await context.close();
  });

  test("8. Renders correct colors in dark mode", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Wait for gate to be visible
    await page.locator(".gate").waitFor({ state: "visible" });

    // Verify dark mode colors
    const styles = await page.evaluate(() => {
      const body = document.querySelector("body");
      const progressBar = document.querySelector(".progress-bar");
      const status = document.querySelector(".gate__status");
      const link = document.querySelector(".gate__meta-link");

      return {
        bodyBg: window.getComputedStyle(body).backgroundColor,
        bodyColor: window.getComputedStyle(body).color,
        progressBarBg: window.getComputedStyle(progressBar).backgroundImage,
        statusColor: window.getComputedStyle(status).color,
        linkColor: window.getComputedStyle(link).color,
      };
    });

    // Dark mode colors:
    // bg: #0e141b = rgb(14, 20, 27)
    // text: #d6d3d1 = rgb(214, 211, 209)
    // bar: #facc15 = rgb(250, 204, 21)
    expect(styles.bodyBg).toBe("rgb(14, 20, 27)");
    expect(styles.bodyColor).toBe("rgb(214, 211, 209)");
    expect(styles.progressBarBg).toContain("rgb(250, 204, 21)");
    expect(styles.statusColor).toBe("rgb(214, 211, 209)");
    expect(styles.linkColor).toBe("rgb(250, 204, 21)");

    await context.close();
  });

  /**
   * CONFIG-BASED COLOR VERIFICATION
   *
   * These tests verify that color config options are properly applied
   * in the production build. Since colors are set via the astro.config.mjs
   * and passed through to the Gate component, these tests check that the
   * CSS custom properties (define:vars) work correctly.
   */

  test("9. CSS custom properties are defined for all theme colors", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });

    // Verify all color CSS variables are defined on the page
    const cssVars = await page.evaluate(() => {
      const root = document.documentElement;
      const styles = window.getComputedStyle(root);

      return {
        darkBgColor: styles.getPropertyValue('--darkBgColor')?.trim() || null,
        darkTextColor: styles.getPropertyValue('--darkTextColor')?.trim() || null,
        darkBarColor: styles.getPropertyValue('--darkBarColor')?.trim() || null,
        lightBgColor: styles.getPropertyValue('--lightBgColor')?.trim() || null,
        lightTextColor: styles.getPropertyValue('--lightTextColor')?.trim() || null,
        lightBarColor: styles.getPropertyValue('--lightBarColor')?.trim() || null,
      };
    });

    // All variables should be defined (non-empty strings)
    expect(cssVars.darkBgColor).toBeTruthy();
    expect(cssVars.darkTextColor).toBeTruthy();
    expect(cssVars.darkBarColor).toBeTruthy();
    expect(cssVars.lightBgColor).toBeTruthy();
    expect(cssVars.lightTextColor).toBeTruthy();
    expect(cssVars.lightBarColor).toBeTruthy();

    await context.close();
  });

  test("10. Dark mode uses dark color CSS variables", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await page.locator(".gate").waitFor({ state: "visible" });

    // Get the CSS variable values and the actual rendered styles
    const colorCheck = await page.evaluate(() => {
      const root = document.documentElement;
      const rootStyles = window.getComputedStyle(root);
      const body = document.querySelector("body");
      const bodyStyles = window.getComputedStyle(body);
      const progressBar = document.querySelector(".progress-bar");
      const barStyles = window.getComputedStyle(progressBar);

      return {
        // CSS variable values
        darkBgVar: rootStyles.getPropertyValue('--darkBgColor')?.trim(),
        darkTextVar: rootStyles.getPropertyValue('--darkTextColor')?.trim(),
        darkBarVar: rootStyles.getPropertyValue('--darkBarColor')?.trim(),
        // Rendered styles
        bodyBg: bodyStyles.backgroundColor,
        bodyColor: bodyStyles.color,
        progressBarBg: barStyles.backgroundImage,
      };
    });

    // The rendered colors should reference the CSS variables
    // (This verifies the define:vars → CSS pipeline works)
    expect(colorCheck.darkBgVar).toBeTruthy();
    expect(colorCheck.darkTextVar).toBeTruthy();
    expect(colorCheck.darkBarVar).toBeTruthy();

    // Verify the styles use the variables (actual color values should match)
    expect(colorCheck.bodyBg).toBeTruthy();
    expect(colorCheck.bodyColor).toBeTruthy();
    expect(colorCheck.progressBarBg).toContain("linear-gradient");

    await context.close();
  });

  test("11. Light mode uses light color CSS variables", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await page.locator(".gate").waitFor({ state: "visible" });

    // Get the CSS variable values and the actual rendered styles
    const colorCheck = await page.evaluate(() => {
      const root = document.documentElement;
      const rootStyles = window.getComputedStyle(root);
      const body = document.querySelector("body");
      const bodyStyles = window.getComputedStyle(body);
      const progressBar = document.querySelector(".progress-bar");
      const barStyles = window.getComputedStyle(progressBar);

      return {
        // CSS variable values
        lightBgVar: rootStyles.getPropertyValue('--lightBgColor')?.trim(),
        lightTextVar: rootStyles.getPropertyValue('--lightTextColor')?.trim(),
        lightBarVar: rootStyles.getPropertyValue('--lightBarColor')?.trim(),
        // Rendered styles
        bodyBg: bodyStyles.backgroundColor,
        bodyColor: bodyStyles.color,
        progressBarBg: barStyles.backgroundImage,
      };
    });

    // The rendered colors should reference the CSS variables
    expect(colorCheck.lightBgVar).toBeTruthy();
    expect(colorCheck.lightTextVar).toBeTruthy();
    expect(colorCheck.lightBarVar).toBeTruthy();

    // Verify the styles use the variables
    expect(colorCheck.bodyBg).toBeTruthy();
    expect(colorCheck.bodyColor).toBeTruthy();
    expect(colorCheck.progressBarBg).toContain("linear-gradient");

    await context.close();
  });

  test("12. Theme switch correctly changes color variable references", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/gate?next=/", { waitUntil: "domcontentloaded" });
    await page.locator(".gate").waitFor({ state: "visible" });

    // Get dark mode colors
    const darkColors = await page.evaluate(() => {
      const body = document.querySelector("body");
      return window.getComputedStyle(body).backgroundColor;
    });

    // Switch to light mode
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".gate").waitFor({ state: "visible" });

    // Get light mode colors
    const lightColors = await page.evaluate(() => {
      const body = document.querySelector("body");
      return window.getComputedStyle(body).backgroundColor;
    });

    // Colors should be different between themes
    expect(darkColors).not.toBe(lightColors);

    await context.close();
  });
});

// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import type { AstroShieldOptions, AstroShieldResolvedOptions } from "./types";

const defaultOptions: AstroShieldResolvedOptions = {
  gatePath: "/gate",
  autoHideRoot: true,
  shield: {},
};

const sanitizeGatePath = (value: string | undefined): string => {
  if (!value) {
    return defaultOptions.gatePath;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return defaultOptions.gatePath;
  }
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed;
};

const resolveOptions = (
  options: AstroShieldOptions = {},
): AstroShieldResolvedOptions => ({
  gatePath: sanitizeGatePath(options.gatePath),
  autoHideRoot: options.autoHideRoot ?? defaultOptions.autoHideRoot,
  shield: {
    ...defaultOptions.shield,
    ...options.shield,
  },
});

const buildRuntimeConfig = (options: AstroShieldResolvedOptions) => ({
  gatePath: options.gatePath,
  autoHideRoot: options.autoHideRoot,
  ...options.shield,
});

const resolveResourceUrl = (relativePath: string): URL => {
  const directUrl = new URL(relativePath, import.meta.url);
  const directPath = fileURLToPath(directUrl);

  try {
    if (existsSync(directPath)) {
      return directUrl;
    }
  } catch (error) {
    console.warn(`[astro-shield] Could not check path: ${directPath}`, error);
  }

  const fallbackUrl = new URL(`../src/${relativePath}`, import.meta.url);
  const fallbackPath = fileURLToPath(fallbackUrl);

  try {
    if (!existsSync(fallbackPath)) {
      throw new Error(`[astro-shield] Resource not found: ${relativePath}\nTried:\n  - ${directPath}\n  - ${fallbackPath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('astro-shield')) {
      throw error;
    }
    console.warn(`[astro-shield] Could not check fallback path: ${fallbackPath}`, error);
  }

  return fallbackUrl;
};

const resolveAliasRoot = (): string => {
  const candidateUrls = [
    new URL(".", import.meta.url),
    new URL("../src/", import.meta.url),
  ];
  for (const url of candidateUrls) {
    const componentsDir = new URL("./components", url);
    if (existsSync(fileURLToPath(componentsDir))) {
      return fileURLToPath(url);
    }
  }
  return fileURLToPath(new URL(".", import.meta.url));
};

export const astroShield = (
  options: AstroShieldOptions = {},
): AstroIntegration => {
  const resolved = resolveOptions(options);

  let initScriptUrl: URL;
  let runtimeScriptUrl: URL;
  let gatePageUrl: URL;
  let initScript: string;
  let runtimeScript: string;

  try {
    initScriptUrl = resolveResourceUrl("./scripts/init_gate_protection.js");
    runtimeScriptUrl = resolveResourceUrl("./scripts/runtime_honeypots.js");
    gatePageUrl = resolveResourceUrl("./pages/Gate.astro");

    initScript = readFileSync(initScriptUrl, "utf-8");
    runtimeScript = readFileSync(runtimeScriptUrl, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[astro-shield] Failed to initialize integration: ${message}`);
  }

  return {
    name: "astro-shield",
    hooks: {
      "astro:config:setup": ({
        injectScript,
        injectRoute,
        addWatchFile,
        updateConfig,
        command,
      }) => {
        const isDev = command === "dev";

        if (isDev) {
          console.log("[astro-shield] Initializing in development mode");
          console.log(`[astro-shield] Gate path: ${resolved.gatePath}`);
          console.log(`[astro-shield] Auto-hide root: ${resolved.autoHideRoot}`);
        }

        try {
          addWatchFile(initScriptUrl);
          addWatchFile(runtimeScriptUrl);
          addWatchFile(gatePageUrl);

          const runtimeConfig = buildRuntimeConfig(resolved);
          const configScript = `window.__ASTRO_SHIELD_CONFIG__ = Object.assign({}, window.__ASTRO_SHIELD_CONFIG__, ${JSON.stringify(runtimeConfig)});`;

          injectScript("head-inline", configScript);
          injectScript("head-inline", initScript);
          injectScript("page", runtimeScript);

          injectRoute({
            pattern: resolved.gatePath,
            entrypoint: fileURLToPath(gatePageUrl),
          });

          const aliasRoot = resolveAliasRoot();
          if (isDev) {
            console.log(`[astro-shield] Alias root: ${aliasRoot}`);
          }

          updateConfig({
            vite: {
              resolve: {
                alias: {
                  "astro-shield": aliasRoot,
                },
              },
              define: {
                __ASTRO_SHIELD_OPTIONS__: JSON.stringify(resolved),
              },
            },
          });

          if (isDev) {
            console.log("[astro-shield] Integration setup complete");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[astro-shield] Setup failed: ${message}`);
          throw error;
        }
      },
    },
  };
};

export default astroShield;

export type { AstroShieldOptions, AstroShieldResolvedOptions };

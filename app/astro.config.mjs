// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

import { defineConfig } from "astro/config";
import astroShield from "@meeghele/astro-shield";

export default defineConfig({
  server: {
    port: 4322,
  },
  site: "http://localhost:4322",
  integrations: [
    astroShield({
      gatePath: "/gate",
      autoHideRoot: true,
      shield: {
        // Original repo timing (from www.meeghele.com/src/pages/gate.astro)
        difficulty: 12,              // Medium difficulty
        timeoutMs: 8000,             // 8 seconds max
        redirectDelayMs: 2000,       // 2 second delay after completion
        minSolveDurationMs: 1000,    // Show solving UI for at least 1 second
        showDebugInfo: true,
        enableHoneypots: true,
        enableLinkDecoys: true,
      },
    }),
  ],
});

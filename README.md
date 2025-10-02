[![npm version](https://img.shields.io/npm/v/@meeghele/astro-shield.svg)](https://www.npmjs.com/package/@meeghele/astro-shield)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Astro](https://img.shields.io/badge/Astro-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

# Astro Shield

Proof-of-work (PoW) gate with honeypot and decoy link protection for Astro sites. A minimal integration that adds multi-layered client-side bot protection without requiring external services.

## Overview

Astro Shield is a client-side protection layer designed to defend static websites from automated scrapers and basic bots. It verifies visitors through computational challenges that run entirely in the browser, requiring no backend infrastructure, no APIs, or third-party services.

### What it protects against

- ✅ Simple scrapers and automated tools with JavaScript execution
- ✅ Basic crawlers without JavaScript capability (cannot render the gate page)
- ✅ Automated form submissions and content harvesting
- ✅ Unsophisticated bot traffic that floods small independent sites

### What it does NOT protect against

- ❌ Advanced bots with headless browser capabilities and PoW solving
- ❌ Determined attackers willing to solve computational challenges
- ❌ Sophisticated AI scraper infrastructure with anti-detection measures

### When to use Astro Shield

- You run a static site and need basic bot protection without server-side code
- You want to avoid external dependencies like Cloudflare or commercial anti-bot services
- You need a lightweight, self-contained solution for small-to-medium traffic sites
- You're willing to trade some legitimate bot access (search engines, archivers) for reduced scraper load

### When NOT to use Astro Shield

- You need enterprise-grade bot protection for high-value targets
- You require allowlisting for "good bots" like search engines or the Internet Archive
- You're under active attack from sophisticated scraping operations
- You need backend validation and server-side enforcement

### For more robust protection, consider

- **[Anubis](https://github.com/TecharoHQ/anubis)**: Open-source backend firewall utility that validates connections before they reach your server, with configurable bot policies and allowlisting
- **[Cloudflare](https://www.cloudflare.com/)**: Enterprise-grade CDN with advanced bot management, DDoS protection, and WAF capabilities

This is a **deterrent-focused approach** that raises the cost of automated access. It won't stop determined adversaries, but it will significantly reduce noise from the vast majority of unsophisticated scrapers that target the independent web.

## Features

- **Proof-of-Work Gate**: Challenge-based protection that requires computational work to access your site
- **Honeypot Defenses**: Invisible form fields that detect automated form filling
- **Decoy Links**: Trap links (e.g., `/admin`, `/wp-admin`) that catch scrapers and crawlers
- **Time-Based Validation**: Detect suspiciously fast form submissions
- **Zero Dependencies**: No external services or API keys required
- **Fully Type-Safe**: Complete TypeScript support
- **Configurable**: Flexible options for difficulty, timeouts, and behavior
- **Auto-Hide Root**: Optionally redirect the root page to the gate
- **Native Astro Integration**: Seamless setup with Astro's integration system

## How It Works

1. **Gate**: Visitors are redirected to a proof-of-work challenge page
2. **PoW**: Client-side JavaScript performs computational work to find a valid solution
3. **Token**: A valid solution generates a time-limited token stored in localStorage
4. **Page Protection**: Once the token is validated, users can access all protected pages
5. **Image Protection**: Images using the `<ShieldedImage>` component are only loaded after gate validation - they initially show a placeholder and only load the real image once the token is verified
6. **Honeypots**: Hidden form fields detect automated form filling
7. **Decoys**: Invisible links to common bot targets (e.g., `/admin`, `/wp-admin`, `/phpmyadmin`) catch scrapers - any interaction with these links triggers protection
8. **Time Validation**: Tracks form submission speed to detect bots that fill forms too quickly

> **Important Limitation:** This protection works by controlling when content is rendered in the browser. If a bot already knows the direct URL to an image or asset (e.g., from a sitemap, previous crawl, or source code inspection), it can bypass the gate by requesting that URL directly. Image protection is most effective for content where URLs are not predictable or publicly listed.

### Penalty System

When a bot trips a honeypot or decoy link:
- The violation is logged with a unique reason code
- The bot is immediately redirected back to the gate
- The PoW difficulty is **increased** by the `honeypotPenalty` value (default: +1 difficulty level)
- Multiple violations stack, making it exponentially harder for bots to bypass protection
- This creates an adaptive defense that becomes harder the more a bot misbehaves

## Install

```bash
# Using bun
bun add @meeghele/astro-shield

# Using npm
npm install @meeghele/astro-shield

# Using pnpm
pnpm add @meeghele/astro-shield

# Using yarn
yarn add @meeghele/astro-shield
```

## Quick Start

Add the integration to your `astro.config.mjs`:

```typescript
import { defineConfig } from 'astro/config';
import { astroShield } from '@meeghele/astro-shield';

export default defineConfig({
  integrations: [
    astroShield({
      gatePath: '/gate',
      autoHideRoot: true,
      shield: {
        difficulty: 4,
        enableHoneypots: true,
      }
    })
  ]
});
```

That's it! Your site now requires visitors to pass the proof-of-work gate at `/gate` before accessing protected content.

## Configuration

Take a look at the [default configuration](https://github.com/meeghele/astro-shield/blob/main/core/src/pages/Gate.astro#L98) in Gate.astro.

### Basic Options

```typescript
interface AstroShieldOptions {
  gatePath?: string;        // Path to the gate page (default: "/gate")
  autoHideRoot?: boolean;   // Redirect root to gate (default: true)
  shield?: ShieldConfig;    // Advanced shield configuration
}
```

### Shield Configuration

```typescript
interface ShieldConfig {
  // Proof-of-work settings
  difficulty?: number;           // Mining difficulty (default: varies)
  timeoutMs?: number;           // Max time to solve (default: varies)
  minSolveDurationMs?: number;  // Minimum solve time to prevent precomputed solutions

  // Token management
  tokenTtlMinutes?: number;     // Token validity duration
  nearMissThreshold?: number;   // Near-miss detection threshold
  minAcceptable?: number;       // Minimum acceptable hash value
  enableNearMisses?: boolean;   // Allow near-miss solutions

  // Honeypot protection
  enableHoneypots?: boolean;        // Enable honeypot traps
  enableInputHoneypots?: boolean;   // Enable input field honeypots
  enableLinkDecoys?: boolean;       // Enable decoy link honeypots
  honeypotPenalty?: number;         // Penalty for triggering honeypots
  maxPenaltyDiff?: number;          // Maximum penalty difficulty
  honeypotPrefix?: string;          // Custom honeypot field prefix
  decoyPrefix?: string;             // Custom decoy link prefix

  // Validation
  enableFinalCheck?: boolean;       // Enable final validation check
  enableTimeValidation?: boolean;   // Validate solve duration

  // UX
  redirectTo?: string;              // Redirect destination after solving
  redirectDelayMs?: number;         // Delay before redirect
  showProgress?: boolean;           // Show solving progress
  showDebugInfo?: boolean;          // Display debug information

  // Advanced
  shieldNamespace?: string;         // Custom localStorage namespace
}
```

### Default Settings

All settings are optional. Here are the defaults:

```typescript
{
  // Integration defaults
  gatePath: '/gate',
  autoHideRoot: true,

  // Shield defaults
  shield: {
    redirectTo: '/',
    difficulty: 8,                    // Very easy - 8=very easy, 12=easy, 16=medium, 20=hard
    timeoutMs: 10000,                 // 10 seconds
    tokenTtlMinutes: 30,              // 30 minutes
    nearMissThreshold: 4,
    minAcceptable: 4,
    enableNearMisses: true,
    honeypotPenalty: 1,
    maxPenaltyDiff: 16,
    enableHoneypots: true,
    enableInputHoneypots: true,
    enableLinkDecoys: true,
    enableFinalCheck: true,
    enableTimeValidation: true,
    honeypotPrefix: 'hp',
    decoyPrefix: 'dc',
    shieldNamespace: 'as',
    redirectDelayMs: 500,             // 0.5 seconds
    showProgress: true,
    showDebugInfo: false,
    minSolveDurationMs: 600,          // 0.6 seconds
  }
}
```

## Protecting Images

The `<ShieldedImage>` component prevents images from loading in the browser until the user passes the gate:

```astro
---
import ShieldedImage from '@meeghele/astro-shield/components/ShieldedImage.astro';
import myImage from '../assets/photo.jpg';
---

<!-- Shielded image - requires valid token to load in browser -->
<ShieldedImage src={myImage} alt="Protected content" />

<!-- Standard image - loads immediately when page is accessed -->
<Image src={myImage} alt="Public content" />
```

### How it works

- The real image URL is stored in a `data-src` attribute instead of `src`
- A placeholder is shown initially
- Once the user passes the gate and has a valid token, JavaScript swaps `data-src` to `src` and loads the image
- Right-click, drag-and-drop, and other browser shortcuts are disabled

### Important limitations

Both standard and shielded images have their URLs visible in the HTML source code. This means:

- ✅ **ShieldedImage prevents**: Images from loading in the browser before gate validation
- ✅ **ShieldedImage prevents**: Simple bots that only process `src` attributes
- ❌ **ShieldedImage does NOT prevent**: Bots that parse HTML and extract URLs from `data-src` attributes
- ❌ **ShieldedImage does NOT prevent**: Direct requests to image URLs if the bot already knows them

`<ShieldedImage>` improves user experience by hiding content until validation, and adds a minor hurdle for unsophisticated scrapers. It is **not** a security feature against determined bots that can parse HTML or make direct HTTP requests to image URLs.

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Lint
bun run lint
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Michele Tavella** - [meeghele@proton.me](mailto:meeghele@proton.me)

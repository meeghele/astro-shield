// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

declare const __ASTRO_SHIELD_OPTIONS__:
  | import("../types").AstroShieldResolvedOptions
  | undefined;

const fallback: import("../types").AstroShieldResolvedOptions = {
  gatePath: "/gate",
  autoHideRoot: true,
  shield: {},
};

export const ASTRO_SHIELD_OPTIONS =
  typeof __ASTRO_SHIELD_OPTIONS__ !== "undefined"
    ? __ASTRO_SHIELD_OPTIONS__
    : fallback;

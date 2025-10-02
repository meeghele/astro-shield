// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

/* eslint-env browser */
/* global sessionStorage, location, AbortController, clearTimeout */

(function () {
  let PRODUCT_NAMESPACE = "as";
  let GATE_PATH = "/gate";

  const sanitizeNamespace = (value, fallback) => {
    if (typeof value !== "string") {
      return fallback;
    }
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    return normalized || fallback;
  };

  const runtimeName = (value) => `${PRODUCT_NAMESPACE}_${value}`;

  const sanitizePrefix = (value, fallback) => {
    if (typeof value !== "string") {
      return fallback;
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      return "";
    }
    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return normalized;
  };

  const sanitizeGatePath = (value, fallback) => {
    if (typeof value !== "string") {
      return fallback;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  };

  let SHIELD_STORAGE_KEYS = {};
  let HONEYPOT_PREFIX = "hp";
  let DECOY_PREFIX = "dc";

  const refreshStorageKeys = () => {
    SHIELD_STORAGE_KEYS = {
      honeypotTripped: runtimeName("hp_tripped"),
      honeypotReason: runtimeName("hp_reason"),
    };
  };

  const resolveRuntimeConfig = () => {
    const config =
      (typeof globalThis !== "undefined" &&
        globalThis.__ASTRO_SHIELD_CONFIG__) ||
      {};
    PRODUCT_NAMESPACE = sanitizeNamespace(config.shieldNamespace, "as");
    HONEYPOT_PREFIX = sanitizePrefix(config.honeypotPrefix, "hp");
    DECOY_PREFIX = sanitizePrefix(config.decoyPrefix, "dc");
    GATE_PATH = sanitizeGatePath(config.gatePath, "/gate");
    refreshStorageKeys();
  };

  resolveRuntimeConfig();

  const TIME_BUCKET = Math.floor(Date.now() / (10 * 60 * 1000));

  const generateHash = (parts, length = 8) => {
    const seed = parts.filter(Boolean).join("|");
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const base36 = hash.toString(36);
    if (base36.length >= length) {
      return base36.slice(-length);
    }
    return base36.padStart(length, "0");
  };

  const buildReason = (type, detail, extra = "") => {
    const prefix = type === "decoy" ? DECOY_PREFIX : HONEYPOT_PREFIX;
    const hash = generateHash([
      PRODUCT_NAMESPACE,
      prefix,
      type,
      detail,
      extra,
      String(TIME_BUCKET),
    ]);
    const reasonValue = prefix ? `${prefix}_${hash}` : hash;
    return runtimeName(reasonValue);
  };

  let runtimeAbortController = null;
  let idleTimeoutId = null;

  const createStorage = () => ({
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (_error) {
        void _error;
      }
      try {
        sessionStorage.setItem(key, value);
      } catch (_error) {
        void _error;
      }
    },
  });

  const loadDeferredImages = () => {
    for (const img of document.querySelectorAll("img[data-src]")) {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    }
  };

  const queryHoneypotElements = () => ({
    honeypots: document.querySelectorAll(
      '.honeypot, input[name="website"], input[name="email2"], input[name="url"]',
    ),
    decoyLinks: document.querySelectorAll(
      'a[href*="/admin"], a[href*="/login"], a[href*="/download"]:not([href^="http"])',
    ),
  });

  const createTripHoneypot = (storage) => (reason, context = {}) => {
    const payload = JSON.stringify({
      reason,
      timestamp: Date.now(),
      path: location.pathname,
      ...context,
    });
    storage.set(SHIELD_STORAGE_KEYS.honeypotTripped, payload);
    storage.set(SHIELD_STORAGE_KEYS.honeypotReason, reason);
    const next = encodeURIComponent(location.pathname + location.search);
    const separator = GATE_PATH.includes("?") ? "&" : "?";
    location.replace(
      `${GATE_PATH}${separator}hp=1&reason=${reason}&next=${next}`,
    );
  };

  const attachHoneypotListeners = (honeypots, tripHoneypot, signal) => {
    honeypots.forEach((hp, index) => {
      if (!hp) return;
      const baseDetail = (suffix) => `runtime_${suffix}_${index}`;
      hp.addEventListener(
        "input",
        () => {
          const detail = baseDetail("input");
          tripHoneypot(
            buildReason("honeypot", detail, hp.name || hp.id || String(index)),
            { category: "honeypot", event: detail },
          );
        },
        { passive: true, signal },
      );
      hp.addEventListener(
        "change",
        () => {
          const detail = baseDetail("change");
          tripHoneypot(
            buildReason("honeypot", detail, hp.name || hp.id || String(index)),
            { category: "honeypot", event: detail },
          );
        },
        { passive: true, signal },
      );
      hp.addEventListener(
        "focus",
        () => {
          const detail = baseDetail("focus");
          tripHoneypot(
            buildReason("honeypot", detail, hp.name || hp.id || String(index)),
            { category: "honeypot", event: detail },
          );
        },
        { passive: true, signal },
      );
    });
  };

  const attachDecoyLinkListeners = (decoyLinks, tripHoneypot, signal) => {
    decoyLinks.forEach((link, index) => {
      if (!link) return;
      link.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          const detail = `runtime_click_${index}`;
          tripHoneypot(
            buildReason("decoy", detail, link.href || String(index)),
            { category: "decoy", event: detail },
          );
        },
        { passive: false, signal },
      );
    });
  };

  const setupUserInteractionTracking = (tripHoneypot, signal) => {
    let pointerInteractions = 0;
    let keyPresses = 0;
    let rapidClicks = 0;
    let lastClickTime = 0;

    const registerPointer = () => {
      pointerInteractions++;
    };

    document.addEventListener("mousemove", registerPointer, {
      passive: true,
      signal,
    });
    document.addEventListener("pointermove", registerPointer, {
      passive: true,
      signal,
    });
    document.addEventListener("touchstart", registerPointer, {
      passive: true,
      signal,
    });
    document.addEventListener("touchmove", registerPointer, {
      passive: true,
      signal,
    });
    document.addEventListener("keydown", () => keyPresses++, {
      passive: true,
      signal,
    });
    document.addEventListener(
      "click",
      () => {
        const now = Date.now();
        if (now - lastClickTime < 100) {
          rapidClicks++;
          if (rapidClicks > 3) {
            tripHoneypot(buildReason("honeypot", "rapid_clicks"), {
              category: "honeypot",
              event: "rapid_clicks",
            });
          }
        } else {
          rapidClicks = 0;
        }
        lastClickTime = now;
      },
      { passive: true, signal },
    );

    return {
      getPointerInteractions: () => pointerInteractions,
      getKeyPresses: () => keyPresses,
    };
  };

  const setupIdleTimeout = (
    tripHoneypot,
    interactionTracking,
    timeoutMs = 120000,
  ) =>
    setTimeout(() => {
      if (
        !document.hidden &&
        interactionTracking.getPointerInteractions() === 0 &&
        interactionTracking.getKeyPresses() === 0
      ) {
        tripHoneypot(buildReason("honeypot", "no_user_interaction"), {
          category: "honeypot",
          event: "no_user_interaction",
        });
      }
    }, timeoutMs);

  const initRuntimeHoneypots = () => {
    if (runtimeAbortController) {
      runtimeAbortController.abort();
    }
    if (idleTimeoutId) {
      clearTimeout(idleTimeoutId);
      idleTimeoutId = null;
    }

    resolveRuntimeConfig();

    const controller = new AbortController();
    const { signal } = controller;
    runtimeAbortController = controller;

    loadDeferredImages();

    const { honeypots, decoyLinks } = queryHoneypotElements();
    const storage = createStorage();
    const tripHoneypot = createTripHoneypot(storage);

    attachHoneypotListeners(honeypots, tripHoneypot, signal);
    attachDecoyLinkListeners(decoyLinks, tripHoneypot, signal);

    const interactionTracking = setupUserInteractionTracking(
      tripHoneypot,
      signal,
    );

    idleTimeoutId = setupIdleTimeout(tripHoneypot, interactionTracking);
  };

  const bootstrap = () => initRuntimeHoneypots();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }

  document.addEventListener("astro:page-load", initRuntimeHoneypots);
})();

// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

/* eslint-env browser */
/* global sessionStorage, location */

(function () {
  let redirectScheduled = false;
  let redirectTarget = null;
  let readyState = null;
  let documentReadyCallbacks = [];

  const CONFIG_STORAGE_KEY = "__ASTRO_SHIELD_CONFIG_OVERRIDES__";

  const SHIELD_EVENTS = Object.freeze({
    unlocked: "astro-shield:unlocked",
    locked: "astro-shield:locked",
  });

  const whenDocumentReady = (callback) => {
    if (document.readyState === "loading") {
      documentReadyCallbacks.push(callback);
    } else {
      callback();
    }
  };

  const toggleDocumentState = (state) => {
    if (readyState === state) {
      return;
    }
    readyState = state;
    try {
      if (typeof window !== "undefined") {
        window.__ASTRO_SHIELD_READY__ = state;
      }
      if (typeof document !== "undefined") {
        document.documentElement.toggleAttribute(
          "data-astro-shield-ready",
          Boolean(state),
        );
        document.documentElement.toggleAttribute(
          "data-astro-shield-locked",
          !state,
        );
        const eventName = state
          ? SHIELD_EVENTS.unlocked
          : SHIELD_EVENTS.locked;
        document.dispatchEvent(
          new CustomEvent(eventName, {
            detail: { ready: state },
            bubbles: true,
          }),
        );
        if (state) {
          unlockManagedShieldBlocks();
        }
      }
    } catch (_error) {
      void _error;
    }
  };

  const setDocumentVisibility = (visible) => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.style.visibility = visible ? "visible" : "";
  };

  const SHIELD_BLOCK_SELECTOR = "[data-astro-shield-block]";
  const SHIELD_TEMPLATE_SELECTOR = "template[data-astro-shield-template]";
  const SHIELD_CONTENT_SELECTOR = "[data-astro-shield-content]";
  const managedShieldBlocks = new Map();

  const showContentHost = (contentHost) => {
    if (!contentHost) {
      return;
    }
    contentHost.hidden = false;
    contentHost.removeAttribute("hidden");
  };

  const unlockShieldBlock = (state) => {
    if (!state || state.unlocked) {
      return;
    }

    const { block, contentHost } = state;

    if (state.template) {
      try {
        const fragment = state.template.content.cloneNode(true);
        contentHost?.append(fragment);
      } catch (_error) {
        void _error;
      }
      state.template.remove();
      state.template = null;
    }

    if (block) {
      block.dataset.astroShieldUnlocked = "true";
    }

    showContentHost(contentHost);

    state.unlocked = true;
  };

  const ensureShieldBlock = (block) => {
    if (!(block instanceof HTMLElement) || managedShieldBlocks.has(block)) {
      return;
    }

    const template = block.querySelector(SHIELD_TEMPLATE_SELECTOR);
    const contentHost = block.querySelector(SHIELD_CONTENT_SELECTOR);

    const state = {
      block,
      template,
      contentHost,
      unlocked:
        block.dataset.astroShieldUnlocked === "true" ||
        !template ||
        !contentHost,
    };

    managedShieldBlocks.set(block, state);

    if (state.unlocked) {
      showContentHost(contentHost);
      return;
    }

    if (typeof window !== "undefined" && window.__ASTRO_SHIELD_READY__) {
      unlockShieldBlock(state);
    }
  };

  const scanShieldBlocks = () => {
    if (typeof document === "undefined") {
      return;
    }
    const blocks = document.querySelectorAll(SHIELD_BLOCK_SELECTOR);
    blocks.forEach((block) => ensureShieldBlock(block));
  };

  const unlockManagedShieldBlocks = () => {
    for (const state of managedShieldBlocks.values()) {
      unlockShieldBlock(state);
    }
  };

  const refreshShieldBlocks = () => {
    scanShieldBlocks();
    if (typeof window !== "undefined" && window.__ASTRO_SHIELD_READY__) {
      unlockManagedShieldBlocks();
    }
  };

  const setupShieldBlockObserver = () => {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          if (node.matches(SHIELD_BLOCK_SELECTOR)) {
            ensureShieldBlock(node);
          }
          const descendants = node.querySelectorAll?.(SHIELD_BLOCK_SELECTOR);
          if (descendants && descendants.length) {
            descendants.forEach((descendant) => ensureShieldBlock(descendant));
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  const getStorages = () => {
    if (typeof window === "undefined") {
      return [];
    }
    const storages = [];
    try {
      if (window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch (_error) {
      void _error;
    }
    try {
      if (window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch (_error) {
      void _error;
    }
    return storages;
  };

  const loadStoredOverrides = () => {
    for (const storage of getStorages()) {
      try {
        const raw = storage.getItem(CONFIG_STORAGE_KEY);
        if (!raw) {
          continue;
        }
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch (_error) {
        void _error;
      }
    }
    return {};
  };

  const persistOverrides = (overrides) => {
    try {
      const serialized = JSON.stringify(overrides);
      for (const storage of getStorages()) {
        try {
          storage.setItem(CONFIG_STORAGE_KEY, serialized);
        } catch (_error) {
          void _error;
        }
      }
    } catch (_error) {
      void _error;
    }
  };

  const scheduleRedirect = (url) => {
    redirectTarget = url;
    if (redirectScheduled) {
      return;
    }
    redirectScheduled = true;
    setTimeout(() => {
      try {
        if (redirectTarget) {
          location.replace(redirectTarget);
        }
      } finally {
        redirectTarget = null;
        redirectScheduled = false;
      }
    }, 50);
  };

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

  const sanitizePrefix = (value, fallback) => {
    if (typeof value !== "string") {
      return fallback;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return fallback;
    }
    const normalized = trimmed.replace(/[^a-z0-9_-]/g, "");
    return normalized || fallback;
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

  const existingConfig =
    (typeof window !== "undefined" && window.__ASTRO_SHIELD_CONFIG__) || {};

  const storedOverrides = loadStoredOverrides();
  const baseConfig = {
    ...existingConfig,
    ...storedOverrides,
  };

  const GATE_PATH = sanitizeGatePath(baseConfig.gatePath, "/gate");
  const PRODUCT_NAMESPACE = sanitizeNamespace(
    baseConfig.shieldNamespace,
    "as",
  );
  const HONEYPOT_PREFIX = sanitizePrefix(baseConfig.honeypotPrefix, "hp");
  const DECOY_PREFIX = sanitizePrefix(baseConfig.decoyPrefix, "dc");

  const resolvedConfig = {
    ...baseConfig,
    gatePath: GATE_PATH,
    shieldNamespace: PRODUCT_NAMESPACE,
    honeypotPrefix: HONEYPOT_PREFIX,
    decoyPrefix: DECOY_PREFIX,
  };

  const runtimeName = (value) => `${PRODUCT_NAMESPACE}_${value}`;

  if (
    resolvedConfig.autoHideRoot !== false &&
    typeof document !== "undefined"
  ) {
    setDocumentVisibility(false);
  }

  if (typeof window !== "undefined") {
    window.__ASTRO_SHIELD_CONFIG__ = resolvedConfig;
  }

  // Setup DOM-dependent features when ready
  whenDocumentReady(() => {
    setupShieldBlockObserver();
    refreshShieldBlocks();
  });

  toggleDocumentState(false);

  persistOverrides({
    gatePath: GATE_PATH,
    shieldNamespace: PRODUCT_NAMESPACE,
    honeypotPrefix: HONEYPOT_PREFIX,
    decoyPrefix: DECOY_PREFIX,
  });

  const SHIELD_STORAGE_KEYS = Object.freeze({
    token: runtimeName("gate_token_key_v1"),
    honeypotTripped: runtimeName("hp_tripped"),
    honeypotClicked: runtimeName("hp_clicked"),
    honeypotFocus: runtimeName("hp_focus"),
    honeypotReason: runtimeName("hp_reason"),
  });

  const TOKEN_KEY = SHIELD_STORAGE_KEYS.token;

  const storage = {
    get(key) {
      try {
        const value = localStorage.getItem(key);
        if (value !== null) return value;
      } catch (_error) {
        void _error;
      }
      try {
        return sessionStorage.getItem(key);
      } catch (_error) {
        void _error;
      }
      return null;
    },
    set(key, value) {
      let stored = false;
      try {
        localStorage.setItem(key, value);
        stored = true;
      } catch (_error) {
        void _error;
      }
      try {
        sessionStorage.setItem(key, value);
        stored = true;
      } catch (_error) {
        void _error;
      }
      return stored;
    },
    remove(key) {
      let removed = false;
      try {
        localStorage.removeItem(key);
        removed = true;
      } catch (_error) {
        void _error;
      }
      try {
        sessionStorage.removeItem(key);
        removed = true;
      } catch (_error) {
        void _error;
      }
      return removed;
    },
  };

  const exemptPaths = [GATE_PATH];

  const hasValidToken = () => {
    const raw = storage.get(TOKEN_KEY);
    if (!raw) return false;
    try {
      const tokenData = JSON.parse(raw);
      return Boolean(tokenData && tokenData.exp && tokenData.exp > Date.now());
    } catch {
      return false;
    }
  };

  const checkHoneypots = () => {
    const now = Date.now();
    const keys = [
      SHIELD_STORAGE_KEYS.honeypotTripped,
      SHIELD_STORAGE_KEYS.honeypotClicked,
      SHIELD_STORAGE_KEYS.honeypotFocus,
    ];
    for (const key of keys) {
      const raw = storage.get(key);
      if (!raw) continue;

      if (key === SHIELD_STORAGE_KEYS.honeypotTripped) {
        let timestamp = null;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.timestamp === "number") {
            timestamp = parsed.timestamp;
          }
        } catch {
          const numeric = Number(raw);
          if (!Number.isNaN(numeric)) {
            timestamp = numeric;
          }
        }

        if (timestamp && now - timestamp > 10 * 60 * 1000) {
          storage.remove(SHIELD_STORAGE_KEYS.honeypotTripped);
          storage.remove(SHIELD_STORAGE_KEYS.honeypotReason);
          continue;
        }
      }

      return true;
    }
    return false;
  };

  const isPathExempt = (currentPath, exemptPaths) =>
    exemptPaths.some(
      (path) => currentPath === path || currentPath.startsWith(path + "/"),
    );

  const buildGateRedirectUrl = (gatePath, currentPath, honeypotActive) => {
    const next = encodeURIComponent(currentPath + location.search);
    const separator = gatePath.includes("?") ? "&" : "?";
    return honeypotActive
      ? `${gatePath}${separator}hp=1&next=${next}`
      : `${gatePath}${separator}next=${next}`;
  };

  const runGateCheck = () => {
    const currentPath = location.pathname;

    if (isPathExempt(currentPath, exemptPaths)) {
      toggleDocumentState(false);
      setDocumentVisibility(true);
      return;
    }

    const honeypotActive = checkHoneypots();
    if (!hasValidToken() || honeypotActive) {
      toggleDocumentState(false);
      setDocumentVisibility(false);
      const gateUrl = buildGateRedirectUrl(
        GATE_PATH,
        currentPath,
        honeypotActive,
      );
      scheduleRedirect(gateUrl);
      return;
    }

    toggleDocumentState(true);
    setDocumentVisibility(true);
  };

  const handlePageLoad = () => {
    runGateCheck();
    refreshShieldBlocks();
  };

  // Handle initial DOM ready state
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Process any queued callbacks
      documentReadyCallbacks.forEach(callback => callback());
      documentReadyCallbacks = [];

      // Run initial gate check
      runGateCheck();
    });
  } else {
    // DOM is already ready, run check immediately
    runGateCheck();
  }

  // Listen for Astro navigation events
  whenDocumentReady(() => {
    document.addEventListener("astro:page-load", handlePageLoad);
    document.addEventListener("astro:after-swap", () => {
      refreshShieldBlocks();
      setDocumentVisibility(true);
    });
    document.addEventListener(SHIELD_EVENTS.unlocked, refreshShieldBlocks);
  });

  // Listen for unlock messages from gate iframe/window
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "astro-shield:gate-success") {
      // Re-check token and unlock if valid
      if (hasValidToken()) {
        toggleDocumentState(true);
        setDocumentVisibility(true);
      }
    }
  });
})();

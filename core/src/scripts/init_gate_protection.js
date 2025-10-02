// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

/* eslint-env browser */
/* global sessionStorage, location */

(function () {
  let redirectScheduled = false;
  let redirectTarget = null;

  const CONFIG_STORAGE_KEY = "__ASTRO_SHIELD_CONFIG_OVERRIDES__";

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
    document.documentElement.style.visibility = "hidden";
  }

  if (typeof window !== "undefined") {
    window.__ASTRO_SHIELD_CONFIG__ = resolvedConfig;
  }

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
      document.documentElement.style.visibility = "visible";
      return;
    }

    const honeypotActive = checkHoneypots();
    if (!hasValidToken() || honeypotActive) {
      const gateUrl = buildGateRedirectUrl(
        GATE_PATH,
        currentPath,
        honeypotActive,
      );
      scheduleRedirect(gateUrl);
      return;
    }

    document.documentElement.style.visibility = "visible";
  };

  runGateCheck();
  document.addEventListener("astro:page-load", runGateCheck);
  document.addEventListener("astro:after-swap", () => {
    document.documentElement.style.visibility = "visible";
  });
})();

// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

export interface ShieldConfig {
  redirectTo?: string;
  difficulty?: number;
  timeoutMs?: number;
  tokenTtlMinutes?: number;
  nearMissThreshold?: number;
  minAcceptable?: number;
  enableNearMisses?: boolean;
  honeypotPenalty?: number;
  maxPenaltyDiff?: number;
  enableHoneypots?: boolean;
  enableInputHoneypots?: boolean;
  enableLinkDecoys?: boolean;
  enableFinalCheck?: boolean;
  enableTimeValidation?: boolean;
  honeypotPrefix?: string;
  decoyPrefix?: string;
  shieldNamespace?: string;
  redirectDelayMs?: number;
  showProgress?: boolean;
  showDebugInfo?: boolean;
  minSolveDurationMs?: number;
}

export interface AstroShieldOptions {
  gatePath?: string;
  autoHideRoot?: boolean;
  shield?: ShieldConfig;
}

export interface AstroShieldResolvedOptions {
  gatePath: string;
  autoHideRoot: boolean;
  shield: ShieldConfig;
}

// Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
// Licensed under the MIT License. See LICENSE file for details.

export const GATE_STATUS = {
  INITIALIZING: "initializing",
  POW_START: "pow-start",
  POW_INCOMPLETE: "pow-incomplete",
  POW_COMPLETE: "pow-complete",
  REDIRECTING: "redirecting",
  ERROR: "error",
};

export const gateStatusDescriptors = {
  [GATE_STATUS.INITIALIZING]: {
    code: GATE_STATUS.INITIALIZING,
    message: "Preparing verification...",
    debug: true,
  },
  [GATE_STATUS.POW_START]: {
    code: GATE_STATUS.POW_START,
    message: "Solving security challenge...",
    debug: true,
  },
  [GATE_STATUS.POW_INCOMPLETE]: {
    code: GATE_STATUS.POW_INCOMPLETE,
    message: "Challenge incomplete. Please refresh and try again.",
    debug: true,
  },
  [GATE_STATUS.POW_COMPLETE]: {
    code: GATE_STATUS.POW_COMPLETE,
    message: "Verification complete!",
    debug: true,
  },
  [GATE_STATUS.REDIRECTING]: {
    code: GATE_STATUS.REDIRECTING,
    message: "Redirecting...",
    debug: false,
  },
  [GATE_STATUS.ERROR]: {
    code: GATE_STATUS.ERROR,
    message: "Unable to complete verification. Please refresh and try again.",
    debug: true,
  },
};

export const orderedGateStatusCodes = [
  GATE_STATUS.INITIALIZING,
  GATE_STATUS.POW_START,
  GATE_STATUS.POW_INCOMPLETE,
  GATE_STATUS.POW_COMPLETE,
  GATE_STATUS.REDIRECTING,
  GATE_STATUS.ERROR,
];

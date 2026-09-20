import {
  cardStorageKey as scopedStorageKey,
  readStoredItem,
} from "../../shared/persist";
import { CARD_NAME } from "./const";
import { isLightsHelperPayload, parseLightsState, serializeLightsState } from "./state";
import type { LightsCardState, StagedLightsCardConfig } from "./types";

export const lightsStorageKey = (
  config?: StagedLightsCardConfig,
  cardName = CARD_NAME,
): string => scopedStorageKey(cardName, config?.studio || config?.entity || config?.title);

export const readStoredLightsState = (key: string): LightsCardState | undefined => {
  try {
    const stored = readStoredItem(`${key}:state`);
    if (!stored) {
      return undefined;
    }
    return parseLightsState(stored);
  } catch {
    return undefined;
  }
};

export const resolveLightsState = (
  helperState: unknown,
  storageKey: string,
): LightsCardState => {
  if (typeof helperState === "string" && isLightsHelperPayload(helperState)) {
    return parseLightsState(helperState);
  }
  return readStoredLightsState(storageKey) ?? parseLightsState();
};

export const hasStoredLightsState = (
  helperState: unknown,
  storageKey: string,
): boolean => {
  if (typeof helperState === "string" && isLightsHelperPayload(helperState)) {
    return true;
  }
  try {
    return Boolean(readStoredItem(`${storageKey}:state`));
  } catch {
    return false;
  }
};

export const writeStoredLightsState = (key: string, state: LightsCardState): void => {
  try {
    globalThis.localStorage?.setItem(`${key}:state`, serializeLightsState(state));
  } catch {
    // Ignore quota / private-mode failures; the text helper still persists.
  }
};

import { storageKeyAliases } from "./card-ids";

export const cardStorageKey = (cardName: string, identity?: string): string =>
  `${cardName}:${identity || "default"}`;

export const readStoredItem = (key: string): string | null => {
  try {
    const store = globalThis.localStorage;
    if (!store) {
      return null;
    }
    for (const candidate of storageKeyAliases(key)) {
      const stored = store.getItem(candidate);
      if (stored != null) {
        return stored;
      }
    }
  } catch {
    return null;
  }
  return null;
};

export const readStoredOnOff = (
  key: string,
  suffix = "power",
): boolean | undefined => {
  try {
    const stored = readStoredItem(`${key}:${suffix}`);
    if (stored === "off") {
      return false;
    }
    if (stored === "on") {
      return true;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

export const writeStoredOnOff = (
  key: string,
  on: boolean,
  suffix = "power",
): void => {
  try {
    globalThis.localStorage?.setItem(`${key}:${suffix}`, on ? "on" : "off");
  } catch {
    // Ignore quota / private-mode failures; HA entity persistence still applies.
  }
};

export const readStoredNumber = (
  key: string,
  suffix = "stage",
): number | undefined => {
  try {
    const stored = readStoredItem(`${key}:${suffix}`);
    if (stored == null || stored === "") {
      return undefined;
    }
    const value = Number(stored);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const writeStoredNumber = (
  key: string,
  value: number,
  suffix = "stage",
): void => {
  try {
    globalThis.localStorage?.setItem(`${key}:${suffix}`, String(value));
  } catch {
    // Ignore quota / private-mode failures; helper entities still persist.
  }
};

import type { HomeAssistant } from "./types";

export const fireEvent = (
  node: HTMLElement,
  type: string,
  detail?: unknown,
): void => {
  node.dispatchEvent(
    new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const nestedMessage = (value: unknown): string => {
  if (typeof value !== "object" || !value) {
    return "";
  }
  const row = value as Record<string, unknown>;
  for (const candidate of [row.message, row.error, row.body]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return nestedMessage(row.body);
};

export const serviceErrorText = (error: unknown): string => {
  if (typeof error === "string") {
    return error.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return nestedMessage(error).trim();
};

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const CONNECTIVITY_RE =
  /bluetooth|\bble\b|proxy\/adapter|connection slot|no backend|failed to connect|not reachable|no longer reachable|never seen by any scanner|out of range|timed out/i;

export const isUnreachableError = (error: unknown): boolean =>
  CONNECTIVITY_RE.test(serviceErrorText(error));

export const friendlyActionError = (error: unknown, fallback: string): string => {
  const raw = serviceErrorText(error);
  if (isUnreachableError(error)) {
    return "Couldn't reach a device. Check power, range, or the Bluetooth proxy, then try again.";
  }
  if (
    raw &&
    raw.length <= 140 &&
    !/[0-9A-F]{2}(?::[0-9A-F]{2}){4,}/i.test(raw) &&
    !/https?:\/\//i.test(raw)
  ) {
    return raw;
  }
  return fallback;
};

export const callHassService = (
  hass: HomeAssistant,
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>,
  target?: { entity_id?: string | string[] },
): Promise<unknown> => {
  if (hass.callWS) {
    return hass.callWS({
      type: "call_service",
      domain,
      service,
      service_data: serviceData ?? {},
      ...(target ? { target } : {}),
    });
  }
  return hass.callService(domain, service, serviceData, target, false);
};

export const withTimeout = <T>(
  task: Promise<T>,
  ms: number,
  message: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
};

export const relevantHassChanged = (
  oldHass: HomeAssistant | undefined,
  hass: HomeAssistant | undefined,
  entityIds: string[],
): boolean => {
  if (!oldHass || !hass) {
    return true;
  }
  return entityIds.some(
    (entityId) => oldHass.states[entityId] !== hass.states[entityId],
  );
};

const EDITOR_HOSTS = new Set([
  "hui-dialog-edit-card",
  "hui-card-element-editor",
  "hui-card-preview",
]);

export const isInEditorPreview = (start: Node): boolean => {
  let node: Node | null = start;
  for (let i = 0; i < 24 && node; i += 1) {
    if (EDITOR_HOSTS.has((node as HTMLElement).localName)) {
      return true;
    }
    const root = node.getRootNode();
    node =
      (node as HTMLElement).parentElement ??
      (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot
        ? root.host
        : null);
  }
  return false;
};

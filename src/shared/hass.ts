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

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

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

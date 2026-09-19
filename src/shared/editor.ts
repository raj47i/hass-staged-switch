import { isToggleEntity, isValidEntityId, normalizeSwitch } from "./entities";
import { fireEvent } from "./hass";
import type { HomeAssistant, SwitchEntityConfig } from "./types";

export const fireConfigChanged = <T>(host: HTMLElement, config: T): void => {
  fireEvent(host, "config-changed", { config });
};

export const pickedValue = (ev: Event): string => {
  const detail = (ev as CustomEvent<{ value?: string }>).detail?.value;
  const targetValue = (ev.target as HTMLSelectElement | undefined)?.value;
  const value = typeof detail === "string" ? detail : targetValue;
  return typeof value === "string" ? value : "";
};

export const appendUniqueEntities = (
  roster: SwitchEntityConfig[],
  entityIds: string[],
  hass?: HomeAssistant,
): { roster: SwitchEntityConfig[]; added: boolean } => {
  const next = roster.filter((item) => isValidEntityId(item.entity));
  const have = new Set(next.map((item) => item.entity));
  let added = false;
  entityIds.forEach((entityId) => {
    if (
      hass &&
      isValidEntityId(entityId) &&
      isToggleEntity(hass, entityId) &&
      !have.has(entityId)
    ) {
      next.push(normalizeSwitch(entityId));
      have.add(entityId);
      added = true;
    }
  });
  return { roster: next, added };
};

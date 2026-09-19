import { CONTROL_DOMAINS, ENTITY_ID_PATTERN } from "./const";
import type {
  HassEntity,
  HideableRoster,
  HomeAssistant,
  SwitchEntityConfig,
  SwitchState,
  SwitchTarget,
} from "./types";

export const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? value.filter((item): item is T => item != null) : [];

export const safeIcon = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const icon = value.trim();
  return icon || fallback;
};

export const isValidEntityId = (entityId?: string): entityId is string =>
  Boolean(entityId && ENTITY_ID_PATTERN.test(entityId));

export const domainOf = (entityId?: string): string =>
  entityId?.split(".", 1)[0] ?? "";

const TOGGLE_STATES = new Set(["on", "off", "unavailable", "unknown"]);

const isControlEntity = (entityId: string): boolean =>
  CONTROL_DOMAINS.includes(domainOf(entityId));

export const isLightEntity = (entityId: string): boolean =>
  domainOf(entityId) === "light";

const RGB_COLOR_MODES = new Set(["rgb", "rgbw", "rgbww", "hs", "xy"]);

export const isRgbCapableLight = (
  hass: HomeAssistant | undefined,
  entityId: string,
): boolean => {
  if (!isValidEntityId(entityId) || !isLightEntity(entityId)) {
    return false;
  }
  const stateObj = hass?.states[entityId];
  if (!stateObj) {
    return true;
  }
  const modes = stateObj.attributes.supported_color_modes;
  if (Array.isArray(modes) && modes.some((mode) => RGB_COLOR_MODES.has(String(mode)))) {
    return true;
  }
  return Boolean(
    stateObj.attributes.rgb_color ||
      stateObj.attributes.hs_color ||
      stateObj.attributes.xy_color,
  );
};

export const isToggleEntity = (
  hass: HomeAssistant,
  entityId: string,
): boolean => {
  if (!isValidEntityId(entityId) || !isControlEntity(entityId)) {
    return false;
  }
  const entry = hass.entities?.[entityId];
  if (entry?.hidden || entry?.disabled_by || entry?.entity_category) {
    return false;
  }
  const domain = domainOf(entityId);
  const services = hass.services?.[domain];
  if (services && (!services.turn_on || !services.turn_off)) {
    return false;
  }
  const stateObj = hass.states[entityId];
  if (!stateObj) {
    return true;
  }
  return TOGGLE_STATES.has(stateObj.state);
};

export const entityAreaId = (
  hass: HomeAssistant,
  entityId: string,
): string | undefined => {
  const entry = hass.entities?.[entityId];
  if (entry?.area_id) {
    return entry.area_id;
  }
  if (entry?.device_id) {
    return hass.devices?.[entry.device_id]?.area_id ?? undefined;
  }
  return undefined;
};

export const entitiesFromArea = (
  hass: HomeAssistant,
  areaId: string,
): string[] => {
  if (!areaId || typeof areaId !== "string") {
    return [];
  }
  return Object.keys(hass.states)
    .filter((entityId) => isToggleEntity(hass, entityId))
    .filter((entityId) => entityAreaId(hass, entityId) === areaId)
    .sort();
};

export const entitiesFromDevice = (
  hass: HomeAssistant,
  deviceId: string,
): string[] => {
  if (!deviceId || typeof deviceId !== "string") {
    return [];
  }
  return Object.keys(hass.states)
    .filter((entityId) => isToggleEntity(hass, entityId))
    .filter((entityId) => hass.entities?.[entityId]?.device_id === deviceId)
    .sort();
};

const DOMAIN_ICONS: Record<string, string> = {
  switch: "mdi:toggle-switch",
  light: "mdi:lightbulb",
  fan: "mdi:fan",
  input_boolean: "mdi:toggle-switch",
  cover: "mdi:window-shutter",
  climate: "mdi:thermostat",
  media_player: "mdi:cast",
  lock: "mdi:lock",
};

export const entityIcon = (
  target: Pick<SwitchTarget, "entity" | "icon">,
  stateObj?: HassEntity,
): string =>
  target.icon ||
  stateObj?.attributes.icon ||
  DOMAIN_ICONS[domainOf(target.entity)] ||
  "mdi:power";

const isOn = (value: string | undefined): boolean =>
  value === "on" || value === "true" || value === "1";

export const normalizeState = (value: unknown): SwitchState =>
  isOn(String(value).toLowerCase()) ? "on" : "off";

export const friendlyNameFromEntity = (entityId: string): string => {
  const objectId = entityId.split(".")[1] ?? entityId;
  return objectId
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const entityDisplayName = (
  hass: HomeAssistant | undefined,
  entityId: string,
  fallback?: string,
): string =>
  fallback ||
  hass?.states[entityId]?.attributes.friendly_name ||
  friendlyNameFromEntity(entityId) ||
  entityId;

export const normalizeSwitch = (
  value: string | SwitchEntityConfig | null | undefined,
): SwitchEntityConfig => {
  if (typeof value === "string") {
    return { entity: value, name: friendlyNameFromEntity(value) };
  }
  const entity = typeof value?.entity === "string" ? value.entity : "";
  return {
    entity,
    name: value?.name ?? friendlyNameFromEntity(entity),
    icon: safeIcon(value?.icon) || undefined,
    ...(value?.hide ? { hide: true } : {}),
  };
};

export const isRosterEntity = (item: SwitchEntityConfig): boolean =>
  item.entity === "" || isValidEntityId(item.entity);

export const switchEntry = (
  roster: HideableRoster | undefined,
  entityId: string,
): SwitchEntityConfig | undefined => {
  const raw = asArray<string | SwitchEntityConfig>(roster?.switches).find((item) => {
    if (typeof item === "string") {
      return item === entityId;
    }
    return item?.entity === entityId;
  });
  if (!raw || typeof raw === "string") {
    return undefined;
  }
  return raw;
};

export const isEntityHidden = (
  roster: HideableRoster | undefined,
  entityId: string,
): boolean => Boolean(switchEntry(roster, entityId)?.hide);

export const visibleCardEntities = (
  roster: HideableRoster | undefined,
  entities: SwitchTarget[],
): SwitchTarget[] =>
  entities.filter((item) => !isEntityHidden(roster, item.entity));

export const entityStateLabel = (state?: string): string => {
  if (!state || state === "unavailable" || state === "unknown") {
    return state || "missing";
  }
  return state === "on" ? "on" : "off";
};

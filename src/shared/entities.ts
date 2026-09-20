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

export const isValidEntityId = (
  entityId?: string | null,
): entityId is string => Boolean(entityId && ENTITY_ID_PATTERN.test(entityId));

export const uniqueEntityIds = (ids: Iterable<string | undefined | null>): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entityId of ids) {
    if (!isValidEntityId(entityId) || seen.has(entityId)) {
      continue;
    }
    seen.add(entityId);
    next.push(entityId);
  }
  return next;
};

export const domainOf = (entityId?: string): string =>
  entityId?.split(".", 1)[0] ?? "";

const TOGGLE_STATES = new Set(["on", "off", "unavailable", "unknown"]);

const isControlEntity = (entityId: string): boolean =>
  CONTROL_DOMAINS.includes(domainOf(entityId));

export const isLightEntity = (entityId: string): boolean =>
  domainOf(entityId) === "light";

export type LightAdjustKind = "rgb" | "hs" | "temp" | "brightness" | "onoff";

const RGB_COLOR_MODES = new Set(["rgb", "rgbw", "rgbww", "xy"]);
const HS_COLOR_MODES = new Set(["hs"]);
const TEMP_COLOR_MODES = new Set(["color_temp"]);
const BRIGHT_COLOR_MODES = new Set(["brightness", "white"]);

const modeList = (stateObj?: { attributes?: Record<string, unknown> }): string[] => {
  const modes = stateObj?.attributes?.supported_color_modes;
  return Array.isArray(modes) ? modes.map((mode) => String(mode)) : [];
};

const hasMode = (modes: string[], set: Set<string>): boolean =>
  modes.some((mode) => set.has(mode));

export const lightAdjustKind = (
  hass: HomeAssistant | undefined,
  entityId: string,
): LightAdjustKind => {
  if (!isValidEntityId(entityId) || !isLightEntity(entityId)) {
    return "onoff";
  }
  const stateObj = hass?.states[entityId];
  if (!stateObj) {
    return "rgb";
  }
  const modes = modeList(stateObj);
  if (modes.length) {
    if (hasMode(modes, RGB_COLOR_MODES)) {
      return "rgb";
    }
    if (hasMode(modes, HS_COLOR_MODES)) {
      return "hs";
    }
    if (hasMode(modes, TEMP_COLOR_MODES)) {
      return "temp";
    }
    if (hasMode(modes, BRIGHT_COLOR_MODES)) {
      return "brightness";
    }
    return "onoff";
  }
  if (stateObj.attributes.rgb_color || stateObj.attributes.xy_color) {
    return "rgb";
  }
  if (stateObj.attributes.hs_color) {
    return "hs";
  }
  if (
    stateObj.attributes.color_temp != null ||
    stateObj.attributes.color_temp_kelvin != null
  ) {
    return "temp";
  }
  if (stateObj.attributes.brightness != null) {
    return "brightness";
  }
  return "onoff";
};

export const rosterAdjustKind = (
  hass: HomeAssistant | undefined,
  entityIds: string[] = [],
): LightAdjustKind => {
  const kinds = entityIds
    .filter((entityId) => isValidEntityId(entityId) && isLightEntity(entityId))
    .map((entityId) => lightAdjustKind(hass, entityId));
  if (kinds.includes("rgb")) {
    return "rgb";
  }
  if (kinds.includes("hs")) {
    return "hs";
  }
  if (kinds.includes("temp")) {
    return "temp";
  }
  if (kinds.includes("brightness")) {
    return "brightness";
  }
  return kinds.length ? "onoff" : "rgb";
};

export const isRgbCapableLight = (
  hass: HomeAssistant | undefined,
  entityId: string,
): boolean => lightAdjustKind(hass, entityId) === "rgb";

export const isAdjustableLight = (
  hass: HomeAssistant | undefined,
  entityId: string,
): boolean => isLightEntity(entityId) && lightAdjustKind(hass, entityId) !== "onoff";

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

const trimmedName = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const name = value.trim();
  return name || undefined;
};

const registryDisplayName = (
  hass: HomeAssistant | undefined,
  entityId: string,
): string | undefined => {
  const entry = hass?.entities?.[entityId];
  const device = entry?.device_id ? hass?.devices?.[entry.device_id] : undefined;
  return (
    trimmedName(entry?.name) ||
    trimmedName(hass?.states[entityId]?.attributes.friendly_name) ||
    trimmedName(entry?.original_name) ||
    trimmedName(device?.name_by_user) ||
    trimmedName(device?.name)
  );
};

export const generatedEntityLabel = (entityId: string): string => {
  const [domain, objectId] = entityId.split(".");
  if (!objectId) {
    return friendlyNameFromEntity(entityId);
  }
  return `${domain.charAt(0).toUpperCase()}${domain.slice(1)} ${objectId}`;
};

export const isGeneratedEntityLabel = (
  name: string | undefined,
  entityId: string,
  liveName?: string,
): boolean => {
  const label = name?.trim();
  if (!label) {
    return true;
  }
  return (
    label === liveName ||
    label === friendlyNameFromEntity(entityId) ||
    label === generatedEntityLabel(entityId) ||
    label === entityId
  );
};

export const entityDisplayName = (
  hass: HomeAssistant | undefined,
  entityId: string,
  fallback?: string,
): string =>
  trimmedName(fallback) ||
  registryDisplayName(hass, entityId) ||
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

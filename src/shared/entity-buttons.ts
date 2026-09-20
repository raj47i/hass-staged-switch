import { uniqueEntityIds } from "./entities";
import type { SwitchEntityConfig } from "./types";

export const SHOW_ENTITY_BUTTONS_LABEL = "Show entity buttons";

export type EntityButtonsConfig = {
  studio?: string;
  show_switches?: boolean;
  hidden_entities?: string[];
};

export const checkboxChecked = (ev: Event): boolean => {
  const target = (ev.currentTarget ?? ev.target) as { checked?: boolean } | null;
  return Boolean(target?.checked);
};

export const hiddenEntityIds = (config?: EntityButtonsConfig): string[] =>
  uniqueEntityIds(config?.hidden_entities ?? []);

export const showsEntityButtons = (
  config?: EntityButtonsConfig,
  whenManual = false,
): boolean => {
  if (!config) {
    return false;
  }
  if (config.studio) {
    return config.show_switches === true;
  }
  return whenManual ? config.show_switches !== false : Boolean(config.show_switches);
};

export const pruneHiddenEntities = (
  hidden: Iterable<string | undefined | null>,
  roster: Iterable<string | undefined | null>,
): string[] => {
  const keep = new Set(uniqueEntityIds(roster));
  return uniqueEntityIds(hidden).filter((entityId) => keep.has(entityId));
};

export const toggleHiddenEntity = (
  hidden: Iterable<string | undefined | null>,
  entityId: string,
  visible: boolean,
  roster: Iterable<string | undefined | null>,
): string[] | undefined => {
  const next = new Set(pruneHiddenEntities(hidden, roster));
  const ids = uniqueEntityIds(roster);
  if (!ids.includes(entityId)) {
    return next.size ? [...next] : undefined;
  }
  if (visible) {
    next.delete(entityId);
  } else {
    next.add(entityId);
  }
  return next.size ? [...next] : undefined;
};

export const overlayHiddenEntities = (
  entities: Array<string | SwitchEntityConfig | undefined>,
  hidden: Iterable<string | undefined | null> = [],
): SwitchEntityConfig[] => {
  const hide = new Set(uniqueEntityIds(hidden));
  return uniqueEntityIds(
    entities.map((item) => (typeof item === "string" ? item : item?.entity)),
  ).map((entity) => ({
    entity,
    hide: hide.has(entity) || undefined,
  }));
};

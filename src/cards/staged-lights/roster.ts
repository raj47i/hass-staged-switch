import {
  asArray,
  isValidEntityId,
  normalizeSwitch,
  visibleCardEntities,
} from "../../shared/entities";
import type { SwitchEntityConfig, SwitchTarget } from "../../shared/types";
import { MIN_WARM_WHITE_ENTITIES, ROW_ORDER } from "./const";
import type { LightRowId, StagedLightsCardConfig } from "./types";

export const rowRoster = (
  config: StagedLightsCardConfig | undefined,
  row: LightRowId,
): SwitchEntityConfig[] =>
  asArray<string | SwitchEntityConfig>(config?.[row])
    .map(normalizeSwitch)
    .filter((item) => isValidEntityId(item.entity));

export const allRosterItems = (config?: StagedLightsCardConfig): SwitchEntityConfig[] => {
  const seen = new Set<string>();
  const items: SwitchEntityConfig[] = [];
  ROW_ORDER.forEach((row) => {
    rowRoster(config, row).forEach((item) => {
      if (seen.has(item.entity)) {
        return;
      }
      seen.add(item.entity);
      items.push(item);
    });
  });
  return items;
};

export const visibleLights = (config?: StagedLightsCardConfig): SwitchTarget[] => {
  const items = configuredRosterItems(config);
  return visibleCardEntities(
    { switches: items },
    items.map((item) => ({
      entity: item.entity,
      name: item.name,
      icon: item.icon,
      state: "off" as const,
    })),
  );
};

export const allLightIds = (config?: StagedLightsCardConfig): string[] =>
  allRosterItems(config).map((item) => item.entity);

export const rowIsConfigured = (
  config: StagedLightsCardConfig | undefined,
  row: LightRowId,
): boolean => {
  const count = rowRoster(config, row).length;
  return row === "rgb" ? count > 0 : count >= MIN_WARM_WHITE_ENTITIES;
};

export const configuredRosterItems = (
  config?: StagedLightsCardConfig,
): SwitchEntityConfig[] => {
  const seen = new Set<string>();
  const items: SwitchEntityConfig[] = [];
  ROW_ORDER.forEach((row) => {
    if (!rowIsConfigured(config, row)) {
      return;
    }
    rowRoster(config, row).forEach((item) => {
      if (seen.has(item.entity)) {
        return;
      }
      seen.add(item.entity);
      items.push(item);
    });
  });
  return items;
};

export const isEmptyLightsConfig = (config?: StagedLightsCardConfig): boolean =>
  !config || !ROW_ORDER.some((row) => rowIsConfigured(config, row));

export const relevantLightEntityIds = (config?: StagedLightsCardConfig): string[] => {
  if (!config) {
    return [];
  }
  const ids = new Set(allLightIds(config));
  if (isValidEntityId(config.entity)) {
    ids.add(config.entity);
  }
  return Array.from(ids);
};

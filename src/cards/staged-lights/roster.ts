import {
  isValidEntityId,
  normalizeSwitch,
  visibleCardEntities,
} from "../../shared/entities";
import type { SwitchEntityConfig, SwitchTarget } from "../../shared/types";
import { ROW_ORDER } from "./const";
import type { LightRowId, StagedLightsCardConfig } from "./types";

export const rowRoster = (
  config: StagedLightsCardConfig | undefined,
  row: LightRowId,
): SwitchEntityConfig[] =>
  (config?.[row] ?? [])
    .map(normalizeSwitch)
    .filter((item) => isValidEntityId(item.entity));

export const rowTargets = (
  config: StagedLightsCardConfig | undefined,
  row: LightRowId,
): SwitchTarget[] =>
  rowRoster(config, row).map((item) => ({
    entity: item.entity,
    name: item.name,
    icon: item.icon,
    state: "off" as const,
  }));

export const visibleRowTargets = (
  config: StagedLightsCardConfig | undefined,
  row: LightRowId,
): SwitchTarget[] =>
  visibleCardEntities({ switches: config?.[row] }, rowTargets(config, row));

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

export const allLightTargets = (config?: StagedLightsCardConfig): SwitchTarget[] =>
  allRosterItems(config).map((item) => ({
    entity: item.entity,
    name: item.name,
    icon: item.icon,
    state: "off" as const,
  }));

export const visibleLights = (config?: StagedLightsCardConfig): SwitchTarget[] =>
  visibleCardEntities({ switches: allRosterItems(config) }, allLightTargets(config));

export const allLightIds = (config?: StagedLightsCardConfig): string[] =>
  allRosterItems(config).map((item) => item.entity);

export const isEmptyLightsConfig = (config?: StagedLightsCardConfig): boolean =>
  !config || !allLightIds(config).length;

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

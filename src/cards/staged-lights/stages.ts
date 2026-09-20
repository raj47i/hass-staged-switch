import { clamp } from "../../shared/hass";
import { chunkEvenly } from "../../shared/layout";
import {
  asArray,
  friendlyNameFromEntity,
  isLightEntity,
  isValidEntityId,
  normalizeState,
  safeIcon,
} from "../../shared/entities";
import type { SwitchEntityConfig, SwitchState, SwitchTarget } from "../../shared/types";
import { showsEntityButtons } from "../../shared/entity-buttons";
import { isEmptyLightsConfig, rowIsConfigured, rowRoster, visibleLights } from "./roster";
import {
  DEFAULT_LIGHT_STAGES,
  INTENSITY_NAMES,
  MAX_LIGHT_STAGES,
  MAX_TWO_ENTITY_STAGES,
  MIN_LIGHT_STAGES,
  MIN_WARM_WHITE_ENTITIES,
  ROW_ORDER,
} from "./const";
import type {
  LightRowId,
  LightStageConfig,
  StagedLightsCardConfig,
} from "./types";

export type StageRowId = "warm" | "white";

export const rowStageMaps = (
  config: StagedLightsCardConfig | undefined,
  row: StageRowId,
): LightStageConfig[] =>
  asArray<LightStageConfig>(row === "warm" ? config?.warm_stages : config?.white_stages).filter(
    (item) => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );

export const maxRowStages = (
  config: StagedLightsCardConfig | undefined,
  row: StageRowId,
): number => {
  const mapped = rowStageMaps(config, row).length;
  if (config?.studio && mapped > 0) {
    return mapped;
  }
  const entities = rowRoster(config, row).length;
  if (entities < MIN_WARM_WHITE_ENTITIES) {
    return 0;
  }
  return entities === 2 ? MAX_TWO_ENTITY_STAGES : MAX_LIGHT_STAGES;
};

export const lightsStageCount = (
  config?: StagedLightsCardConfig,
  row?: StageRowId,
): number => {
  if (!row) {
    const configured = Number(config?.stages);
    if (Number.isFinite(configured) && configured > 0) {
      return clamp(Math.round(configured), MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
    }
    return DEFAULT_LIGHT_STAGES;
  }
  const cap = maxRowStages(config, row);
  if (cap < MIN_LIGHT_STAGES) {
    return MIN_LIGHT_STAGES;
  }
  const mapped = rowStageMaps(config, row).length;
  if (mapped >= MIN_LIGHT_STAGES) {
    return clamp(mapped, MIN_LIGHT_STAGES, cap);
  }
  const configured = Number(config?.stages);
  if (Number.isFinite(configured) && configured > 0) {
    return clamp(Math.round(configured), MIN_LIGHT_STAGES, cap);
  }
  return cap;
};

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const intensityNames = (count: number): string[] => {
  const stages = clamp(finiteOr(count, DEFAULT_LIGHT_STAGES), MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
  return INTENSITY_NAMES[stages] ?? INTENSITY_NAMES[DEFAULT_LIGHT_STAGES] ?? [];
};

export const intensityName = (stage: number, count: number): string => {
  const names = intensityNames(count);
  return names[clamp(Math.round(finiteOr(stage, 1)), 1, names.length) - 1] ?? names[0] ?? "Min";
};

export const configuredStageNames = (
  config: StagedLightsCardConfig | undefined,
  row: StageRowId,
): string[] => {
  const count = lightsStageCount(config, row);
  const fallback = intensityNames(count);
  const named = rowStageMaps(config, row);
  return fallback.map((name, index) => named[index]?.name?.trim() || name);
};

export const parseRgbPercent = (value: unknown): number | undefined => {
  const percent = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(percent)) {
    return undefined;
  }
  return clamp(Math.round(percent), 1, 100);
};

export const displayRgbPercent = (brightness: number, dragPercent?: number): number =>
  parseRgbPercent(dragPercent) ?? brightnessToPercent(brightness);

export const lightsLayoutRows = (config?: StagedLightsCardConfig): number => {
  if (isEmptyLightsConfig(config)) {
    return 4;
  }
  const rgbExtra = rowRoster(config, "rgb").length ? 1 : 0;
  const chipRows = showsEntityButtons(config)
    ? chunkEvenly(visibleLights(config)).length
    : 0;
  return 1 + configuredRows(config).length + rgbExtra + chipRows;
};

export const stageToBrightness = (stage: number, count: number): number => {
  const stages = clamp(finiteOr(count, DEFAULT_LIGHT_STAGES), MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
  return Math.round((clamp(finiteOr(stage, 1), 1, stages) / stages) * 255);
};

export const brightnessToPercent = (brightness: number): number =>
  clamp(Math.round((clamp(finiteOr(brightness, 1), 1, 255) / 255) * 100), 1, 100);

export const percentToBrightness = (percent: number): number =>
  clamp(Math.round((clamp(finiteOr(percent, 1), 1, 100) / 100) * 255), 1, 255);

export const configuredRows = (config?: StagedLightsCardConfig): LightRowId[] =>
  ROW_ORDER.filter((row) => rowIsConfigured(config, row));

export const splitRowIds = (
  entityIds: string[],
): { lights: string[]; switches: string[] } => {
  const lights: string[] = [];
  const switches: string[] = [];
  entityIds.forEach((entityId) => {
    if (!isValidEntityId(entityId)) {
      return;
    }
    if (isLightEntity(entityId)) {
      lights.push(entityId);
      return;
    }
    switches.push(entityId);
  });
  return { lights, switches };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const stageSwitchRows = (
  stage?: LightStageConfig,
): Array<{ entity: string; state: SwitchState }> => {
  const switches = stage?.switches;
  if (!switches || typeof switches !== "object") {
    return [];
  }
  if (Array.isArray(switches)) {
    return asArray(switches)
      .map((item) => {
        if (typeof item === "string") {
          return { entity: item, state: "on" as const };
        }
        const row = asRecord(item);
        return {
          entity: typeof row.entity === "string" ? row.entity : "",
          state: normalizeState(row.state),
        };
      })
      .filter((item) => isValidEntityId(item.entity));
  }
  return Object.entries(switches)
    .filter(([entity]) => isValidEntityId(entity))
    .map(([entity, state]) => ({
      entity,
      state: normalizeState(state),
    }));
};

const targetsFromStageSwitches = (
  switches: LightStageConfig["switches"],
): SwitchTarget[] => {
  if (!switches || typeof switches !== "object") {
    return [];
  }
  if (Array.isArray(switches)) {
    return asArray(switches)
      .map((item) => {
        if (typeof item === "string") {
          return {
            entity: item,
            name: friendlyNameFromEntity(item),
            state: "on" as const,
          };
        }
        const row = asRecord(item);
        const entity = typeof row.entity === "string" ? row.entity : "";
        return {
          entity,
          name: typeof row.name === "string" ? row.name : friendlyNameFromEntity(entity),
          icon: safeIcon(row.icon) || undefined,
          state: normalizeState(row.state),
        };
      })
      .filter((item) => isValidEntityId(item.entity));
  }
  return Object.entries(switches)
    .filter(([entity]) => isValidEntityId(entity))
    .map(([entity, state]) => ({
      entity,
      name: friendlyNameFromEntity(entity),
      state: normalizeState(state),
    }));
};

const stageEntityState = (
  stage: LightStageConfig | undefined,
  entityId: string,
  entityIndex: number,
  stageIndex: number,
): SwitchState => {
  const rows = stageSwitchRows(stage);
  if (!rows.length) {
    return entityIndex <= stageIndex ? "on" : "off";
  }
  return rows.find((row) => row.entity === entityId)?.state ?? "off";
};

export const alignedStageMaps = (
  config: StagedLightsCardConfig | undefined,
  row: StageRowId,
  roster?: SwitchEntityConfig[],
  count = lightsStageCount(config, row),
): LightStageConfig[] => {
  const names = intensityNames(count);
  const existing = rowStageMaps(config, row);
  const entities = (roster ?? rowRoster(config, row)).filter((item) =>
    isValidEntityId(item.entity),
  );
  return names.map((name, index) => ({
    name:
      typeof existing[index]?.name === "string" && existing[index].name.trim()
        ? existing[index].name.trim()
        : name,
    icon: safeIcon(existing[index]?.icon) || undefined,
    switches: entities.map((item, entityIndex) => ({
      entity: item.entity,
      state: stageEntityState(existing[index], item.entity, entityIndex, index),
    })),
  }));
};

export const resolveRowStageTargets = (
  config: StagedLightsCardConfig | undefined,
  row: StageRowId,
  stage: number,
): SwitchTarget[] => {
  const roster = rowRoster(config, row);
  const count = lightsStageCount(config, row);
  const index = clamp(Math.round(finiteOr(stage, 1)), 1, count) - 1;
  const map = rowStageMaps(config, row)[index];
  const specified = new Map(
    targetsFromStageSwitches(map?.switches).map((target) => [
      target.entity,
      target.state,
    ]),
  );
  if (specified.size) {
    return roster.map((item) => ({
      entity: item.entity,
      name: item.name,
      icon: item.icon,
      state: specified.get(item.entity) ?? "off",
    }));
  }
  return roster.map((item, entityIndex) => ({
    entity: item.entity,
    name: item.name,
    icon: item.icon,
    state: entityIndex <= index ? "on" : "off",
  }));
};

export const splitStageTargets = (
  targets: SwitchTarget[],
): { onLights: string[]; rest: SwitchTarget[] } => {
  const onLights: string[] = [];
  const rest: SwitchTarget[] = [];
  targets.forEach((target) => {
    if (!isValidEntityId(target.entity)) {
      return;
    }
    if (target.state === "on" && isLightEntity(target.entity)) {
      onLights.push(target.entity);
      return;
    }
    rest.push(target);
  });
  return { onLights, rest };
};

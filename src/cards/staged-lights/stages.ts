import { clamp } from "../../shared/hass";
import { isLightEntity, isValidEntityId } from "../../shared/entities";
import { rowRoster } from "./roster";
import {
  DEFAULT_LIGHT_STAGES,
  INTENSITY_NAMES,
  MAX_LIGHT_STAGES,
  MIN_LIGHT_STAGES,
} from "./const";
import type { LightRowId, StagedLightsCardConfig } from "./types";

export const lightsStageCount = (config?: StagedLightsCardConfig): number => {
  const configured = Number(config?.stages);
  if (Number.isFinite(configured) && configured > 0) {
    return clamp(Math.round(configured), MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
  }
  const largest = Math.max(
    rowRoster(config, "warm").length,
    rowRoster(config, "white").length,
    DEFAULT_LIGHT_STAGES,
  );
  return clamp(largest, MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
};

export const intensityNames = (count: number): string[] => {
  const stages = clamp(count, MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
  return INTENSITY_NAMES[stages] ?? INTENSITY_NAMES[DEFAULT_LIGHT_STAGES] ?? [];
};

export const intensityName = (stage: number, count: number): string => {
  const names = intensityNames(count);
  return names[clamp(stage, 1, names.length) - 1] ?? names[0] ?? "Dim";
};

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const stageToBrightness = (stage: number, count: number): number => {
  const stages = clamp(finiteOr(count, DEFAULT_LIGHT_STAGES), MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
  return Math.round((clamp(finiteOr(stage, 1), 1, stages) / stages) * 255);
};

export const brightnessToPercent = (brightness: number): number =>
  clamp(Math.round((clamp(finiteOr(brightness, 1), 1, 255) / 255) * 100), 1, 100);

export const percentToBrightness = (percent: number): number =>
  clamp(Math.round((clamp(finiteOr(percent, 1), 1, 100) / 100) * 255), 1, 255);

export const configuredRows = (config?: StagedLightsCardConfig): LightRowId[] =>
  (["rgb", "warm", "white"] as const).filter((row) => rowRoster(config, row).length > 0);

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

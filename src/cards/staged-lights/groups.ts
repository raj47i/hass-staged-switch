import { clamp } from "../../shared/hass";
import type {
  LightsCardState,
  LightsGroupMode,
  StagedLightsCardConfig,
} from "./types";

export const lightsGroupModes = (
  config?: StagedLightsCardConfig,
): LightsGroupMode[] => {
  const modes = [...(config?.groups ?? []), ...(config?.looks ?? [])];
  return modes.filter((mode) => {
    if (!mode?.id?.trim()) {
      return false;
    }
    const stages = (mode.stages ?? []).filter((stage) => Boolean(stage.scene));
    return Boolean(mode.scene || stages.length);
  });
};

export const hasLightsGroups = (config?: StagedLightsCardConfig): boolean =>
  lightsGroupModes(config).length > 0;

export const findLightsGroup = (
  config: StagedLightsCardConfig | undefined,
  id?: string,
): LightsGroupMode | undefined =>
  id ? lightsGroupModes(config).find((mode) => mode.id === id) : undefined;

export const lightsGroupStageCount = (mode?: LightsGroupMode): number => {
  const stages = (mode?.stages ?? []).filter((stage) => stage.scene || stage.name);
  if (stages.length) {
    return stages.length;
  }
  return mode?.scene ? 1 : 0;
};

export const lightsGroupStageNames = (mode?: LightsGroupMode): string[] => {
  const count = lightsGroupStageCount(mode);
  if (!count) {
    return [];
  }
  const stages = mode?.stages ?? [];
  return Array.from({ length: count }, (_, index) => {
    const name = stages[index]?.name?.trim();
    return name || (count === 1 ? "On" : `Stage ${index + 1}`);
  });
};

export const isLightsRgbGroup = (mode?: LightsGroupMode): boolean =>
  mode?.kind === "rgb";

export const lightsGroupScene = (
  mode?: LightsGroupMode,
  stage = 1,
): string | undefined => {
  const stages = (mode?.stages ?? []).filter((item) => item.scene);
  if (stages.length) {
    const index = clamp(Math.round(Number(stage) || 1), 1, stages.length) - 1;
    return stages[index]?.scene;
  }
  return mode?.scene;
};

export const activeLightsGroupId = (
  state?: LightsCardState,
): string | undefined =>
  state?.group?.on && state.group.id ? state.group.id : undefined;

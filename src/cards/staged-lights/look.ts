import { safeIcon } from "../../shared/entities";
import { clamp } from "../../shared/hass";
import { normalizeHex } from "./color";
import {
  DEFAULT_STAGE_ICON,
  MAX_RGB_PRESETS,
  RGB_PRESETS,
  ROW_META,
} from "./const";
import { lightsStageCount, rowStageMaps, type StageRowId } from "./stages";
import type { LightRowId, RowIcons, StagedLightsCardConfig } from "./types";

const rowIconConfig = (
  config: StagedLightsCardConfig | undefined,
  row: LightRowId,
): RowIcons | undefined =>
  row === "rgb" ? config?.rgb_icons : row === "warm" ? config?.warm_icons : config?.white_icons;

export const resolveRgbPresets = (config?: StagedLightsCardConfig): string[] => {
  const raw = config?.rgb_presets;
  if (!Array.isArray(raw) || !raw.length) {
    return [...RGB_PRESETS];
  }
  const cleaned = raw
    .map((value) => normalizeHex(typeof value === "string" ? value : "", ""))
    .filter((hex): hex is string => Boolean(hex))
    .slice(0, MAX_RGB_PRESETS);
  return cleaned.length ? cleaned : [...RGB_PRESETS];
};

export const rowPowerIcons = (
  config: StagedLightsCardConfig | undefined,
  row: LightRowId,
): { on: string; off: string } => {
  const raw = rowIconConfig(config, row);
  const configured =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : undefined;
  const fallback = ROW_META[row].icon;
  return {
    on: safeIcon(configured?.on, fallback),
    off: safeIcon(configured?.off, fallback),
  };
};

export const lightsDirectControl = (config?: StagedLightsCardConfig): boolean => {
  const value = config?.direct_control as unknown;
  if (value === true || value === 1 || value === "1" || value === "on" || value === "true") {
    return true;
  }
  return false;
};

export const rowStageIcon = (
  config: StagedLightsCardConfig | undefined,
  row: StageRowId,
  stage: number,
): string => {
  const count = lightsStageCount(config, row);
  const index = clamp(Math.round(Number.isFinite(stage) ? stage : 1), 1, count) - 1;
  return safeIcon(rowStageMaps(config, row)[index]?.icon, DEFAULT_STAGE_ICON);
};

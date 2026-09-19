import { configuredRows } from "../staged-lights/stages";
import { activeLightRow, lastLightRow } from "../staged-lights/state";
import type { LightRowId, LightsCardState, StagedLightsCardConfig } from "../staged-lights/types";
import { ROW_META, ROW_ORDER } from "../staged-lights/const";

export const MINI_LAYOUT_ROWS = 2;

export const configuredMiniRow = (
  config?: StagedLightsCardConfig,
  row?: LightRowId | null,
): LightRowId | undefined =>
  row && configuredRows(config).includes(row) ? row : undefined;

export const miniModes = (config?: StagedLightsCardConfig): LightRowId[] =>
  configuredRows(config);

export const miniShowcaseModes = (): LightRowId[] => [...ROW_ORDER];

export const miniActiveRow = (
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): LightRowId | undefined => configuredMiniRow(config, activeLightRow(state));

export const miniControlRow = (
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): LightRowId | undefined =>
  miniActiveRow(state, config) ??
  configuredMiniRow(config, lastLightRow(state)) ??
  configuredRows(config)[0];

export const miniToggleTarget = (
  mode: LightRowId,
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): LightRowId | undefined => {
  if (!configuredMiniRow(config, mode)) {
    return miniControlRow(state, config);
  }
  return miniActiveRow(state, config) === mode ? undefined : mode;
};

export const miniModeOn = (
  mode: LightRowId,
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): boolean => miniActiveRow(state, config) === mode;

export const miniModeMeta = (mode: LightRowId): { label: string; icon: string } => ROW_META[mode];

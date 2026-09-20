import { chunkEvenly, packGroupRows } from "../../shared/layout";
import { showsEntityButtons } from "../../shared/entity-buttons";
import {
  activeLightsGroupId,
  findLightsGroup,
  hasLightsGroups,
  isLightsRgbGroup,
  lightsGroupModes,
  lightsGroupStageCount,
} from "../staged-lights/groups";
import { visibleLights } from "../staged-lights/roster";
import { configuredRows } from "../staged-lights/stages";
import { activeLightRow, lastLightRow } from "../staged-lights/state";
import type {
  LightRowId,
  LightsCardState,
  LightsGroupMode,
  StagedLightsCardConfig,
} from "../staged-lights/types";
import { ROW_META, ROW_ORDER } from "../staged-lights/const";

export const MINI_LAYOUT_ROWS = 2;

const miniChipRows = (config?: StagedLightsCardConfig): number =>
  showsEntityButtons(config) ? chunkEvenly(visibleLights(config)).length : 0;

export const miniGroupModeList = (config?: StagedLightsCardConfig): LightsGroupMode[] =>
  lightsGroupModes(config);

export const miniGroupRows = (config?: StagedLightsCardConfig): LightsGroupMode[][] =>
  packGroupRows(miniGroupModeList(config));

export const miniActiveGroup = (
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): LightsGroupMode | undefined =>
  findLightsGroup(config, activeLightsGroupId(state));

export const miniControlGroup = (
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): LightsGroupMode | undefined =>
  miniActiveGroup(state, config) ??
  findLightsGroup(config, state?.group?.id) ??
  miniGroupModeList(config)[0];

export const miniGroupOn = (
  mode: LightsGroupMode,
  state?: LightsCardState,
): boolean => activeLightsGroupId(state) === mode.id;

export const miniGroupToggleTarget = (
  mode: LightsGroupMode,
  state?: LightsCardState,
): string | undefined => (miniGroupOn(mode, state) ? undefined : mode.id);

export const miniShowsGroupControls = (
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): boolean => {
  const mode = miniControlGroup(state, config);
  return isLightsRgbGroup(mode) || lightsGroupStageCount(mode) > 1;
};

export const miniLayoutRows = (config?: StagedLightsCardConfig): number => {
  if (hasLightsGroups(config)) {
    const rows = miniGroupRows(config).length;
    const controls = miniGroupModeList(config).some(
      (mode) => isLightsRgbGroup(mode) || lightsGroupStageCount(mode) > 1,
    )
      ? 1
      : 0;
    return Math.max(1, rows + controls + miniChipRows(config));
  }
  return MINI_LAYOUT_ROWS + miniChipRows(config);
};

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

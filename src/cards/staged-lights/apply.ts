import {
  applyLightLooks,
  applyToggleTargets,
  clamp,
  isValidEntityId,
} from "../../shared";
import type { HomeAssistant } from "../../shared/types";
import { hexToRgb } from "./color";
import { DEFAULT_RGB_HEX, ROW_ORDER } from "./const";
import { rowRoster } from "./roster";
import {
  lightsStageCount,
  resolveRowStageTargets,
  splitStageTargets,
  stageToBrightness,
} from "./stages";
import { activeLightRow } from "./state";
import type { LightRowId, LightsCardState, StagedLightsCardConfig } from "./types";

export const rowEntityIds = (
  config?: StagedLightsCardConfig,
  row?: LightRowId,
): string[] => {
  if (!row) {
    return [];
  }
  return [...new Set(rowRoster(config, row).map((item) => item.entity).filter(isValidEntityId))];
};

const turnOff = async (
  hass: HomeAssistant | undefined,
  entityIds: string[],
): Promise<void> => {
  await applyToggleTargets(
    hass,
    entityIds.map((entity) => ({ entity, state: "off" as const })),
  );
};

const turnOnStageRow = async (
  hass: HomeAssistant | undefined,
  config: StagedLightsCardConfig | undefined,
  row: "warm" | "white",
  state: LightsCardState,
): Promise<void> => {
  const stage = clamp(Math.round(Number(state[row]?.stage) || 1), 1, lightsStageCount(config, row));
  const { onLights, rest } = splitStageTargets(resolveRowStageTargets(config, row, stage));
  await applyLightLooks(hass, onLights, {
    on: true,
    brightness: stageToBrightness(stage, lightsStageCount(config, row)),
  });
  await applyToggleTargets(hass, rest);
};

export const applyLightsMode = async (
  hass?: HomeAssistant,
  config?: StagedLightsCardConfig,
  state?: LightsCardState,
): Promise<void> => {
  if (!hass || !state) {
    return;
  }
  const ids = {
    rgb: rowEntityIds(config, "rgb"),
    warm: rowEntityIds(config, "warm"),
    white: rowEntityIds(config, "white"),
  };
  const off = ROW_ORDER.flatMap((row) => (state[row]?.on ? [] : ids[row]));
  await turnOff(hass, [...new Set(off)]);
  const active = activeLightRow(state);
  if (active === "rgb") {
    await applyLightLooks(hass, ids.rgb, {
      on: true,
      brightness: clamp(Number(state.rgb?.brightness) || 1, 1, 255),
      rgb: hexToRgb(state.rgb?.hex || DEFAULT_RGB_HEX),
    });
    return;
  }
  if (active === "warm" || active === "white") {
    await turnOnStageRow(hass, config, active, state);
  }
};

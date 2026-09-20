import {
  applyLightLooks,
  applyToggleTargets,
  clamp,
  isValidEntityId,
} from "../../shared";
import { uniqueEntityIds } from "../../shared/entities";
import type { HomeAssistant } from "../../shared/types";
import { activateStudioScene, lightsStudioKind, peekStudioScenes, sceneIdForLightsState } from "../../studio/bind";
import type { SceneConfig } from "../../studio/types";
import { hexToHue, hexToRgb } from "./color";
import { DEFAULT_KELVIN } from "./adjust";
import { DEFAULT_RGB_HEX, ROW_ORDER } from "./const";
import { findLightsGroup } from "./groups";
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
  options?: { scenes?: SceneConfig[]; liveRgb?: boolean },
): Promise<void> => {
  if (!hass || !state) {
    return;
  }
  if (options?.liveRgb && state.group?.on && config) {
    const mode = findLightsGroup(config, state.group.id);
    if (mode?.kind === "rgb") {
      const ids = uniqueEntityIds(mode.entities ?? []);
      if (ids.length) {
        const hex = state.group.hex || mode.hex || DEFAULT_RGB_HEX;
        await applyLightLooks(hass, ids, {
          on: true,
          brightness: clamp(Number(state.group.brightness) || 1, 1, 255),
          rgb: hexToRgb(hex),
          hs: [hexToHue(hex), 100],
          kelvin: state.group.kelvin ?? DEFAULT_KELVIN,
        });
        return;
      }
    }
  }
  if (config?.studio && !options?.liveRgb) {
    const scenes = options?.scenes ?? peekStudioScenes(hass);
    const id = sceneIdForLightsState(
      config.studio,
      state,
      lightsStudioKind(config.studio, scenes),
      config,
    );
    if (await activateStudioScene(hass, id)) {
      return;
    }
  }
  const applyEntities = async (): Promise<void> => {
    const ids = {
      rgb: rowEntityIds(config, "rgb"),
      warm: rowEntityIds(config, "warm"),
      white: rowEntityIds(config, "white"),
    };
    const off = ROW_ORDER.flatMap((row) => (state[row]?.on ? [] : ids[row]));
    await turnOff(hass, [...new Set(off)]);
    const active = activeLightRow(state);
    if (active === "rgb") {
      const hex = state.rgb?.hex || DEFAULT_RGB_HEX;
      await applyLightLooks(hass, ids.rgb, {
        on: true,
        brightness: clamp(Number(state.rgb?.brightness) || 1, 1, 255),
        rgb: hexToRgb(hex),
        hs: [hexToHue(hex), 100],
        kelvin: state.rgb?.kelvin ?? DEFAULT_KELVIN,
      });
      return;
    }
    if (active === "warm" || active === "white") {
      await turnOnStageRow(hass, config, active, state);
    }
  };

  if (config?.studio && !options?.liveRgb) {
    const scenes = options?.scenes ?? peekStudioScenes(hass);
    const id = sceneIdForLightsState(
      config.studio,
      state,
      lightsStudioKind(config.studio, scenes),
      config,
    );
    try {
      if (await activateStudioScene(hass, id)) {
        return;
      }
    } catch (error) {
      try {
        await applyEntities();
      } catch {
        // Keep the original scene error for the card.
      }
      throw error;
    }
  }
  await applyEntities();
};

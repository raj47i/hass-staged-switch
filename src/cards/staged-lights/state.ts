import { clamp } from "../../shared/hass";
import {
  DEFAULT_RGB_BRIGHTNESS,
  DEFAULT_RGB_HEX,
  MAX_LIGHT_STAGES,
} from "./const";
import { normalizeHex } from "./color";
import { percentToBrightness, stageToBrightness } from "./stages";
import type { LightRowId, LightsCardState, RgbRowState, StageRowState } from "./types";

const defaultState = (): LightsCardState => ({
  rgb: { on: true, brightness: DEFAULT_RGB_BRIGHTNESS, hex: DEFAULT_RGB_HEX },
  warm: { on: false, stage: 1 },
  white: { on: false, stage: 1 },
});

const parseFlag = (value: unknown, fallback: boolean): boolean => {
  if (value === true || value === 1 || value === "1" || value === "on") {
    return true;
  }
  if (value === false || value === 0 || value === "0" || value === "off") {
    return false;
  }
  return fallback;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const parseStageValue = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return clamp(fallback, 1, MAX_LIGHT_STAGES);
  }
  return clamp(Math.round(numeric), 1, MAX_LIGHT_STAGES);
};

const parseRgbBrightness = (rgb: Record<string, unknown>, fallback: number): number => {
  const brightness = Number(rgb.b ?? rgb.brightness);
  if (Number.isFinite(brightness) && brightness > MAX_LIGHT_STAGES) {
    return clamp(Math.round(brightness), 1, 255);
  }
  if (Number.isFinite(brightness) && brightness > 0) {
    return percentToBrightness(brightness);
  }
  const stage = Number(rgb.s ?? rgb.stage);
  if (Number.isFinite(stage) && stage > 0) {
    return stageToBrightness(stage, MAX_LIGHT_STAGES);
  }
  return clamp(fallback, 1, 255);
};

const parseStage = (value: unknown, fallback: number, fallbackOn: boolean): StageRowState => {
  const row = asRecord(value);
  return {
    on: parseFlag(row.o ?? row.on, fallbackOn),
    stage: parseStageValue(row.s ?? row.stage ?? fallback, fallback),
  };
};

export const exclusiveLightsState = (
  current?: LightsCardState,
  active?: LightRowId,
  patch?: Partial<RgbRowState> | Partial<StageRowState>,
): LightsCardState => {
  const base = current ?? defaultState();
  const rgb = base.rgb ?? defaultState().rgb;
  const warm = base.warm ?? defaultState().warm;
  const white = base.white ?? defaultState().white;
  return {
    rgb: {
      ...rgb,
      ...(active === "rgb" ? patch : undefined),
      on: active === "rgb",
    },
    warm: {
      ...warm,
      ...(active === "warm" ? patch : undefined),
      on: active === "warm",
    },
    white: {
      ...white,
      ...(active === "white" ? patch : undefined),
      on: active === "white",
    },
  };
};

export const activeLightRow = (state?: LightsCardState): LightRowId | undefined => {
  if (state?.rgb?.on) {
    return "rgb";
  }
  if (state?.warm?.on) {
    return "warm";
  }
  if (state?.white?.on) {
    return "white";
  }
  return undefined;
};

export const parseLightsState = (raw?: string): LightsCardState => {
  const fallback = defaultState();
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    const parsed = asRecord(JSON.parse(raw));
    const rgb = asRecord(parsed.r ?? parsed.rgb);
    const next = {
      rgb: {
        on: parseFlag(rgb.o ?? rgb.on, fallback.rgb.on),
        brightness: parseRgbBrightness(rgb, fallback.rgb.brightness),
        hex: normalizeHex(
          typeof rgb.c === "string"
            ? rgb.c
            : typeof rgb.hex === "string"
              ? rgb.hex
              : fallback.rgb.hex,
          fallback.rgb.hex,
        ),
      },
      warm: parseStage(parsed.w ?? parsed.warm, fallback.warm.stage, false),
      white: parseStage(parsed.n ?? parsed.white, fallback.white.stage, false),
    };
    return exclusiveLightsState(next, activeLightRow(next));
  } catch {
    return fallback;
  }
};

export const serializeLightsState = (state?: LightsCardState): string => {
  const source = state ?? defaultState();
  const exclusive = exclusiveLightsState(source, activeLightRow(source));
  return JSON.stringify({
    r: {
      o: exclusive.rgb.on ? 1 : 0,
      b: exclusive.rgb.brightness,
      c: exclusive.rgb.hex,
    },
    w: { o: exclusive.warm.on ? 1 : 0, s: exclusive.warm.stage },
    n: { o: exclusive.white.on ? 1 : 0, s: exclusive.white.stage },
  });
};

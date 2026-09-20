import { html, nothing } from "lit";
import type { LightAdjustKind } from "../../shared/entities";
import { lightAdjustKind, rosterAdjustKind } from "../../shared/entities";
import type { HomeAssistant } from "../../shared/types";
import { hexToHue, normalizeHex } from "./color";
import { DEFAULT_RGB_HEX } from "./const";

export const DEFAULT_KELVIN = 4000;
export const MIN_KELVIN = 2000;
export const MAX_KELVIN = 6500;

export const clampKelvin = (
  value: unknown,
  min = MIN_KELVIN,
  max = MAX_KELVIN,
): number => {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(hi, Math.max(lo, DEFAULT_KELVIN));
  }
  return Math.min(hi, Math.max(lo, Math.round(numeric)));
};

export const kelvinRangeForIds = (
  hass: HomeAssistant | undefined,
  entityIds: string[] = [],
): { min: number; max: number } => {
  const ranges = entityIds
    .filter((entityId) => lightAdjustKind(hass, entityId) === "temp")
    .map((entityId) => {
      const attrs = hass?.states[entityId]?.attributes ?? {};
      const lo = Number(attrs.min_color_temp_kelvin);
      const hi = Number(attrs.max_color_temp_kelvin);
      return {
        min: Number.isFinite(lo) ? Math.max(MIN_KELVIN, Math.round(lo)) : MIN_KELVIN,
        max: Number.isFinite(hi) ? Math.min(MAX_KELVIN, Math.round(hi)) : MAX_KELVIN,
      };
    });
  if (!ranges.length) {
    return { min: MIN_KELVIN, max: MAX_KELVIN };
  }
  const min = Math.max(...ranges.map((range) => range.min));
  const max = Math.min(...ranges.map((range) => range.max));
  if (min >= max) {
    return { min: MIN_KELVIN, max: MAX_KELVIN };
  }
  return { min, max };
};

export const kelvinToHex = (kelvin: number): string => {
  const t = (clampKelvin(kelvin) - MIN_KELVIN) / (MAX_KELVIN - MIN_KELVIN);
  const warm = [255, 138, 29];
  const cool = [196, 225, 255];
  return `#${[0, 1, 2]
    .map((index) =>
      Math.round(warm[index]! + (cool[index]! - warm[index]!) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

export const adjustKindForIds = (
  hass: HomeAssistant | undefined,
  entityIds: string[] = [],
): LightAdjustKind => rosterAdjustKind(hass, entityIds);

export const renderAdjustControls = (options: {
  kind: LightAdjustKind;
  label: string;
  muted: boolean;
  percent: number;
  hex: string;
  kelvin?: number;
  minKelvin?: number;
  maxKelvin?: number;
  presets: string[];
  showcase?: boolean;
  onBrightnessInput?: (ev: Event) => void;
  onBrightness?: (ev: Event) => void;
  onHue?: (hue: number) => void;
  onKelvin?: (kelvin: number) => void;
  onPreset?: (hex: string) => void;
  onCustomColor?: (ev: Event) => void;
}) => {
  const {
    kind,
    label,
    muted,
    percent,
    hex,
    kelvin = DEFAULT_KELVIN,
    minKelvin = MIN_KELVIN,
    maxKelvin = MAX_KELVIN,
    presets,
    showcase,
  } = options;
  const color = hex || DEFAULT_RGB_HEX;
  const hue = hexToHue(color);
  const selectedPreset = presets.find(
    (preset) => normalizeHex(preset, "") === normalizeHex(color, ""),
  );
  const showBrightness = kind !== "onoff";
  const showColor = kind === "rgb";
  const showHue = kind === "hs";
  const showTemp = kind === "temp";
  const tempValue = clampKelvin(kelvin, minKelvin, maxKelvin);
  return html`
    <div
      class="mode-controls rgb-controls ${muted ? "power-off" : ""} ${kind}"
      style="--current-color: ${showTemp ? kelvinToHex(tempValue) : color}"
      aria-label="${label}${showColor ? " brightness and color" : showHue ? " brightness and hue" : showTemp ? " brightness and temperature" : showBrightness ? " brightness" : ""}"
    >
      ${showBrightness
        ? html`
            <input
              class="brightness"
              type="range"
              min="1"
              max="100"
              .value=${String(percent)}
              aria-label="${label} brightness"
              @input=${showcase ? undefined : options.onBrightnessInput}
              @change=${showcase ? undefined : options.onBrightness}
            />
            <span class="brightness-value" aria-hidden="true">${percent}%</span>
          `
        : nothing}
      ${showHue
        ? html`
            <input
              class="hue"
              type="range"
              min="0"
              max="360"
              .value=${String(hue)}
              aria-label="${label} hue"
              @input=${showcase
                ? undefined
                : (ev: Event) => {
                    const value = Number((ev.target as HTMLInputElement).value);
                    if (Number.isFinite(value)) {
                      options.onHue?.(value);
                    }
                  }}
            />
            <span class="brightness-value" aria-hidden="true">${hue}°</span>
          `
        : nothing}
      ${showTemp
        ? html`
            <input
              class="kelvin"
              type="range"
              min=${minKelvin}
              max=${maxKelvin}
              step="50"
              .value=${String(tempValue)}
              aria-label="${label} temperature"
              @input=${showcase
                ? undefined
                : (ev: Event) => {
                    const value = Number((ev.target as HTMLInputElement).value);
                    if (Number.isFinite(value)) {
                      options.onKelvin?.(clampKelvin(value, minKelvin, maxKelvin));
                    }
                  }}
            />
            <span class="brightness-value" aria-hidden="true">${tempValue}K</span>
          `
        : nothing}
      ${showColor
        ? html`
            <div class="presets">
              ${presets.map(
                (preset) => html`
                  <button
                    class="swatch ${selectedPreset === preset ? "selected" : ""}"
                    type="button"
                    style="background: ${preset}"
                    aria-label="${label} color ${preset}"
                    aria-pressed=${selectedPreset === preset}
                    @click=${showcase ? undefined : () => options.onPreset?.(preset)}
                  ></button>
                `,
              )}
            </div>
            <label class="picker-wrap ${selectedPreset ? "" : "selected"}" title="Custom color">
              <button class="picker-button" type="button" tabindex="-1" aria-hidden="true"></button>
              <input
                type="color"
                .value=${color}
                aria-label="Custom ${label} color"
                ?disabled=${showcase}
                @input=${showcase ? undefined : options.onCustomColor}
              />
            </label>
          `
        : nothing}
    </div>
  `;
};

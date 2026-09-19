import { PACKAGE_VERSION } from "../../shared/const";
import type { LightRowId } from "./types";

export const CARD_VERSION = PACKAGE_VERSION;
export const CARD_NAME = "staged-lights-card";
export const CARD_TITLE = "Staged Lights Card";
export const DEFAULT_TITLE = "Room lights";
export const EDITOR_SELECT_EVENT = "staged-lights-editor-select";
export const RGB_DOMAINS = ["light"];
export const STAGE_DOMAINS = ["light", "switch"];
export const MIN_LIGHT_STAGES = 2;
export const MAX_TWO_ENTITY_STAGES = 3;
export const MAX_LIGHT_STAGES = 5;
export const DEFAULT_LIGHT_STAGES = 3;
export const MIN_WARM_WHITE_ENTITIES = 2;
export const DEFAULT_RGB_HEX = "#ff8a1d";
export const DEFAULT_RGB_BRIGHTNESS = 180;

export const INTENSITY_NAMES: Record<number, string[]> = {
  2: ["Min", "Max"],
  3: ["Min", "Medium", "Max"],
  4: ["Min", "Low", "High", "Max"],
  5: ["Min", "Low", "Medium", "High", "Max"],
};

export const MAX_RGB_PRESETS = 8;
export const DEFAULT_STAGE_ICON = "mdi:circle-medium";
export const RGB_PRESETS = [
  "#ff8a1d",
  "#ffc9a3",
  "#f3eadc",
  "#ffffff",
  "#7ea6ff",
  "#c4b4ff",
  "#ffb0d4",
  "#ff6d4d",
] as const;

export const ROW_ORDER: LightRowId[] = ["rgb", "warm", "white"];

export const ROW_META: Record<
  LightRowId,
  { label: string; icon: string }
> = {
  rgb: { label: "RGB", icon: "mdi:palette" },
  warm: { label: "Warm", icon: "mdi:weather-sunset" },
  white: { label: "White", icon: "mdi:white-balance-sunny" },
};

export const SHOWCASE_TITLE = "Living room";
export const SHOWCASE_STAGE_COUNT = 3;
export const SHOWCASE_CURRENT_STAGE = 2;

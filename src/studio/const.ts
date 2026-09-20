export const STUDIO_PANEL = "scene-studio-panel";
export const STUDIO_CARD = "scene-studio-card";
export const STUDIO_CARD_TYPE = "custom:scene-studio-card";
export const STUDIO_DASHBOARD_PATH = "scene-studio";
export const STUDIO_ICON = "mdi:palette-swatch";
export const STUDIO_WIZARD = "scene-studio-wizard";
export const STUDIO_LIGHTS_WIZARD = "scene-studio-lights-wizard";
export const STUDIO_ADVANCED_WIZARD = "scene-studio-advanced-wizard";
export const STUDIO_TITLE = "Scene Studio";
export const STUDIO_SET_KIND_LABEL = {
  light: "Simple light scene set",
  minimal: "Minimal light scene set",
  advanced: "Advanced light scene set",
  switch: "Switch scene set",
} as const;

export const studioSetKindLabel = (
  kind: keyof typeof STUDIO_SET_KIND_LABEL | string,
): string =>
  STUDIO_SET_KIND_LABEL[kind as keyof typeof STUDIO_SET_KIND_LABEL] ??
  "Scene set";

export const studioSetEditorTitle = (
  kind: keyof typeof STUDIO_SET_KIND_LABEL,
  editing: boolean,
): string => `${editing ? "Edit" : "New"} ${studioSetKindLabel(kind)}`;
export const SCENE_ID_PREFIX = "sst_";
export const LIGHT_SCENE_PREFIX = "ssl_";
export const MINIMAL_LIGHT_PREFIX = "ssm_";
export const ADVANCED_LIGHT_PREFIX = "sla_";
export const OFF_LABEL = "Off";
export const DEFAULT_SCENE_LABEL = "Off / Default";
export const OFF_ICON = "mdi:power";
export const STAGE_ICON = "mdi:toggle-switch";
export const STUDIO_SCENE_GAP_MS = 500;
export const STUDIO_PREVIEW_TIMEOUT_MS = 10_000;
export const STUDIO_BULK_PICK = "scene-studio-bulk-pick";
export const STUDIO_ASSIGN = "scene-studio-assign";
export const STUDIO_PICK_DOMAINS = ["light", "switch"] as const;
export const STUDIO_RGB_PRESETS = [
  "#ff8a1d",
  "#ffc9a3",
  "#ffffff",
  "#7ea6ff",
  "#c4b4ff",
  "#ff6d4d",
] as const;
export const STUDIO_RGB_PRESET_COUNT = STUDIO_RGB_PRESETS.length;
export const STUDIO_RGB_EFFECTS = [
  { id: "", label: "None" },
  { id: "strobe", label: "Strobe color" },
  { id: "colorloop", label: "RGB Cycle / Color Loop" },
  { id: "random", label: "Random Loop" },
  { id: "fast_random", label: "Fast Random Loop" },
  { id: "candle", label: "Candle Flicker" },
  { id: "sunrise", label: "Sunrise" },
  { id: "sunset", label: "Sunset" },
  { id: "movie", label: "Movie" },
  { id: "date_night", label: "Date Night" },
  { id: "disco", label: "Disco / Party" },
] as const;

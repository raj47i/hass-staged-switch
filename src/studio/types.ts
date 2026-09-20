import type { SwitchState } from "../shared/types";

export type StudioWizardStep =
  | "entities"
  | "name"
  | "groups"
  | "stages"
  | "edit"
  | "review";
export type SwitchStageMode = "cumulative" | "explicit";
export type StudioSetKind = "switch" | "light" | "minimal" | "advanced";
export type LightRowId = "rgb" | "warm" | "white" | "whites";
export type LightProfile = "simple" | "minimal";
export type LightRowAssign = LightRowId | "none";

export interface SceneEntityState {
  state: SwitchState;
  brightness?: number;
  rgb_color?: [number, number, number];
  hs_color?: [number, number];
  color_temp_kelvin?: number;
  effect?: string;
}

export type AdvancedGroupMode = "levels" | "rgb";

export interface StudioAdvancedGroupMeta {
  name: string;
  entities: string[];
  stages?: number;
  levelNames?: string[];
  hex?: string;
  kelvin?: number;
  brightness?: number;
  effect?: string;
  /** `rgb` = one color/brightness look. Missing = levels, unless the name is RGB/Smart. */
  mode?: AdvancedGroupMode;
}

export interface StudioLightMeta {
  entities?: string[];
  rgb?: string[];
  warm?: string[];
  white?: string[];
  whites?: string[];
  warmStages?: number;
  whiteStages?: number;
  whitesStages?: number;
  hex?: string;
  kelvin?: number;
  brightness?: number;
  effect?: string;
  groups?: StudioAdvancedGroupMeta[];
}

export interface SceneConfig {
  id: string;
  name: string;
  icon?: string;
  entities: Record<string, SceneEntityState>;
  /** Group membership so live-edit offs survive a reload. */
  meta?: StudioLightMeta;
}

export interface SwitchGroupDraft {
  name: string;
  slug: string;
  icon?: string;
  entities: string[];
  mode: SwitchStageMode;
  stage_names: string[];
  stages?: Array<{ name?: string; switches: Record<string, SwitchState> }>;
  /** New set: persist every entity off until the user edits a stage. */
  fresh?: boolean;
}

export interface SwitchGroupSummary {
  kind: StudioSetKind;
  slug: string;
  name: string;
  sceneCount: number;
  entityCount: number;
  scenes: SceneConfig[];
}

export interface LightSceneLook {
  state: SwitchState;
  brightness?: number;
  hex?: string;
  kelvin?: number;
  effect?: string;
}

export interface LightGroupDraft {
  name: string;
  slug: string;
  profile?: LightProfile;
  entities: string[];
  rgb: string[];
  warm: string[];
  white: string[];
  whites?: string[];
  hex: string;
  kelvin?: number;
  presets: string[];
  /** RGB brightness as 1–100%. Off is a separate scene, never 0%. */
  brightness: number;
  effect?: string;
  musicSync?: boolean;
  warmStages?: number;
  whiteStages?: number;
  whitesStages?: number;
  /** Per-scene, per-entity values keyed by slot (`rgb`, `w1`, `n2`, `t1`). */
  sceneLooks?: Record<string, Record<string, LightSceneLook>>;
}

export interface AdvancedLookState {
  state: SwitchState;
  brightness?: number;
  hex?: string;
  kelvin?: number;
  effect?: string;
}

export interface AdvancedLook {
  name: string;
  entities: Record<string, AdvancedLookState>;
}

export interface AdvancedGroup {
  id: string;
  name: string;
  entities: string[];
  mode?: AdvancedGroupMode;
  hex?: string;
  kelvin?: number;
  brightness?: number;
  effect?: string;
  stages?: number;
  /** Level labels in order (`Min`, `Low`…). Source of truth for count. */
  levelNames?: string[];
  /** Raw `|`-separated editor text so trailing pipes stay while typing. */
  levelText?: string;
  /** Per-stage, per-entity values keyed by stage number (`1`, `2`). */
  sceneLooks?: Record<string, Record<string, LightSceneLook>>;
}

export interface AdvancedLightDraft {
  name: string;
  slug: string;
  entities: string[];
  groups: AdvancedGroup[];
  looks: AdvancedLook[];
}

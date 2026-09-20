import type {
  LovelaceCardConfig,
  SwitchEntityConfig,
  SwitchState,
  SwitchTarget,
} from "../../shared/types";

export interface LightStageConfig {
  name?: string;
  icon?: string;
  switches?: Record<string, SwitchState> | Array<string | SwitchTarget>;
}

export interface RowIcons {
  on?: string;
  off?: string;
}

export interface StagedLightsCardConfig extends LovelaceCardConfig {
  type: string;
  /** Scene-set slug. Rows and stages are read from those scenes. */
  studio?: string;
  title?: string;
  title_align?: "left" | "center" | "right";
  entity?: string;
  stages?: number;
  rgb?: Array<string | SwitchEntityConfig>;
  warm?: Array<string | SwitchEntityConfig>;
  white?: Array<string | SwitchEntityConfig>;
  warm_stages?: LightStageConfig[];
  white_stages?: LightStageConfig[];
  rgb_presets?: string[];
  rgb_icons?: RowIcons;
  warm_icons?: RowIcons;
  white_icons?: RowIcons;
  /** Ignored leftover. The card always controls its lights. */
  direct_control?: boolean;
  show_switches?: boolean;
  /** Scene-set entities hidden from the chip row. Missing = all shown once `show_switches` is on. */
  hidden_entities?: string[];
  /** Full scene-set roster for chips, including entities not in a group. */
  switches?: Array<string | SwitchEntityConfig>;
  /** Named Advanced groups. Simple / Minimal never set this. */
  groups?: LightsGroupMode[];
  /** Extra Advanced looks, packed with `groups` on the Mini card. */
  looks?: LightsGroupMode[];
}

export interface LightsGroupStage {
  name?: string;
  scene?: string;
}

export interface LightsGroupMode {
  id: string;
  name: string;
  icon?: string;
  kind?: "group" | "look" | "rgb";
  scene?: string;
  stages?: LightsGroupStage[];
  entities?: string[];
  hex?: string;
  kelvin?: number;
}

export interface RgbRowState {
  on: boolean;
  brightness: number;
  hex: string;
  kelvin?: number;
}

export interface StageRowState {
  on: boolean;
  stage: number;
}

export interface LightsGroupState {
  id: string;
  on: boolean;
  stage: number;
  hex?: string;
  brightness?: number;
  kelvin?: number;
}

export interface LightsCardState {
  rgb: RgbRowState;
  warm: StageRowState;
  white: StageRowState;
  last?: LightRowId;
  /** Advanced Mini only. Simple / Minimal ignore this. */
  group?: LightsGroupState;
}

export type LightRowId = "rgb" | "warm" | "white";

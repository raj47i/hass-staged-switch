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
  /** Scene Studio set slug. Rows and stages are read from those scenes. */
  studio?: string;
  /** Ignored leftover. Existing YAML may still have it. */
  title?: string;
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
}

export interface RgbRowState {
  on: boolean;
  brightness: number;
  hex: string;
}

export interface StageRowState {
  on: boolean;
  stage: number;
}

export interface LightsCardState {
  rgb: RgbRowState;
  warm: StageRowState;
  white: StageRowState;
  last?: LightRowId;
}

export type LightRowId = "rgb" | "warm" | "white";

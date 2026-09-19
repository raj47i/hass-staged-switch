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
  direct_control?: boolean;
  show_switches?: boolean;
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
}

export type LightRowId = "rgb" | "warm" | "white";

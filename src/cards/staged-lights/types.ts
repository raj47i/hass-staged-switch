import type { LovelaceCardConfig, SwitchEntityConfig } from "../../shared/types";

export interface StagedLightsCardConfig extends LovelaceCardConfig {
  type: string;
  title?: string;
  entity?: string;
  stages?: number;
  rgb?: Array<string | SwitchEntityConfig>;
  warm?: Array<string | SwitchEntityConfig>;
  white?: Array<string | SwitchEntityConfig>;
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

import type {
  LovelaceCardConfig,
  SwitchEntityConfig,
  SwitchState,
  SwitchTarget,
} from "../../shared/types";

export interface StageConfig {
  name?: string;
  icon?: string;
  switches?: Record<string, SwitchState> | Array<string | SwitchTarget>;
}

export interface StagedSwitchCardConfig extends LovelaceCardConfig {
  type: string;
  title?: string;
  entity?: string;
  power_entity?: string;
  stages?: StageConfig[];
  switches?: Array<string | SwitchEntityConfig>;
  stage_names?: string[];
  direct_control?: boolean;
  show_switches?: boolean;
  show_stage_labels?: boolean;
}

export interface ResolvedStage {
  index: number;
  name: string;
  icon?: string;
  targets: SwitchTarget[];
}

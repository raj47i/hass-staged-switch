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
  /** Scene Studio set slug. Stages are read from those scenes. */
  studio?: string;
  title?: string;
  entity?: string;
  power_entity?: string;
  stages?: StageConfig[];
  switches?: Array<string | SwitchEntityConfig>;
  stage_names?: string[];
  direct_control?: boolean;
  show_switches?: boolean;
  /** Scene-set entities hidden from the chip row. Missing = all shown once `show_switches` is on. */
  hidden_entities?: string[];
  show_stage_labels?: boolean;
}

export interface ResolvedStage {
  index: number;
  name: string;
  icon?: string;
  targets: SwitchTarget[];
}

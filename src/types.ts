export type SwitchState = "on" | "off";

export interface HassEntityAttributes {
  friendly_name?: string;
  icon?: string;
  min?: number;
  max?: number;
  step?: number;
  unit_of_measurement?: string;
  [key: string]: unknown;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: HassEntityAttributes;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: { entity_id?: string | string[] },
  ): Promise<unknown>;
  localize: (key: string, ...args: unknown[]) => string;
  language: string;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize?(): number | Promise<number>;
  getGridOptions?(): { columns?: number; min_rows?: number };
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
}

export interface SwitchTarget {
  entity: string;
  name?: string;
  icon?: string;
  state: SwitchState;
}

export interface StageConfig {
  name?: string;
  icon?: string;
  switches?: Record<string, SwitchState> | Array<string | SwitchTarget>;
}

export interface SwitchEntityConfig {
  entity: string;
  name?: string;
  icon?: string;
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

declare global {
  interface Window {
    customCards: Array<{
      type: string;
      name: string;
      description: string;
      preview?: boolean;
      documentationURL?: string;
    }>;
  }

}

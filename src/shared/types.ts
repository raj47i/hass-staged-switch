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

export interface EntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  hidden?: boolean;
  disabled_by?: string | null;
  entity_category?: "config" | "diagnostic" | null;
}

export interface DeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, EntityRegistryEntry>;
  devices?: Record<string, DeviceRegistryEntry>;
  areas?: Record<string, AreaRegistryEntry>;
  services?: Record<string, Record<string, unknown>>;
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: { entity_id?: string | string[] },
  ): Promise<unknown>;
  localize: (key: string, ...args: unknown[]) => string;
  language: string;
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize?(): number | Promise<number>;
  getGridOptions?(): {
    columns?: number;
    min_columns?: number;
    max_columns?: number;
    min_rows?: number;
  };
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

export interface SwitchEntityConfig {
  entity: string;
  name?: string;
  icon?: string;
  hide?: boolean;
}

export interface HideableRoster {
  switches?: Array<string | SwitchEntityConfig>;
}

export interface LovelaceCardInfo {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards: LovelaceCardInfo[];
  }
}

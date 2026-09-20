import { ROOM_SWITCHES_CARD, ROOM_SWITCHES_CARD_LEGACY } from "../../shared/card-ids";
import { PACKAGE_VERSION, pickerName } from "../../shared/const";

export const CARD_VERSION = PACKAGE_VERSION;

export const CARD_NAME = ROOM_SWITCHES_CARD;
export const CARD_LEGACY_NAME = ROOM_SWITCHES_CARD_LEGACY;
export const CARD_TITLE = pickerName("Room Switches");
export const DEFAULT_TITLE = "Room Switches";
export const DEFAULT_OFF_LABEL = "Off";
export const DEFAULT_POWER_LABEL = "Power";
export const MAX_STAGES = 5;
export const MAX_RESOLVED_STAGES = MAX_STAGES + 1;
export const EDITOR_SELECT_EVENT = "scene-studio-room-switches-editor-select";

export const SHOWCASE_TITLE = "Patio";
export const SHOWCASE_STAGE_NAME = "Heater";
export const SHOWCASE_STAGE_COUNT = 4;
export const SHOWCASE_CURRENT_INDEX = 3;

export const SHOWCASE_CHIPS: Array<{
  entity: string;
  icon: string;
  state: "on" | "off";
}> = [
  { entity: "switch.fan", icon: "mdi:toggle-switch", state: "on" },
  { entity: "light.string", icon: "mdi:lightbulb", state: "on" },
  { entity: "switch.heater", icon: "mdi:toggle-switch", state: "on" },
  { entity: "light.lamp", icon: "mdi:lightbulb", state: "off" },
  { entity: "light.porch", icon: "mdi:lightbulb", state: "off" },
  { entity: "fan.patio", icon: "mdi:fan", state: "off" },
];

import { isValidEntityId } from "./entities";
import type { HomeAssistant, SwitchTarget } from "./types";

export const partitionTargets = (
  targets: SwitchTarget[],
): { on: string[]; off: string[] } => {
  const on: string[] = [];
  const off: string[] = [];
  targets.forEach((target) => {
    if (!isValidEntityId(target.entity)) {
      return;
    }
    if (target.state === "on") {
      on.push(target.entity);
    } else {
      off.push(target.entity);
    }
  });
  return { on, off };
};

export const applyToggleTargets = async (
  hass: HomeAssistant | undefined,
  targets: SwitchTarget[],
  enabled = true,
): Promise<void> => {
  if (!hass || !enabled) {
    return;
  }
  const { on, off } = partitionTargets(targets);
  if (on.length) {
    await hass.callService("homeassistant", "turn_on", { entity_id: on });
  }
  if (off.length) {
    await hass.callService("homeassistant", "turn_off", { entity_id: off });
  }
};

export const setEntityOnOff = async (
  hass: HomeAssistant,
  entityId: string,
  on: boolean,
): Promise<void> => {
  await hass.callService("homeassistant", on ? "turn_on" : "turn_off", {
    entity_id: entityId,
  });
};

export const setInputNumber = async (
  hass: HomeAssistant,
  entityId: string,
  value: number,
): Promise<void> => {
  await hass.callService("input_number", "set_value", {
    entity_id: entityId,
    value,
  });
};

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
    await hass.callService("homeassistant", "turn_on", { entity_id: on }, { entity_id: on });
  }
  if (off.length) {
    await hass.callService("homeassistant", "turn_off", { entity_id: off }, { entity_id: off });
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

export const setInputText = async (
  hass: HomeAssistant,
  entityId: string,
  value: string,
): Promise<void> => {
  await hass.callService("input_text", "set_value", {
    entity_id: entityId,
    value,
  });
};

export const applyLightLooks = async (
  hass: HomeAssistant | undefined,
  entityIds: string[],
  look: {
    on: boolean;
    brightness: number;
    rgb?: [number, number, number];
  },
  enabled = true,
): Promise<void> => {
  const ids = entityIds.filter(isValidEntityId);
  if (!hass || !enabled || !ids.length) {
    return;
  }
  const target = { entity_id: ids };
  if (!look.on || look.brightness <= 0) {
    await hass.callService("light", "turn_off", { entity_id: ids }, target);
    return;
  }
  const data: Record<string, unknown> = {
    entity_id: ids,
    brightness: look.brightness,
  };
  if (look.rgb) {
    data.rgb_color = look.rgb;
  }
  try {
    await hass.callService("light", "turn_on", data, target);
  } catch {
    delete data.rgb_color;
    try {
      await hass.callService("light", "turn_on", data, target);
    } catch {
      await hass.callService("homeassistant", "turn_on", { entity_id: ids }, target);
    }
  }
};

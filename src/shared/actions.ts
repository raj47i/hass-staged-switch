import { isValidEntityId } from "./entities";
import { callHassService, isUnreachableError } from "./hass";
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
  const run = async (service: "turn_on" | "turn_off", ids: string[]): Promise<void> => {
    if (!ids.length) {
      return;
    }
    try {
      await callHassService(
        hass,
        "homeassistant",
        service,
        { entity_id: ids },
        { entity_id: ids },
      );
    } catch (error) {
      if (!isUnreachableError(error) || ids.length === 1) {
        throw error;
      }
      const leftover: unknown[] = [];
      for (const entityId of ids) {
        try {
          await callHassService(
            hass,
            "homeassistant",
            service,
            { entity_id: entityId },
            { entity_id: entityId },
          );
        } catch (item) {
          leftover.push(item);
        }
      }
      if (leftover.length) {
        throw leftover[0];
      }
    }
  };
  await run("turn_on", on);
  await run("turn_off", off);
};

export const setEntityOnOff = async (
  hass: HomeAssistant,
  entityId: string,
  on: boolean,
): Promise<void> => {
  await callHassService(hass, "homeassistant", on ? "turn_on" : "turn_off", {
    entity_id: entityId,
  });
};

export const setInputNumber = async (
  hass: HomeAssistant,
  entityId: string,
  value: number,
): Promise<void> => {
  await callHassService(hass, "input_number", "set_value", {
    entity_id: entityId,
    value,
  });
};

export const setInputText = async (
  hass: HomeAssistant,
  entityId: string,
  value: string,
): Promise<void> => {
  await callHassService(hass, "input_text", "set_value", {
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
    await callHassService(hass, "light", "turn_off", { entity_id: ids }, target);
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
    await callHassService(hass, "light", "turn_on", data, target);
  } catch {
    delete data.rgb_color;
    try {
      await callHassService(hass, "light", "turn_on", data, target);
    } catch {
      await callHassService(hass, "homeassistant", "turn_on", { entity_id: ids }, target);
    }
  }
};

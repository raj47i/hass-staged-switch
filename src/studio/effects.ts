import { isRgbCapableLight } from "../shared";
import type { HomeAssistant } from "../shared/types";
import { STUDIO_RGB_EFFECTS } from "./const";

const titleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());

export const studioEffectOptions = (
  hass: HomeAssistant | undefined,
  entityIds: string[],
): Array<{ id: string; label: string }> => {
  const options = new Map<string, string>(
    STUDIO_RGB_EFFECTS.map((item) => [item.id, item.label]),
  );
  entityIds.forEach((entityId) => {
    if (!isRgbCapableLight(hass, entityId)) {
      return;
    }
    const list = hass?.states[entityId]?.attributes.effect_list;
    if (!Array.isArray(list)) {
      return;
    }
    list.forEach((item) => {
      const id = String(item).trim();
      if (!id || options.has(id)) {
        return;
      }
      options.set(id, titleCase(id));
    });
  });
  return [...options.entries()].map(([id, label]) => ({ id, label }));
};

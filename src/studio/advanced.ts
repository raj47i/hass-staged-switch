import { isLightEntity, uniqueEntityIds } from "../shared/entities";
import type { HomeAssistant } from "../shared/types";
import { rgbToHex } from "../cards/staged-lights/color";
import { DEFAULT_RGB_HEX } from "../cards/staged-lights/const";
import { brightnessToPercent } from "../cards/staged-lights/stages";
import { DEFAULT_SCENE_LABEL, OFF_ICON } from "./const";
import { advancedSceneId, parseAdvancedSceneId, slugify } from "./ids";
import {
  asRgbPercent,
  DEFAULT_RGB_PERCENT,
  entityIdsFromScenes,
  isIntensityStageName,
  lookToSceneState,
  studioIntensityNames,
  studioStageCount,
  studioStagePercent,
} from "./lights";
import type {
  AdvancedGroup,
  AdvancedLightDraft,
  AdvancedLook,
  AdvancedLookState,
  LightSceneLook,
  SceneConfig,
  SceneEntityState,
} from "./types";

export const newAdvancedLightDraft = (name = ""): AdvancedLightDraft => ({
  name: name.trim(),
  slug: name.trim() ? slugify(name) : "",
  entities: [],
  groups: [],
  looks: [],
});

const offLook = (): SceneEntityState => ({ state: "off" });

const toSceneLook = (
  entityId: string,
  look: AdvancedLookState,
  hass?: HomeAssistant,
): SceneEntityState =>
  lookToSceneState(
    entityId,
    {
      state: look.state,
      brightness: look.brightness,
      hex: look.hex,
      effect: look.effect,
    },
    hass,
  );

export const emptyLookState = (entityId: string): AdvancedLookState =>
  isLightEntity(entityId)
    ? { state: "off", brightness: DEFAULT_RGB_PERCENT }
    : { state: "off" };

export const newAdvancedLook = (
  entities: string[],
  name = "Look",
): AdvancedLook => ({
  name,
  entities: Object.fromEntries(
    uniqueEntityIds(entities).map((entityId) => [entityId, emptyLookState(entityId)]),
  ),
});

export const newAdvancedGroup = (
  name: string,
  entities: string[] = [],
): AdvancedGroup => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name,
  entities: uniqueEntityIds(entities),
  hex: DEFAULT_RGB_HEX,
  brightness: DEFAULT_RGB_PERCENT,
  effect: "",
  sceneLooks: {},
});

export const defaultAdvancedLook = (
  group: AdvancedGroup,
  stage: number,
  count: number,
): LightSceneLook => {
  const peak = asRgbPercent(group.brightness);
  return {
    state: "on",
    brightness: Math.max(
      1,
      Math.round((studioStagePercent(stage, count) / 100) * peak),
    ),
    hex: group.hex || DEFAULT_RGB_HEX,
    effect: group.effect ?? "",
  };
};

export const advancedLookForStage = (
  group: AdvancedGroup,
  stage: number,
  count: number,
  entityId: string,
): LightSceneLook => {
  const override = group.sceneLooks?.[String(stage)]?.[entityId];
  if (!override) {
    return defaultAdvancedLook(group, stage, count);
  }
  return { ...defaultAdvancedLook(group, stage, count), ...override };
};

const groupToStageEntities = (
  group: AdvancedGroup,
  ids: string[],
  stage: number,
  count: number,
  hass?: HomeAssistant,
): Record<string, SceneEntityState> => {
  const members = new Set(uniqueEntityIds(group.entities));
  return Object.fromEntries(
    ids.map((entityId) => {
      if (!members.has(entityId)) {
        return [entityId, offLook()];
      }
      return [
        entityId,
        lookToSceneState(
          entityId,
          advancedLookForStage(group, stage, count, entityId),
          hass,
        ),
      ];
    }),
  );
};

export const advancedLightToScenes = (
  draft: AdvancedLightDraft,
  hass?: HomeAssistant,
): SceneConfig[] => {
  const slug = (draft.slug ?? "").trim() || slugify(draft.name);
  const name = (draft.name ?? "").trim() || slug;
  const ids = uniqueEntityIds(draft.entities ?? []);
  if (!ids.length) {
    return [];
  }
  const scenes: SceneConfig[] = [
    {
      id: advancedSceneId(slug, 0),
      name: `${name} · ${DEFAULT_SCENE_LABEL}`,
      icon: OFF_ICON,
      entities: Object.fromEntries(ids.map((entityId) => [entityId, offLook()])),
    },
  ];
  (draft.groups ?? []).forEach((group) => {
    const members = uniqueEntityIds(group.entities);
    const count = studioStageCount(members, group.stages);
    if (!count) {
      return;
    }
    const names = studioIntensityNames(count);
    const groupName = group.name.trim() || "Group";
    for (let stage = 1; stage <= count; stage += 1) {
      scenes.push({
        id: advancedSceneId(slug, scenes.length),
        name: `${name} · ${groupName} · ${names[stage - 1] ?? `Stage ${stage}`}`,
        entities: groupToStageEntities(group, ids, stage, count, hass),
      });
    }
  });
  (draft.looks ?? []).forEach((look) => {
    scenes.push({
      id: advancedSceneId(slug, scenes.length),
      name: `${name} · ${look.name.trim() || `Look ${scenes.length}`}`,
      entities: Object.fromEntries(
        ids.map((entityId) => [
          entityId,
          toSceneLook(
            entityId,
            look.entities[entityId] ?? emptyLookState(entityId),
            hass,
          ),
        ]),
      ),
    });
  });
  return scenes;
};

export const draftFromAdvancedScenes = (
  slug: string,
  scenes: SceneConfig[] = [],
): AdvancedLightDraft => {
  if (!scenes.length) {
    return { ...newAdvancedLightDraft(slug), slug: slugify(slug), name: slug.trim() || slugify(slug) };
  }
  const ordered = [...scenes].sort(
    (left, right) =>
      (parseAdvancedSceneId(left.id)?.index ?? 0) -
      (parseAdvancedSceneId(right.id)?.index ?? 0),
  );
  const first = ordered[0];
  const name =
    ordered.find((scene) => scene.name.includes(" · "))?.name.split(" · ")[0]?.trim() ||
    first?.name.split(" · ")[0]?.trim() ||
    slug;
  const entities = entityIdsFromScenes(ordered);
  const groups: AdvancedGroup[] = [];
  const looks: AdvancedLook[] = [];
  const clustered = new Map<string, SceneConfig[]>();
  const leftovers: SceneConfig[] = [];
  ordered.slice(1).forEach((scene) => {
    const label = scene.name.split(" · ").slice(1).join(" · ").trim() || "Group";
    const parts = label.split(" · ");
    const suffix = parts[parts.length - 1] ?? "";
    if (parts.length > 1 && isIntensityStageName(suffix)) {
      const groupName = parts.slice(0, -1).join(" · ") || "Group";
      clustered.set(groupName, [...(clustered.get(groupName) ?? []), scene]);
      return;
    }
    leftovers.push(scene);
  });
  clustered.forEach((cluster, groupName) => {
    const onIds = uniqueEntityIds(
      cluster.flatMap((scene) =>
        entities.filter((entityId) => scene.entities[entityId]?.state === "on"),
      ),
    );
    const last = cluster[cluster.length - 1];
    const sample = onIds
      .map((entityId) => last?.entities[entityId])
      .find((look) => look?.state === "on");
    const sceneLooks: Record<string, Record<string, LightSceneLook>> = {};
    cluster.forEach((scene, index) => {
      const slotLooks: Record<string, LightSceneLook> = {};
      entities.forEach((entityId) => {
        const look = scene.entities[entityId];
        if (look?.state !== "on") {
          return;
        }
        slotLooks[entityId] = {
          state: "on",
          brightness: look.brightness
            ? brightnessToPercent(look.brightness)
            : undefined,
          hex: look.rgb_color ? rgbToHex(look.rgb_color) : undefined,
          effect: look.effect ?? "",
        };
      });
      if (Object.keys(slotLooks).length) {
        sceneLooks[String(index + 1)] = slotLooks;
      }
    });
    groups.push({
      id: `loaded-${groups.length}`,
      name: groupName,
      entities: onIds,
      hex: sample?.rgb_color ? rgbToHex(sample.rgb_color) : DEFAULT_RGB_HEX,
      brightness: sample?.brightness
        ? brightnessToPercent(sample.brightness)
        : DEFAULT_RGB_PERCENT,
      effect: sample?.effect ?? "",
      stages: cluster.length,
      sceneLooks,
    });
  });
  leftovers.forEach((scene, index) => {
    const label = scene.name.split(" · ").slice(1).join(" · ").trim() || `Look ${index + 1}`;
    const onIds = entities.filter((entityId) => scene.entities[entityId]?.state === "on");
    const brightnesses = new Set(
      onIds
        .filter((entityId) => isLightEntity(entityId))
        .map((entityId) => scene.entities[entityId]?.brightness ?? 0),
    );
    const asGroup = onIds.length > 0 && brightnesses.size <= 1;
    if (asGroup) {
      const sample = scene.entities[onIds[0] ?? ""];
      groups.push({
        id: `loaded-extra-${index}`,
        name: label,
        entities: onIds,
        hex: sample?.rgb_color ? rgbToHex(sample.rgb_color) : DEFAULT_RGB_HEX,
        brightness: sample?.brightness
          ? brightnessToPercent(sample.brightness)
          : DEFAULT_RGB_PERCENT,
        effect: sample?.effect ?? "",
        stages: 1,
      });
      return;
    }
    looks.push({
      name: label,
      entities: Object.fromEntries(
        entities.map((entityId) => {
          const look = scene.entities[entityId];
          const next: AdvancedLookState = {
            state: look?.state === "on" ? "on" : "off",
          };
          if (look?.brightness) {
            next.brightness = brightnessToPercent(look.brightness);
          }
          if (look?.rgb_color) {
            next.hex = rgbToHex(look.rgb_color);
          }
          if (look?.effect) {
            next.effect = look.effect;
          }
          return [entityId, next];
        }),
      ),
    });
  });
  return { name, slug, entities, groups, looks };
};

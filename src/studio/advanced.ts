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
  lightSceneTitle,
  lookToSceneState,
  studioIntensityNames,
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
  StudioLightMeta,
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

export const DEFAULT_ADVANCED_LEVEL_TEXT = "Min|Low|Mid|High|Max";
export const MAX_ADVANCED_LEVELS = 7;

const normalizeLevelPart = (value: string): string => value.replace(/\s+/g, " ").trim();

export const parseAdvancedLevelNames = (value?: string | string[]): string[] => {
  const raw = Array.isArray(value)
    ? value
    : (value ?? DEFAULT_ADVANCED_LEVEL_TEXT).split("|");
  const names = raw.map(normalizeLevelPart).filter(Boolean);
  if (!names.length) {
    return DEFAULT_ADVANCED_LEVEL_TEXT.split("|");
  }
  return names.slice(0, MAX_ADVANCED_LEVELS);
};

export const serializeAdvancedLevelNames = (names?: string[]): string =>
  parseAdvancedLevelNames(names).join("|");

export const advancedLevelOverflow = (value?: string): number => {
  const count = (value ?? "")
    .split("|")
    .map(normalizeLevelPart)
    .filter(Boolean).length;
  return Math.max(0, count - MAX_ADVANCED_LEVELS);
};

export const advancedGroupLevelNames = (group: AdvancedGroup): string[] => {
  if (group.levelText != null) {
    return parseAdvancedLevelNames(group.levelText);
  }
  if (group.levelNames?.length) {
    return parseAdvancedLevelNames(group.levelNames);
  }
  if (group.stages) {
    return studioIntensityNames(group.stages);
  }
  return parseAdvancedLevelNames(DEFAULT_ADVANCED_LEVEL_TEXT);
};

export const advancedGroupStageCount = (group: AdvancedGroup): number => {
  if (!uniqueEntityIds(group.entities).length) {
    return 0;
  }
  return advancedGroupLevelNames(group).length;
};

export const trimAdvancedLooks = (
  looks: Record<string, Record<string, LightSceneLook>> | undefined,
  keep: number,
): Record<string, Record<string, LightSceneLook>> => {
  const next = cloneAdvancedLooks(looks);
  const limit = Math.max(0, keep);
  Object.keys(next).forEach((key) => {
    const index = Number(key);
    if (Number.isFinite(index) && index > limit) {
      delete next[key];
    }
  });
  return next;
};

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
  stages: parseAdvancedLevelNames(DEFAULT_ADVANCED_LEVEL_TEXT).length,
  levelNames: parseAdvancedLevelNames(DEFAULT_ADVANCED_LEVEL_TEXT),
  levelText: DEFAULT_ADVANCED_LEVEL_TEXT,
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
  const fallback = defaultAdvancedLook(group, stage, count);
  if (!override) {
    return { ...fallback, state: "off" };
  }
  return { ...fallback, ...override };
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
  const named = (draft.name ?? "").trim();
  const slug = (draft.slug ?? "").trim() || (named ? slugify(named) : "");
  const name = named || slug;
  const ids = uniqueEntityIds(draft.entities ?? []);
  if (!slug) {
    return [];
  }
  const meta: StudioLightMeta = {
    entities: ids,
    groups: (draft.groups ?? []).map((group) => {
      const levelNames = advancedGroupLevelNames(group);
      return {
        name: group.name.trim() || "Group",
        entities: uniqueEntityIds(group.entities),
        stages: levelNames.length,
        levelNames,
        hex: group.hex,
        brightness: group.brightness,
        effect: group.effect,
      };
    }),
  };
  if (!ids.length) {
    return name
      ? [
          {
            id: advancedSceneId(slug, 0),
            name: `${name} · ${DEFAULT_SCENE_LABEL}`,
            icon: OFF_ICON,
            entities: {},
            meta,
          },
        ]
      : [];
  }
  const scenes: SceneConfig[] = [
    {
      id: advancedSceneId(slug, 0),
      name: `${name} · ${DEFAULT_SCENE_LABEL}`,
      icon: OFF_ICON,
      entities: Object.fromEntries(ids.map((entityId) => [entityId, offLook()])),
      meta,
    },
  ];
  (draft.groups ?? []).forEach((group) => {
    const members = uniqueEntityIds(group.entities);
    const names = advancedGroupLevelNames(group);
    const count = members.length ? names.length : 0;
    if (!count) {
      return;
    }
    const groupName = group.name.trim() || "Group";
    for (let stage = 1; stage <= count; stage += 1) {
      scenes.push({
        id: advancedSceneId(slug, scenes.length),
        name: `${name} · ${groupName} · ${names[stage - 1] ?? `Stage ${stage}`}`,
        entities: groupToStageEntities(group, ids, stage, count, hass),
        meta,
      });
    }
  });
  (draft.looks ?? []).forEach((look) => {
    scenes.push({
      id: advancedSceneId(slug, scenes.length),
      name: `${name} · ${look.name.trim() || `Look ${scenes.length}`}`,
      meta,
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
  const meta = ordered.find((scene) => scene.meta)?.meta;
  const entities = entityIdsFromScenes(ordered, [
    ...(meta?.entities ?? []),
    ...(meta?.groups ?? []).flatMap((group) => group.entities),
  ]);
  const groups: AdvancedGroup[] = [];
  const looks: AdvancedLook[] = [];
  const clustered = new Map<string, SceneConfig[]>();
  const leftovers: SceneConfig[] = [];
  const consumed = new Set<string>();
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
  const sceneSuffix = (scene: SceneConfig): string =>
    scene.name.split(" · ").slice(2).join(" · ").trim() ||
    scene.name.split(" · ").slice(-1)[0] ||
    "";
  const clusterForGroup = (groupName: string, levelNames?: string[]): SceneConfig[] => {
    const matched = ordered.slice(1).filter((scene) => {
      const label = scene.name.split(" · ").slice(1).join(" · ").trim();
      const parts = label.split(" · ");
      if ((parts[0] ?? "") !== groupName || parts.length < 2) {
        return false;
      }
      const suffix = parts.slice(1).join(" · ");
      return !levelNames?.length || levelNames.includes(suffix);
    });
    if (matched.length) {
      matched.forEach((scene) => consumed.add(scene.id));
      if (!levelNames?.length) {
        return matched;
      }
      const byName = new Map(matched.map((scene) => [sceneSuffix(scene), scene]));
      return levelNames
        .map((label) => byName.get(label))
        .filter((scene): scene is SceneConfig => Boolean(scene));
    }
    const byIntensity = clustered.get(groupName) ?? [];
    byIntensity.forEach((scene) => consumed.add(scene.id));
    return byIntensity;
  };
  const pushGroup = (
    groupName: string,
    cluster: SceneConfig[],
    members: string[],
    hex?: string,
    brightness?: number,
    effect?: string,
    stages?: number,
    levelNames?: string[],
  ) => {
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
    const names =
      levelNames?.length
        ? parseAdvancedLevelNames(levelNames)
        : cluster.length
          ? cluster.map((scene) => sceneSuffix(scene)).filter(Boolean)
          : undefined;
    groups.push({
      id: `loaded-${groups.length}`,
      name: groupName,
      entities: uniqueEntityIds(members.length ? members : onIds),
      hex: hex || (sample?.rgb_color ? rgbToHex(sample.rgb_color) : DEFAULT_RGB_HEX),
      brightness:
        brightness ??
        (sample?.brightness
          ? brightnessToPercent(sample.brightness)
          : DEFAULT_RGB_PERCENT),
      effect: effect ?? sample?.effect ?? "",
      stages: names?.length ?? stages ?? cluster.length,
      levelNames: names,
      levelText: names?.length ? serializeAdvancedLevelNames(names) : undefined,
      sceneLooks,
    });
  };
  if (meta?.groups?.length) {
    meta.groups.forEach((group) => {
      const groupName = group.name.trim() || "Group";
      const names = group.levelNames?.length
        ? parseAdvancedLevelNames(group.levelNames)
        : undefined;
      pushGroup(
        groupName,
        clusterForGroup(groupName, names),
        group.entities,
        group.hex,
        group.brightness,
        group.effect,
        group.stages,
        names,
      );
    });
    leftovers.splice(
      0,
      leftovers.length,
      ...ordered.slice(1).filter((scene) => !consumed.has(scene.id)),
    );
  } else {
    clustered.forEach((cluster, groupName) => {
      pushGroup(groupName, cluster, []);
    });
  }
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

export const cloneAdvancedLooks = (
  looks?: Record<string, Record<string, LightSceneLook>>,
): Record<string, Record<string, LightSceneLook>> =>
  Object.fromEntries(
    Object.entries(looks ?? {}).map(([slot, entities]) => [
      slot,
      Object.fromEntries(
        Object.entries(entities).map(([entityId, look]) => [entityId, { ...look }]),
      ),
    ]),
  );

export const cloneAdvancedDraft = (draft: AdvancedLightDraft): AdvancedLightDraft => ({
  ...draft,
  entities: [...draft.entities],
  groups: (draft.groups ?? []).map((group) => ({
    ...group,
    entities: [...group.entities],
    sceneLooks: cloneAdvancedLooks(group.sceneLooks),
  })),
  looks: (draft.looks ?? []).map((look) => ({
    name: look.name,
    entities: Object.fromEntries(
      Object.entries(look.entities).map(([entityId, state]) => [entityId, { ...state }]),
    ),
  })),
});

export type AdvancedLookKind = "off" | "group" | "look";

export interface AdvancedLookSlot {
  kind: AdvancedLookKind;
  id: string;
  title: string;
  groupKey: string;
  groupLabel: string;
  entities: string[];
  groupIndex?: number;
  stage?: number;
  lookIndex?: number;
}

export const isAdvancedOffScene = (scene: SceneConfig | string): boolean => {
  const id = typeof scene === "string" ? scene : scene.id;
  return parseAdvancedSceneId(id)?.index === 0;
};

export const advancedLookSlots = (
  draft: AdvancedLightDraft,
  hass?: HomeAssistant,
): AdvancedLookSlot[] => {
  const scenes = advancedLightToScenes(draft, hass);
  const slots: AdvancedLookSlot[] = [];
  let index = 0;
  const off = scenes[index];
  if (off) {
    slots.push({
      kind: "off",
      id: off.id,
      title: lightSceneTitle(off),
      groupKey: "default",
      groupLabel: "Default",
      entities: uniqueEntityIds(draft.entities),
    });
    index += 1;
  }
  (draft.groups ?? []).forEach((group, groupIndex) => {
    const members = uniqueEntityIds(group.entities);
    const count = advancedGroupStageCount(group);
    if (!count) {
      return;
    }
    const groupName = group.name.trim() || `Group ${groupIndex + 1}`;
    for (let stage = 1; stage <= count; stage += 1) {
      const scene = scenes[index];
      if (!scene) {
        break;
      }
      slots.push({
        kind: "group",
        id: scene.id,
        title: lightSceneTitle(scene),
        groupKey: group.id,
        groupLabel: groupName,
        entities: members,
        groupIndex,
        stage,
      });
      index += 1;
    }
  });
  (draft.looks ?? []).forEach((_look, lookIndex) => {
    const scene = scenes[index];
    if (!scene) {
      return;
    }
    slots.push({
      kind: "look",
      id: scene.id,
      title: lightSceneTitle(scene),
      groupKey: "custom",
      groupLabel: "Custom looks",
      entities: uniqueEntityIds(draft.entities),
      lookIndex,
    });
    index += 1;
  });
  return slots;
};

export const slotForAdvancedScene = (
  draft: AdvancedLightDraft,
  scene: SceneConfig | string,
  hass?: HomeAssistant,
): AdvancedLookSlot | undefined => {
  const id = typeof scene === "string" ? scene : scene.id;
  return advancedLookSlots(draft, hass).find((slot) => slot.id === id);
};

export const reviewAdvancedSceneGroups = (
  draft: AdvancedLightDraft,
  hass?: HomeAssistant,
): Array<{ key: string; label: string; scenes: SceneConfig[] }> => {
  const scenes = new Map(
    advancedLightToScenes(draft, hass).map((scene) => [scene.id, scene]),
  );
  const order: string[] = [];
  const buckets = new Map<string, { key: string; label: string; scenes: SceneConfig[] }>();
  advancedLookSlots(draft, hass).forEach((slot) => {
    const scene = scenes.get(slot.id);
    if (!scene) {
      return;
    }
    if (!buckets.has(slot.groupKey)) {
      buckets.set(slot.groupKey, {
        key: slot.groupKey,
        label: slot.groupLabel,
        scenes: [],
      });
      order.push(slot.groupKey);
    }
    buckets.get(slot.groupKey)?.scenes.push(scene);
  });
  return order.map((key) => buckets.get(key)).filter((group): group is { key: string; label: string; scenes: SceneConfig[] } => Boolean(group));
};

export const lookFromAdvancedSlot = (
  draft: AdvancedLightDraft,
  slot: AdvancedLookSlot,
  entityId: string,
): LightSceneLook => {
  if (slot.kind === "off") {
    return { state: "off" };
  }
  if (slot.kind === "group" && slot.groupIndex != null && slot.stage != null) {
    const group = draft.groups[slot.groupIndex];
    if (!group) {
      return { state: "off" };
    }
    return advancedLookForStage(
      group,
      slot.stage,
      advancedGroupStageCount(group),
      entityId,
    );
  }
  if (slot.kind === "look" && slot.lookIndex != null) {
    const look = draft.looks[slot.lookIndex]?.entities[entityId];
    return look ?? emptyLookState(entityId);
  }
  return { state: "off" };
};

const savedLook = (scene: SceneConfig, entityId: string): LightSceneLook => {
  const look = scene.entities[entityId];
  if (look?.state !== "on") {
    return { state: "off" };
  }
  return {
    state: "on",
    brightness: look.brightness ? brightnessToPercent(look.brightness) : undefined,
    hex: look.rgb_color ? rgbToHex(look.rgb_color) : undefined,
    effect: look.effect ?? "",
  };
};

export const draftPatchFromAdvancedScene = (
  draft: AdvancedLightDraft,
  scene: SceneConfig,
): Partial<AdvancedLightDraft> | undefined => {
  const slot = slotForAdvancedScene(draft, scene);
  if (!slot || slot.kind === "off") {
    return undefined;
  }
  if (slot.kind === "group" && slot.groupIndex != null && slot.stage != null) {
    const group = draft.groups[slot.groupIndex];
    if (!group) {
      return undefined;
    }
    const sceneLooks = cloneAdvancedLooks(group.sceneLooks);
    const key = String(slot.stage);
    sceneLooks[key] = Object.fromEntries(
      slot.entities.map((entityId) => [entityId, savedLook(scene, entityId)]),
    );
    return {
      groups: draft.groups.map((item, index) =>
        index === slot.groupIndex ? { ...item, sceneLooks } : item,
      ),
    };
  }
  if (slot.kind === "look" && slot.lookIndex != null) {
    return {
      looks: draft.looks.map((look, index) =>
        index === slot.lookIndex
          ? {
              ...look,
              entities: Object.fromEntries(
                uniqueEntityIds(draft.entities).map((entityId) => [
                  entityId,
                  savedLook(scene, entityId),
                ]),
              ),
            }
          : look,
      ),
    };
  }
  return undefined;
};

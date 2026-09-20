import { isLightEntity, uniqueEntityIds } from "../shared/entities";
import type { HomeAssistant } from "../shared/types";
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
  colorFromSceneEntity,
  lookToSceneState,
  studioIntensityNames,
  studioStagePercent,
} from "./lights";
import type {
  AdvancedGroup,
  AdvancedGroupMode,
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
      kelvin: look.kelvin,
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

export const isAdvancedRgbName = (name?: string): boolean =>
  /^(rgb|smart)(?:$|[\s/_-])/i.test((name ?? "").trim());

export const advancedGroupWritesRgbScene = (group: Pick<AdvancedGroup, "mode">): boolean =>
  group.mode === "rgb";

export const isAdvancedRgbGroup = (
  group?: Pick<AdvancedGroup, "mode" | "name">,
): boolean => {
  if (!group) {
    return false;
  }
  if (group.mode === "levels") {
    return false;
  }
  return group.mode === "rgb" || isAdvancedRgbName(group.name);
};

export const nextAdvancedRgbName = (groups: AdvancedGroup[] = []): string => {
  const count = groups.filter((group) => isAdvancedRgbGroup(group)).length;
  return count === 0 ? "RGB" : `RGB ${count + 1}`;
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
  if (advancedGroupWritesRgbScene(group)) {
    return 1;
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

export const newAdvancedRgbGroup = (
  name: string,
  entities: string[] = [],
): AdvancedGroup => ({
  ...newAdvancedGroup(name, entities),
  mode: "rgb",
  stages: 1,
  levelNames: undefined,
  levelText: undefined,
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
    kelvin: group.kelvin,
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
      const rgb = advancedGroupWritesRgbScene(group);
      const levelNames = rgb ? undefined : advancedGroupLevelNames(group);
      return {
        name: group.name.trim() || "Group",
        entities: uniqueEntityIds(group.entities),
        stages: rgb ? 1 : levelNames?.length,
        levelNames,
        hex: group.hex,
        kelvin: group.kelvin,
        brightness: group.brightness,
        effect: group.effect,
        mode: rgb ? "rgb" : "levels",
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
    const rgb = advancedGroupWritesRgbScene(group);
    const names = rgb ? ["On"] : advancedGroupLevelNames(group);
    const count = members.length ? names.length : 0;
    if (!count) {
      return;
    }
    const groupName = group.name.trim() || "Group";
    for (let stage = 1; stage <= count; stage += 1) {
      scenes.push({
        id: advancedSceneId(slug, scenes.length),
        name: rgb
          ? `${name} · ${groupName}`
          : `${name} · ${groupName} · ${names[stage - 1] ?? `Stage ${stage}`}`,
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
  const sceneLabel = (scene: SceneConfig): string =>
    scene.name.split(" · ").slice(1).join(" · ").trim();
  const clusterForGroup = (
    groupName: string,
    levelNames?: string[],
    rgb = false,
  ): SceneConfig[] => {
    const matched = ordered.slice(1).filter((scene) => {
      const label = sceneLabel(scene);
      const parts = label.split(" · ");
      if ((parts[0] ?? "") !== groupName) {
        return false;
      }
      if (rgb) {
        return true;
      }
      if (label === groupName) {
        return true;
      }
      if (parts.length < 2) {
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
    mode?: AdvancedGroupMode,
    kelvin?: number,
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
    const sampleColor = colorFromSceneEntity(sample);
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
          ...colorFromSceneEntity(look),
        };
      });
      if (Object.keys(slotLooks).length) {
        sceneLooks[String(index + 1)] = slotLooks;
      }
    });
    const rgb = mode === "rgb";
    const names =
      rgb
        ? undefined
        : levelNames?.length
          ? parseAdvancedLevelNames(levelNames)
          : cluster.length
            ? cluster.map((scene) => sceneSuffix(scene)).filter(Boolean)
            : undefined;
    const looks = rgb
      ? last && sceneLooks[String(cluster.length)]
        ? { "1": sceneLooks[String(cluster.length)] }
        : sceneLooks["1"]
          ? { "1": sceneLooks["1"] }
          : sceneLooks
      : sceneLooks;
    groups.push({
      id: `loaded-${groups.length}`,
      name: groupName,
      entities: uniqueEntityIds(members.length ? members : onIds),
      mode: rgb ? "rgb" : undefined,
      hex: hex || sampleColor.hex || DEFAULT_RGB_HEX,
      kelvin: kelvin ?? sampleColor.kelvin,
      brightness:
        brightness ??
        (sample?.brightness
          ? brightnessToPercent(sample.brightness)
          : DEFAULT_RGB_PERCENT),
      effect: effect ?? sample?.effect ?? "",
      stages: rgb ? 1 : names?.length ?? stages ?? cluster.length,
      levelNames: names,
      levelText: names?.length ? serializeAdvancedLevelNames(names) : undefined,
      sceneLooks: looks,
    });
  };
  if (meta?.groups?.length) {
    meta.groups.forEach((group) => {
      const groupName = group.name.trim() || "Group";
      const rgb = group.mode === "rgb";
      const names =
        rgb || !group.levelNames?.length
          ? undefined
          : parseAdvancedLevelNames(group.levelNames);
      pushGroup(
        groupName,
        clusterForGroup(groupName, names, rgb),
        group.entities,
        group.hex,
        group.brightness,
        group.effect,
        rgb ? 1 : group.stages,
        names,
        group.mode,
        group.kelvin,
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
      const color = colorFromSceneEntity(sample);
      groups.push({
        id: `loaded-extra-${index}`,
        name: label,
        entities: onIds,
        mode: isAdvancedRgbName(label) ? "rgb" : undefined,
        hex: color.hex || DEFAULT_RGB_HEX,
        kelvin: color.kelvin,
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
          const color = colorFromSceneEntity(look);
          const next: AdvancedLookState = {
            state: look?.state === "on" ? "on" : "off",
            ...color,
          };
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
    mode: group.mode,
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
    ...colorFromSceneEntity(look),
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

import { clamp } from "../shared";
import { isValidEntityId, uniqueEntityIds } from "../shared/entities";
import type { HomeAssistant } from "../shared/types";
import {
  normalizeStudioSceneId,
  parseStudioSceneId,
  uniqueStudioSceneIds,
} from "./ids";
import type { SceneConfig, StudioLightMeta, StudioSetKind, SwitchGroupSummary } from "./types";

const scenePath = (id: string): string => `config/scene/config/${id}`;

const requireApi = (hass?: HomeAssistant) => {
  if (!hass?.callApi) {
    throw new Error("Home Assistant scene config API is not available");
  }
  return hass.callApi.bind(hass);
};

const requireSceneId = (id: string | undefined): string => {
  const normalized = normalizeStudioSceneId(id);
  if (!normalized) {
    throw new Error("Invalid Scene Studio scene id");
  }
  return normalized;
};

export const saveSceneConfig = async (
  hass: HomeAssistant | undefined,
  config: SceneConfig,
): Promise<void> => {
  const callApi = requireApi(hass);
  const id = requireSceneId(config?.id);
  const body = {
    id,
    name: config.name,
    icon: config.icon,
    entities: config.entities,
    ...(config.meta ? { meta: config.meta } : {}),
  };
  try {
    await callApi("POST", scenePath(id), body);
  } catch (error) {
    if (!config.meta) {
      throw error;
    }
    await callApi("POST", scenePath(id), {
      id,
      name: config.name,
      icon: config.icon,
      entities: config.entities,
    });
  }
};

export const deleteSceneConfig = async (
  hass: HomeAssistant | undefined,
  id: string,
): Promise<void> => {
  const callApi = requireApi(hass);
  await callApi("DELETE", scenePath(requireSceneId(id)));
};

export const loadSceneConfig = async (
  hass: HomeAssistant | undefined,
  id: string,
): Promise<SceneConfig> => {
  const callApi = requireApi(hass);
  const raw = await callApi<unknown>("GET", scenePath(requireSceneId(id)));
  const parsed = asSceneConfig(raw, id);
  if (!parsed) {
    throw new Error(`Invalid scene ${id}`);
  }
  rememberConfig(parsed);
  return parsed;
};

const normalizeEntities = (
  raw: unknown,
): SceneConfig["entities"] => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const entities: SceneConfig["entities"] = {};
  Object.entries(raw as Record<string, unknown>).forEach(([entityId, value]) => {
    if (!isValidEntityId(entityId)) {
      return;
    }
    if (typeof value === "string") {
      entities[entityId] = { state: value === "on" ? "on" : "off" };
      return;
    }
    const row = value && typeof value === "object"
      ? (value as {
          state?: unknown;
          brightness?: unknown;
          rgb_color?: unknown;
          effect?: unknown;
        })
      : {};
    const look: SceneConfig["entities"][string] = {
      state: row.state === "on" ? "on" : "off",
    };
    const brightness = Number(row.brightness);
    if (Number.isFinite(brightness) && brightness > 0) {
      look.brightness = Math.round(brightness);
    }
    const rgb = asRgbColor(row.rgb_color);
    if (rgb) {
      look.rgb_color = rgb;
    }
    if (typeof row.effect === "string" && row.effect.trim()) {
      look.effect = row.effect.trim();
    }
    entities[entityId] = look;
  });
  return entities;
};

const asRgbColor = (value: unknown): [number, number, number] | undefined => {
  if (!Array.isArray(value) || value.length < 3) {
    return undefined;
  }
  const rgb = [0, 1, 2].map((index) => Number(value[index]));
  if (rgb.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  return rgb.map((part) => clamp(Math.round(part), 0, 255)) as [
    number,
    number,
    number,
  ];
};

const asIdList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return uniqueEntityIds(
    value.filter((item): item is string => typeof item === "string"),
  );
};

const asStageCount = (value: unknown): number | undefined => {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return undefined;
  }
  return Math.round(count);
};

const asLightMeta = (value: unknown): StudioLightMeta | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const meta: StudioLightMeta = {
    entities: asIdList(row.entities),
    rgb: asIdList(row.rgb),
    warm: asIdList(row.warm),
    white: asIdList(row.white),
    whites: asIdList(row.whites),
    warmStages: asStageCount(row.warmStages),
    whiteStages: asStageCount(row.whiteStages),
    whitesStages: asStageCount(row.whitesStages),
  };
  if (
    meta.entities === undefined &&
    meta.rgb === undefined &&
    meta.warm === undefined &&
    meta.white === undefined &&
    meta.whites === undefined &&
    meta.warmStages === undefined &&
    meta.whiteStages === undefined &&
    meta.whitesStages === undefined
  ) {
    return undefined;
  }
  return meta;
};

const asSceneConfig = (value: unknown, fallbackId: string): SceneConfig | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : fallbackId;
  if (!parseStudioSceneId(id)) {
    return undefined;
  }
  return {
    id,
    name: typeof row.name === "string" ? row.name : id,
    icon: typeof row.icon === "string" ? row.icon : undefined,
    entities: normalizeEntities(row.entities),
    meta: asLightMeta(row.meta) ?? asLightMeta(row.metadata),
  };
};

let lastWrittenScenes: SceneConfig[] = [];
const sceneConfigCache = new Map<string, SceneConfig>();
const forgottenSceneIds = new Set<string>();

const sceneCacheKey = (id: string): string => normalizeStudioSceneId(id) ?? id;

const rememberConfig = (scene: SceneConfig): void => {
  sceneConfigCache.set(sceneCacheKey(scene.id), scene);
};

export const rememberLastWrittenScenes = (scenes: SceneConfig[]): void => {
  lastWrittenScenes = scenes;
  scenes.forEach((scene) => {
    forgottenSceneIds.delete(sceneCacheKey(scene.id));
    rememberConfig(scene);
  });
};

export const forgetLastWrittenScenes = (ids: string[]): void => {
  ids.forEach((id) => {
    const key = sceneCacheKey(id);
    forgottenSceneIds.add(key);
    sceneConfigCache.delete(key);
  });
  lastWrittenScenes = lastWrittenScenes.filter(
    (scene) => !forgottenSceneIds.has(sceneCacheKey(scene.id)),
  );
};

const notForgotten = (scene: SceneConfig): boolean =>
  !forgottenSceneIds.has(sceneCacheKey(scene.id));

const mergeWrittenScenes = (scenes: SceneConfig[]): SceneConfig[] => {
  if (!lastWrittenScenes.length) {
    return scenes;
  }
  const byId = new Map(
    scenes.map((scene) => [normalizeStudioSceneId(scene.id) ?? scene.id, scene]),
  );
  lastWrittenScenes.forEach((scene) => {
    const id = normalizeStudioSceneId(scene.id) ?? scene.id;
    const current = byId.get(id);
    if (!current) {
      byId.set(id, scene);
      return;
    }
    byId.set(id, {
      ...current,
      meta: current.meta ?? scene.meta,
      entities: Object.keys(current.entities).length
        ? current.entities
        : scene.entities,
    });
  });
  const listedIds = new Set(scenes.map((scene) => sceneCacheKey(scene.id)));
  lastWrittenScenes = lastWrittenScenes.filter(
    (scene) => !listedIds.has(sceneCacheKey(scene.id)),
  );
  return [...byId.values()].filter(notForgotten);
};

export const resetStudioHaCaches = (): void => {
  lastWrittenScenes = [];
  sceneConfigCache.clear();
  forgottenSceneIds.clear();
};

export const scenesFromHass = (
  hass?: HomeAssistant,
  options: { includeForgotten?: boolean } = {},
): SceneConfig[] => {
  if (!hass?.states) {
    return [];
  }
  return Object.values(hass.states)
    .map((entity) => {
      const id =
        (typeof entity.attributes.id === "string" && entity.attributes.id) ||
        entity.entity_id.replace(/^scene\./, "");
      return asSceneConfig(
        {
          id,
          name: entity.attributes.friendly_name || entity.entity_id,
          icon: entity.attributes.icon,
          entities: entity.attributes.entities,
        },
        id,
      );
    })
    .filter((scene): scene is SceneConfig => {
      if (!scene) {
        return false;
      }
      return options.includeForgotten ? true : notForgotten(scene);
    });
};

export const loadStudioScenes = async (
  hass?: HomeAssistant,
): Promise<SceneConfig[]> => {
  const listed = scenesFromHass(hass);
  const loaded = await Promise.all(
    listed.map(async (scene) => {
      const cached = sceneConfigCache.get(sceneCacheKey(scene.id));
      if (cached) {
        return {
          ...cached,
          name: scene.name || cached.name,
          entities: Object.keys(scene.entities).length
            ? scene.entities
            : cached.entities,
          meta: cached.meta ?? scene.meta,
        };
      }
      try {
        return await loadSceneConfig(hass, scene.id);
      } catch {
        return cached ?? scene;
      }
    }),
  );
  const merged = mergeWrittenScenes(loaded);
  merged.forEach(rememberConfig);
  return merged;
};

export const studioSceneIdsForSlug = (
  hass: HomeAssistant | undefined,
  slug: string,
  kind?: StudioSetKind,
): string[] =>
  uniqueStudioSceneIds(
    scenesFromHass(hass, { includeForgotten: true })
      .filter((scene) => {
        const parsed = parseStudioSceneId(scene.id);
        return parsed?.slug === slug && (!kind || parsed.kind === kind);
      })
      .map((scene) => scene.id),
  );

export const saveSwitchGroup = async (
  hass: HomeAssistant | undefined,
  next: SceneConfig[],
  previousIds: string[] = [],
): Promise<void> => {
  const keep = new Set(uniqueStudioSceneIds(next.map((scene) => scene.id)));
  const sample = parseStudioSceneId(next[0]?.id);
  const known = sample
    ? studioSceneIdsForSlug(hass, sample.slug, sample.kind)
    : [];
  const stale = uniqueStudioSceneIds([...previousIds, ...known]).filter(
    (id) => !keep.has(id),
  );
  for (const id of stale) {
    try {
      await deleteSceneConfig(hass, id);
    } catch {
      // Leftover may already be gone; still write the keep set.
    }
  }
  for (const scene of next) {
    await saveSceneConfig(hass, scene);
  }
  rememberLastWrittenScenes(next);
};

export const deleteStudioGroup = async (
  hass: HomeAssistant | undefined,
  group: Pick<SwitchGroupSummary, "kind" | "slug" | "scenes">,
): Promise<string[]> => {
  if (!group?.slug) {
    return [];
  }
  const ids = uniqueStudioSceneIds([
    ...(group.scenes ?? []).map((scene) => scene.id),
    ...studioSceneIdsForSlug(hass, group.slug, group.kind),
  ]);
  for (const id of ids) {
    try {
      await deleteSceneConfig(hass, id);
    } catch {
      // Scene may already be gone.
    }
  }
  forgetLastWrittenScenes(ids);
  return ids;
};

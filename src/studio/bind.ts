import {
  applyToggleTargets,
  callHassService,
  isUnreachableError,
  lovelaceType,
  ROOM_LIGHTS_MINI_CARD,
  ROOM_SWITCHES_CARD,
} from "../shared";
import { uniqueEntityIds } from "../shared/entities";
import type { StagedLightsCardConfig } from "../cards/staged-lights/types";
import type { StageConfig, StagedSwitchCardConfig } from "../cards/staged-switch/types";
import type { HomeAssistant } from "../shared/types";
import {
  exclusiveGroupState,
  exclusiveLightsState,
  activeLightRow,
} from "../cards/staged-lights/state";
import {
  findLightsGroup,
  hasLightsGroups,
  lightsGroupModes,
  lightsGroupScene,
} from "../cards/staged-lights/groups";
import {
  hasStoredLightsState,
  resolveLightsState,
} from "../cards/staged-lights/persist";
import type { LightsCardState } from "../cards/staged-lights/types";
import { STUDIO_SCENE_GAP_MS } from "./const";
import {
  deleteStudioGroup,
  forgetLastWrittenScenes,
  loadStudioScenes,
  rememberLastWrittenScenes,
  resetStudioHaCaches,
  saveSwitchGroup,
  scenesFromHass,
} from "./ha";
import {
  advancedSceneId,
  lookSceneId,
  normalizeStudioSceneId,
  parseAdvancedSceneId,
  parseLookSceneId,
  parseSceneId,
  parseStudioSceneId,
  sceneId,
} from "./ids";
import { DEFAULT_RGB_HEX } from "../cards/staged-lights/const";
import {
  advancedGroupLevelNames,
  advancedLookSlots,
  draftFromAdvancedScenes,
  isAdvancedRgbGroup,
} from "./advanced";
import {
  colorFromSceneEntity,
  draftFromLightScenes,
  isLightDefaultSlot,
  isMinimalDraft,
  rowDefaultSlot,
  rowFromLightSlot,
  rowIds,
  simpleLightSlots,
} from "./lights";
import { overlayHiddenEntities, pruneHiddenEntities } from "../shared/entity-buttons";
import { draftFromScenes, summarizeGroups, switchGroupToScenes } from "./scenes";
import type { SceneConfig, StudioSetKind, SwitchGroupSummary } from "./types";

export const sceneEntityId = (
  id: string,
  hass?: HomeAssistant,
): string => {
  const bare = id.replace(/^scene\./, "");
  const direct = `scene.${bare}`;
  if (hass?.states[direct]) {
    return direct;
  }
  const match = Object.values(hass?.states ?? {}).find(
    (entity) =>
      entity.entity_id.startsWith("scene.") && entity.attributes.id === bare,
  );
  return match?.entity_id ?? direct;
};

let sceneCache: SceneConfig[] = [];
let sceneCacheVersion = 0;
let scenesReady = false;
let refreshInFlight: Promise<SceneConfig[]> | undefined;

const sceneKey = (id: string): string => normalizeStudioSceneId(id) ?? id;

export const studioScenesVersion = (): number => sceneCacheVersion;

export const peekStudioScenes = (hass?: HomeAssistant): SceneConfig[] => {
  const listed = scenesFromHass(hass);
  if (!sceneCache.length) {
    return listed;
  }
  if (!listed.length) {
    return sceneCache;
  }
  const byId = new Map(listed.map((scene) => [sceneKey(scene.id), scene]));
  sceneCache.forEach((scene) => {
    const key = sceneKey(scene.id);
    const current = byId.get(key);
    if (!current) {
      byId.set(key, scene);
      return;
    }
    byId.set(key, {
      ...current,
      name: current.name || scene.name,
      meta: scene.meta ?? current.meta,
      entities: Object.keys(scene.entities).length
        ? scene.entities
        : current.entities,
    });
  });
  return [...byId.values()];
};

export const resetStudioSceneCache = (): void => {
  sceneCache = [];
  sceneCacheVersion = 0;
  scenesReady = false;
  refreshInFlight = undefined;
  resetStudioHaCaches();
};

export const rememberWrittenScenes = (scenes: SceneConfig[]): void => {
  if (!scenes.length) {
    return;
  }
  rememberLastWrittenScenes(scenes);
  const byId = new Map(
    sceneCache.map((scene) => [sceneKey(scene.id), scene]),
  );
  scenes.forEach((scene) => {
    byId.set(sceneKey(scene.id), scene);
  });
  sceneCache = [...byId.values()];
  scenesReady = true;
  sceneCacheVersion += 1;
};

export const persistStudioScenes = async (
  hass: HomeAssistant | undefined,
  scenes: SceneConfig[],
  previousIds: string[] = [],
): Promise<void> => {
  if (!hass || !scenes.length) {
    return;
  }
  await saveSwitchGroup(hass, scenes, previousIds);
  rememberWrittenScenes(scenes);
};

export const forgetWrittenScenes = (ids: string[]): void => {
  if (!ids.length) {
    return;
  }
  forgetLastWrittenScenes(ids);
  const drop = new Set(ids.map((id) => sceneKey(id)));
  sceneCache = sceneCache.filter((scene) => !drop.has(sceneKey(scene.id)));
  sceneCacheVersion += 1;
};

export const deleteStudioSet = async (
  hass: HomeAssistant | undefined,
  group?: Pick<SwitchGroupSummary, "kind" | "slug" | "scenes">,
): Promise<string[]> => {
  if (!group?.slug) {
    return [];
  }
  const ids = await deleteStudioGroup(hass, {
    ...group,
    scenes: group.scenes ?? [],
  });
  forgetWrittenScenes(ids);
  return ids;
};

export const refreshStudioScenes = async (
  hass?: HomeAssistant,
): Promise<SceneConfig[]> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = loadStudioScenes(hass)
    .then((scenes) => {
      sceneCache = scenes;
      scenesReady = true;
      sceneCacheVersion += 1;
      return scenes;
    })
    .finally(() => {
      refreshInFlight = undefined;
    });
  return refreshInFlight;
};

export const ensureStudioScenes = async (
  hass: HomeAssistant | undefined,
  slug: string | undefined,
): Promise<number> => {
  if (!hass || !slug) {
    return sceneCacheVersion;
  }
  if (!scenesReady) {
    await refreshStudioScenes(hass);
  }
  return sceneCacheVersion;
};

export const hydrateStudioCard = async (
  hass: HomeAssistant | undefined,
  slug: string | undefined,
  seen: { slug?: string; version: number },
): Promise<{ slug: string; version: number; changed: boolean } | undefined> => {
  if (!hass || !slug) {
    return undefined;
  }
  const version = await ensureStudioScenes(hass, slug);
  return {
    slug,
    version,
    changed: seen.slug !== slug || seen.version !== version,
  };
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const isStudioOffSceneId = (id: string | undefined): boolean => {
  if (!id) {
    return false;
  }
  const look = parseLookSceneId(id);
  if (look) {
    return isLightDefaultSlot(look.slot);
  }
  const advanced = parseAdvancedSceneId(id);
  if (advanced) {
    return advanced.index === 0;
  }
  const staged = parseSceneId(id);
  return staged?.index === 0;
};

export const studioOffSceneId = (id: string | undefined): string | undefined => {
  const parsed = parseStudioSceneId(id);
  if (!parsed) {
    return undefined;
  }
  if (parsed.kind === "light" || parsed.kind === "minimal") {
    return lookSceneId(parsed.kind, parsed.slug, "off");
  }
  if (parsed.kind === "advanced") {
    return advancedSceneId(parsed.slug, 0);
  }
  return sceneId(parsed.slug, 0);
};

const LEGACY_OFF_SLOTS = ["rgb0", "w0", "n0", "t0"] as const;

const studioScenePresent = (
  hass: HomeAssistant | undefined,
  id: string,
): boolean => {
  if (!hass) {
    return false;
  }
  if (hass.states[sceneEntityId(id, hass)]) {
    return true;
  }
  return peekStudioScenes(hass).some((scene) => sceneIdsMatch(scene.id, id));
};

export const studioOffSceneIds = (
  id: string | undefined,
  hass?: HomeAssistant,
): string[] => {
  const canonical = studioOffSceneId(id);
  const parsed = parseStudioSceneId(id);
  if (!canonical || !parsed) {
    return canonical ? [canonical] : [];
  }
  if (parsed.kind !== "light" && parsed.kind !== "minimal") {
    return [canonical];
  }
  if (!hass || studioScenePresent(hass, canonical)) {
    return [canonical];
  }
  const kind = parsed.kind;
  const legacy = LEGACY_OFF_SLOTS.map((slot) =>
    lookSceneId(kind, parsed.slug, slot),
  ).filter((sceneId) => studioScenePresent(hass, sceneId));
  return legacy.length ? legacy : [canonical];
};

const turnOnStudioScene = async (
  hass: HomeAssistant,
  id: string,
): Promise<void> => {
  const entityId = sceneEntityId(id, hass);
  await callHassService(
    hass,
    "scene",
    "turn_on",
    { entity_id: entityId },
    { entity_id: entityId },
  );
};

const sceneIdsMatch = (left: string | undefined, right: string | undefined): boolean =>
  Boolean(left) && (normalizeStudioSceneId(left) ?? left) === (normalizeStudioSceneId(right) ?? right);

const enforceStudioSceneOffs = async (
  hass: HomeAssistant,
  id: string,
): Promise<void> => {
  const parsed = parseStudioSceneId(id);
  if (!parsed) {
    return;
  }
  const mine = peekStudioScenes(hass).filter((scene) => {
    const item = parseStudioSceneId(scene.id);
    return item?.slug === parsed.slug && item?.kind === parsed.kind;
  });
  if (!mine.length) {
    return;
  }
  const target = mine.find((scene) => sceneIdsMatch(scene.id, id));
  const roster = uniqueEntityIds(mine.flatMap((scene) => Object.keys(scene.entities)));
  const offs = roster.filter(
    (entityId) => target?.entities[entityId]?.state !== "on",
  );
  await applyToggleTargets(
    hass,
    offs.map((entity) => ({ entity, state: "off" as const })),
  );
};

export const activateStudioScene = async (
  hass: HomeAssistant | undefined,
  id: string | undefined,
): Promise<boolean> => {
  if (!hass || !id) {
    return false;
  }
  const target = normalizeStudioSceneId(id) ?? id;
  const offIds = studioOffSceneIds(target, hass);
  const canonicalOff = studioOffSceneId(target);
  const playOffs = async (): Promise<{ played: boolean; unreachable?: unknown }> => {
    let played = false;
    let unreachable: unknown;
    for (const offId of offIds) {
      try {
        await turnOnStudioScene(hass, offId);
        played = true;
      } catch (error) {
        if (isUnreachableError(error)) {
          unreachable = error;
        }
      }
    }
    try {
      await enforceStudioSceneOffs(hass, canonicalOff ?? offIds[0] ?? target);
    } catch (error) {
      if (!isUnreachableError(error)) {
        throw error;
      }
      unreachable = unreachable ?? error;
    }
    return { played, unreachable };
  };
  if (canonicalOff && canonicalOff !== target && !isStudioOffSceneId(target)) {
    const { played } = await playOffs();
    if (played) {
      await wait(STUDIO_SCENE_GAP_MS);
    }
  } else if (isStudioOffSceneId(target)) {
    const { unreachable } = await playOffs();
    if (unreachable) {
      throw unreachable;
    }
    return true;
  }
  try {
    await turnOnStudioScene(hass, target);
  } catch (error) {
    try {
      await enforceStudioSceneOffs(hass, target);
    } catch {
      // Keep the original scene error for the card.
    }
    throw error;
  }
  await enforceStudioSceneOffs(hass, target);
  return true;
};

export const previewStudioScene = async (
  hass: HomeAssistant | undefined,
  id: string | undefined,
  fallback?: SceneConfig,
  off?: SceneConfig,
): Promise<void> => {
  if (!hass) {
    return;
  }
  try {
    if (id && (await activateStudioScene(hass, id))) {
      return;
    }
  } catch (error) {
    if (isUnreachableError(error)) {
      throw error;
    }
  }
  if (off?.entities) {
    await callHassService(hass, "scene", "apply", { entities: off.entities });
    await wait(STUDIO_SCENE_GAP_MS);
  }
  const entities = fallback?.entities;
  if (entities && Object.keys(entities).length) {
    await callHassService(hass, "scene", "apply", { entities });
  }
};

export const scenesForSlug = (
  scenes: SceneConfig[],
  slug: string,
  kind?: StudioSetKind,
): SceneConfig[] =>
  scenes.filter((scene) => {
    const parsed = parseStudioSceneId(scene.id);
    return parsed?.slug === slug && (!kind || parsed.kind === kind);
  });

export const studioSetOptions = (
  hass: HomeAssistant | undefined,
  kinds?: StudioSetKind[],
): SwitchGroupSummary[] => {
  const groups = summarizeGroups(peekStudioScenes(hass));
  if (!kinds?.length) {
    return groups;
  }
  return groups.filter((group) => kinds.includes(group.kind));
};

const stageName = (scene: SceneConfig): string =>
  scene.name.split(" · ").slice(1).join(" · ").trim() || scene.name;

export const studioCardTitle = (name = ""): string => {
  const trimmed = name.trim();
  return trimmed.replace(/\s+(lights?|switches?)$/i, "").trim() || trimmed;
};

export const pickCardTitle = (
  override: string | undefined,
  derived: string,
): string => (override !== undefined ? override : derived);

export const studioControlCardType = (kind: StudioSetKind): string =>
  kind === "switch"
    ? lovelaceType(ROOM_SWITCHES_CARD)
    : lovelaceType(ROOM_LIGHTS_MINI_CARD);

export const studioDashboardSets = (
  sets: SwitchGroupSummary[],
  slug?: string,
): SwitchGroupSummary[] => {
  const id = slug?.trim();
  if (!id) {
    return sets;
  }
  return sets.filter((set) => set.slug === id);
};

export const showStudioEditor = (
  config?: { editor?: boolean; studio?: string },
  inPanel = false,
): boolean => Boolean(config?.editor) || (inPanel && !config?.studio?.trim());

export const isStudioPanelHost = (el?: Element | null): boolean => {
  let node: Node | null = el ?? null;
  for (let i = 0; i < 16 && node; i += 1) {
    const name = (node as HTMLElement).localName;
    if (name === "hui-panel-view") {
      return true;
    }
    if (
      name === "hui-masonry-view" ||
      name === "hui-sections-view" ||
      name === "hui-sidebar-view"
    ) {
      return false;
    }
    const root = node.getRootNode();
    node =
      (node as HTMLElement).parentElement ??
      (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
};

export const lightsScenesForSlug = (
  scenes: SceneConfig[],
  slug: string,
): SceneConfig[] => {
  const light = scenesForSlug(scenes, slug, "light");
  return light.length ? light : scenesForSlug(scenes, slug, "minimal");
};

export const lightsStudioKind = (
  slug: string,
  scenes: SceneConfig[] = peekStudioScenes(),
): "light" | "minimal" =>
  lightsScenesForSlug(scenes, slug).some(
    (scene) => parseLookSceneId(scene.id)?.kind === "minimal",
  )
    ? "minimal"
    : "light";

export const lightsCardFromStudio = (
  type: string,
  slug: string,
  scenes: SceneConfig[],
): StagedLightsCardConfig => {
  const mine = lightsScenesForSlug(scenes, slug);
  const draft = draftFromLightScenes(slug, mine);
  const slots = simpleLightSlots(draft);
  const whiteSlots = slots.filter(
    (slot) => slot.row === "white" || slot.row === "whites",
  );
  return {
    type,
    studio: slug,
    title: studioCardTitle(draft.name),
    rgb: draft.rgb,
    warm: isMinimalDraft(draft) ? [] : draft.warm,
    white: isMinimalDraft(draft) ? rowIds(draft, "whites") : draft.white,
    switches: draft.entities,
    rgb_presets: draft.presets,
    warm_stages: slots
      .filter((slot) => slot.row === "warm")
      .map((slot) => ({ name: slot.label.split(" · ").slice(1).join(" · ") || slot.label })),
    white_stages: whiteSlots.map((slot) => ({
      name: slot.label.split(" · ").slice(1).join(" · ") || slot.label,
    })),
  };
};

export const lightsCardFromAdvanced = (
  type: string,
  slug: string,
  scenes: SceneConfig[],
): StagedLightsCardConfig => {
  const mine = scenesForSlug(scenes, slug, "advanced");
  const draft = draftFromAdvancedScenes(slug, mine);
  const slots = advancedLookSlots(draft);
  const groups = (draft.groups ?? [])
    .map((group, groupIndex) => {
      const rgb = isAdvancedRgbGroup(group);
      const groupSlots = slots.filter(
        (item) => item.kind === "group" && item.groupIndex === groupIndex,
      );
      const stages = rgb
        ? (() => {
            const last = groupSlots[groupSlots.length - 1];
            return last?.id ? [{ name: "On", scene: last.id }] : [];
          })()
        : advancedGroupLevelNames(group)
            .map((name, index) => {
              const slot = groupSlots.find((item) => item.stage === index + 1);
              return slot?.id ? { name, scene: slot.id } : undefined;
            })
            .filter((stage): stage is { name: string; scene: string } => Boolean(stage));
      if (!stages.length) {
        return undefined;
      }
      const scene = rgb ? stages[0]?.scene : undefined;
      return {
        id: group.id || `group-${groupIndex}`,
        name: group.name.trim() || `Group ${groupIndex + 1}`,
        icon: rgb ? "mdi:palette" : "mdi:lightbulb-group",
        kind: rgb ? ("rgb" as const) : ("group" as const),
        entities: uniqueEntityIds(group.entities),
        hex: group.hex || DEFAULT_RGB_HEX,
        kelvin: group.kelvin,
        scene,
        stages,
      };
    })
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const looks = (draft.looks ?? [])
    .map((look, lookIndex) => {
      const slot = slots.find(
        (item) => item.kind === "look" && item.lookIndex === lookIndex,
      );
      if (!slot?.id) {
        return undefined;
      }
      const name = look.name.trim() || `Look ${lookIndex + 1}`;
      return {
        id: `look-${lookIndex}`,
        name,
        icon: "mdi:palette",
        kind: "look" as const,
        scene: slot.id,
        stages: [{ name, scene: slot.id }],
      };
    })
    .filter((look): look is NonNullable<typeof look> => Boolean(look));
  return {
    type,
    studio: slug,
    title: studioCardTitle(draft.name),
    switches: draft.entities,
    groups,
    looks,
  };
};

export const mergeLightsStudioConfig = (
  config: StagedLightsCardConfig,
  scenes: SceneConfig[] = peekStudioScenes(),
): StagedLightsCardConfig => {
  if (!config.studio) {
    return config;
  }
  const advanced = scenesForSlug(scenes, config.studio, "advanced");
  const mine = advanced.length ? advanced : lightsScenesForSlug(scenes, config.studio);
  if (!mine.length) {
    return config;
  }
  const derived = advanced.length
    ? lightsCardFromAdvanced(config.type, config.studio, mine)
    : lightsCardFromStudio(config.type, config.studio, mine);
  const hidden = pruneHiddenEntities(config.hidden_entities ?? [], derived.switches ?? []);
  return {
    ...derived,
    show_switches: config.show_switches,
    hidden_entities: hidden.length ? hidden : undefined,
    switches: overlayHiddenEntities(derived.switches ?? [], hidden),
    title: pickCardTitle(config.title, derived.title ?? ""),
    title_align: config.title_align,
    entity: config.entity,
  };
};

const sceneSwitches = (scene: SceneConfig): StageConfig["switches"] =>
  Object.fromEntries(
    Object.entries(scene.entities).map(([entityId, look]) => [entityId, look.state]),
  );

export const switchCardFromStudio = (
  type: string,
  slug: string,
  scenes: SceneConfig[],
): StagedSwitchCardConfig => {
  const parsed = scenes
    .map((scene) => ({ scene, id: parseStudioSceneId(scene.id) }))
    .filter((item) => item.id?.slug === slug);
  const kind = parsed[0]?.id?.kind;
  const mine = parsed.map((item) => item.scene);
  if (kind === "advanced") {
    const draft = draftFromAdvancedScenes(slug, mine);
    const ordered = [...mine].sort(
      (left, right) =>
        (parseAdvancedSceneId(left.id)?.index ?? 0) -
        (parseAdvancedSceneId(right.id)?.index ?? 0),
    );
    return {
      type,
      studio: slug,
      title: draft.name,
      switches: draft.entities,
      stage_names: ordered.map((scene, index) => stageName(scene) || (index === 0 ? "Off" : `Stage ${index}`)),
      stages: ordered.map((scene, index) => ({
        name: stageName(scene) || (index === 0 ? "Off" : `Stage ${index}`),
        icon: scene.icon,
        switches: sceneSwitches(scene),
      })),
    };
  }
  const draft = draftFromScenes(slug, mine);
  const built = switchGroupToScenes(draft);
  return {
    type,
    studio: slug,
    title: draft.name,
    switches: draft.entities,
    stage_names: draft.stage_names,
    stages: built.map((scene, index) => ({
      name: draft.stage_names[index] || stageName(scene),
      icon: scene.icon,
      switches: sceneSwitches(scene),
    })),
  };
};

export const mergeSwitchStudioConfig = (
  config: StagedSwitchCardConfig,
  scenes: SceneConfig[] = peekStudioScenes(),
): StagedSwitchCardConfig => {
  if (!config.studio) {
    return config;
  }
  const mine = scenesForSlug(scenes, config.studio);
  if (!mine.length) {
    return config;
  }
  const derived = switchCardFromStudio(config.type, config.studio, mine);
  const hidden = pruneHiddenEntities(config.hidden_entities ?? [], derived.switches ?? []);
  return {
    ...derived,
    show_switches: config.show_switches,
    hidden_entities: hidden.length ? hidden : undefined,
    show_stage_labels: config.show_stage_labels,
    switches: overlayHiddenEntities(derived.switches ?? [], hidden),
    title: pickCardTitle(config.title, derived.title ?? ""),
    title_align: config.title_align,
  };
};

export const studioChildCardConfig = (
  kind: StudioSetKind,
  slug: string,
  parent?: {
    show_switches?: boolean;
    hidden_entities?: string[];
    title?: string;
    title_align?: string;
  },
): {
  type: string;
  studio: string;
  show_switches?: boolean;
  hidden_entities?: string[];
  title?: string;
  title_align?: string;
} => ({
  type: studioControlCardType(kind),
  studio: slug,
  ...(parent?.show_switches === true ? { show_switches: true } : {}),
  ...(parent?.hidden_entities?.length
    ? { hidden_entities: parent.hidden_entities }
    : {}),
  ...(parent && "title" in parent ? { title: parent.title } : {}),
  ...(parent?.title_align && parent.title_align !== "left"
    ? { title_align: parent.title_align }
    : {}),
});

const sceneIdForAdvancedLightsState = (
  slug: string,
  state?: LightsCardState,
  config?: StagedLightsCardConfig,
): string | undefined => {
  if (!slug) {
    return undefined;
  }
  if (!state?.group?.on) {
    return advancedSceneId(slug, 0);
  }
  const mode =
    findLightsGroup(config, state.group.id) ??
    lightsGroupModes(config).find((item) => item.id === state.group?.id);
  return (
    lightsGroupScene(mode, state.group.stage) ??
    advancedSceneId(slug, 0)
  );
};

export const sceneIdForLightsState = (
  slug: string,
  state?: LightsCardState,
  kind: "light" | "minimal" = lightsStudioKind(slug),
  config?: StagedLightsCardConfig,
): string | undefined => {
  if (!slug) {
    return undefined;
  }
  if (hasLightsGroups(config) || state?.group?.id) {
    return sceneIdForAdvancedLightsState(slug, state, config);
  }
  const id = (slot: string) => lookSceneId(kind, slug, slot);
  if (!state?.rgb.on && !state?.warm.on && !state?.white.on) {
    return id(rowDefaultSlot());
  }
  if (state.rgb.on) {
    return id("rgb");
  }
  if (kind === "minimal") {
    const stage = Math.max(
      1,
      Math.round((state.white.on ? state.white.stage : state.warm.stage) || 1),
    );
    return id(`t${stage}`);
  }
  if (state.warm.on) {
    return id(`w${Math.max(1, Math.round(state.warm.stage || 1))}`);
  }
  if (state.white.on) {
    return id(`n${Math.max(1, Math.round(state.white.stage || 1))}`);
  }
  return id(rowDefaultSlot("rgb"));
};

export const sceneIdForSwitchIndex = (
  slug: string,
  index: number,
  scenes: SceneConfig[] = [],
): string | undefined => {
  const kind = parseStudioSceneId(scenes[0]?.id)?.kind;
  if (kind === "advanced") {
    return advancedSceneId(slug, index);
  }
  if (kind === "light" || kind === "minimal") {
    return undefined;
  }
  return sceneId(slug, index);
};

export const isRgbLiveTweak = (
  previous: LightsCardState,
  next: LightsCardState,
): boolean => {
  if (
    previous.rgb?.on &&
    next.rgb?.on &&
    (previous.rgb.brightness !== next.rgb.brightness ||
      previous.rgb.hex !== next.rgb.hex ||
      previous.rgb.kelvin !== next.rgb.kelvin)
  ) {
    return true;
  }
  return Boolean(
    previous.group?.on &&
      next.group?.on &&
      previous.group.id === next.group.id &&
      (previous.group.hex !== next.group.hex ||
        previous.group.brightness !== next.group.brightness ||
        previous.group.kelvin !== next.group.kelvin),
  );
};

const entityOn = (hass: HomeAssistant | undefined, entityId: string): boolean =>
  hass?.states[entityId]?.state === "on";

const rgbClose = (
  left?: [number, number, number],
  right?: unknown,
): boolean => {
  if (!left || !Array.isArray(right) || right.length < 3) {
    return false;
  }
  return left.every((value, index) => Math.abs(value - Number(right[index])) <= 18);
};

const cardRowFromStudioSlot = (slot?: string): LightsCardState["last"] => {
  const row = rowFromLightSlot(slot);
  return row === "whites" ? "white" : row;
};

const scoreSceneAgainstHass = (
  hass: HomeAssistant,
  scene: SceneConfig,
  actuallyOn: Set<string>,
): { score: number; error: number } => {
  const wantOn = Object.entries(scene.entities)
    .filter(([, look]) => look.state === "on")
    .map(([entityId]) => entityId);
  let score = 0;
  let error = 0;
  let samples = 0;
  if (!wantOn.length) {
    return { score: actuallyOn.size === 0 ? 1 : 0, error: 0 };
  }
  const hits = wantOn.filter((entityId) => actuallyOn.has(entityId)).length;
  const extra = [...actuallyOn].filter((entityId) => !wantOn.includes(entityId)).length;
  score = hits / (wantOn.length + extra);
  wantOn.forEach((entityId) => {
    const look = scene.entities[entityId];
    if (!look || !actuallyOn.has(entityId)) {
      return;
    }
    const brightness = Number(hass.states[entityId]?.attributes.brightness);
    if (look.brightness && Number.isFinite(brightness)) {
      error += Math.abs(brightness - look.brightness);
      samples += 1;
    }
    if (rgbClose(look.rgb_color, hass.states[entityId]?.attributes.rgb_color)) {
      score += 0.08 / wantOn.length;
    }
  });
  return { score, error: samples ? error / samples : wantOn.length ? 64 : 0 };
};

const advancedStateFromStudio = (
  hass: HomeAssistant | undefined,
  config: StagedLightsCardConfig,
  scenes: SceneConfig[],
  fallback?: LightsCardState,
): LightsCardState => {
  const mine = scenesForSlug(scenes, config.studio ?? "", "advanced");
  const base = exclusiveGroupState(fallback, undefined);
  if (!hass || !mine.length) {
    return fallback ?? base;
  }
  const roster = uniqueEntityIds(mine.flatMap((scene) => Object.keys(scene.entities)));
  const actuallyOn = new Set(roster.filter((entityId) => entityOn(hass, entityId)));
  let best: { score: number; error: number; id: string } | undefined;
  mine.forEach((scene) => {
    if (!parseAdvancedSceneId(scene.id)) {
      return;
    }
    const { score, error } = scoreSceneAgainstHass(hass, scene, actuallyOn);
    const betterScore = !best || score > best.score + 0.02;
    const closerLook =
      best && Math.abs(score - best.score) <= 0.02 && error < best.error - 8;
    if (betterScore || closerLook) {
      best = { score, error, id: scene.id };
    }
  });
  if (!best || best.score < 0.45) {
    return fallback ?? base;
  }
  const winner = best;
  if (parseAdvancedSceneId(winner.id)?.index === 0) {
    return base;
  }
  const modes = lightsGroupModes(config);
  for (const mode of modes) {
    const stages = mode.stages ?? [];
    const stageIndex = stages.findIndex(
      (stage) => stage.scene && sceneIdsMatch(stage.scene, winner.id),
    );
    if (stageIndex >= 0 || (mode.scene && sceneIdsMatch(mode.scene, winner.id))) {
      const scene = mine.find((item) => sceneIdsMatch(item.id, winner.id));
      const sample = Object.values(scene?.entities ?? {}).find((look) => look.state === "on");
      const color = colorFromSceneEntity(sample);
      return exclusiveGroupState(base, mode.id, stageIndex >= 0 ? stageIndex + 1 : 1, {
        hex: color.hex || mode.hex,
        brightness: sample?.brightness,
        kelvin: color.kelvin,
      });
    }
  }
  return base;
};

export const lightsStateFromStudio = (
  hass: HomeAssistant | undefined,
  config: StagedLightsCardConfig,
  scenes: SceneConfig[],
  fallback?: LightsCardState,
): LightsCardState => {
  if (hasLightsGroups(config)) {
    return advancedStateFromStudio(hass, config, scenes, fallback);
  }
  const mine = lightsScenesForSlug(scenes, config.studio ?? "");
  const base = exclusiveLightsState(fallback, undefined);
  if (!hass || !mine.length) {
    return fallback ?? base;
  }
  const roster = uniqueEntityIds(mine.flatMap((scene) => Object.keys(scene.entities)));
  const actuallyOn = new Set(roster.filter((entityId) => entityOn(hass, entityId)));
  let best: { score: number; error: number; slot: string } | undefined;
  mine.forEach((scene) => {
    const slot = parseLookSceneId(scene.id)?.slot;
    if (!slot) {
      return;
    }
    const { score, error } = scoreSceneAgainstHass(hass, scene, actuallyOn);
    const betterScore = !best || score > best.score + 0.02;
    const closerLook =
      best && Math.abs(score - best.score) <= 0.02 && error < best.error - 8;
    if (betterScore || closerLook) {
      best = { score, error, slot };
    }
  });
  if (!best || best.score < 0.45) {
    return base;
  }
  if (isLightDefaultSlot(best.slot)) {
    return {
      ...base,
      last: cardRowFromStudioSlot(best.slot) ?? fallback?.last ?? base.last,
    };
  }
  if (best.slot === "rgb") {
    const rgbScene = mine.find((scene) => parseLookSceneId(scene.id)?.slot === "rgb");
    const sample = Object.values(rgbScene?.entities ?? {}).find((look) => look.state === "on");
    const color = colorFromSceneEntity(sample);
    return exclusiveLightsState(base, "rgb", {
      brightness: sample?.brightness,
      hex: color.hex,
      kelvin: color.kelvin,
    });
  }
  const tone = /^(w|n|t)(\d+)$/.exec(best.slot);
  if (!tone) {
    return base;
  }
  const row = tone[1] === "w" ? "warm" : "white";
  return exclusiveLightsState(base, row, { stage: Number(tone[2]) || 1 });
};

export const resolveStudioLightsState = (
  hass: HomeAssistant | undefined,
  config: StagedLightsCardConfig | undefined,
  helperState: unknown,
  storageKey: string,
  scenes: SceneConfig[] = peekStudioScenes(hass),
): LightsCardState => {
  if (!config?.studio) {
    return resolveLightsState(helperState, storageKey);
  }
  const stored = hasStoredLightsState(helperState, storageKey)
    ? resolveLightsState(helperState, storageKey)
    : exclusiveLightsState(undefined, undefined);
  return lightsStateFromStudio(hass, config, scenes, stored);
};

export const studioLooksMatch = (
  left?: LightsCardState,
  right?: LightsCardState,
): boolean => {
  const leftGroup = left?.group?.on ? left.group.id : undefined;
  const rightGroup = right?.group?.on ? right.group.id : undefined;
  if (leftGroup || rightGroup || left?.group || right?.group) {
    if (leftGroup !== rightGroup) {
      return false;
    }
    if (!leftGroup) {
      return true;
    }
    return left?.group?.stage === right?.group?.stage;
  }
  const row = activeLightRow(left);
  if (row !== activeLightRow(right)) {
    return false;
  }
  if (!row) {
    return true;
  }
  if (row === "rgb") {
    return true;
  }
  return left?.[row]?.stage === right?.[row]?.stage;
};

export const studioHasContent = (
  config: { studio?: string } | undefined,
): boolean => Boolean(config?.studio?.trim());

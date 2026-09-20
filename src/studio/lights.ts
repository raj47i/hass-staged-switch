import {
  isLightEntity,
  lightAdjustKind,
  uniqueEntityIds,
} from "../shared/entities";
import { clamp } from "../shared/hass";
import type { HomeAssistant } from "../shared/types";
import { kelvinToHex, DEFAULT_KELVIN } from "../cards/staged-lights/adjust";
import { hexToHue, hexToRgb, hueToHex, rgbToHex } from "../cards/staged-lights/color";
import {
  DEFAULT_LIGHT_STAGES,
  DEFAULT_RGB_BRIGHTNESS,
  DEFAULT_RGB_HEX,
  INTENSITY_NAMES,
  MAX_LIGHT_STAGES,
  MIN_LIGHT_STAGES,
  MIN_WARM_WHITE_ENTITIES,
  ROW_META,
} from "../cards/staged-lights/const";
import {
  brightnessToPercent,
  parseRgbPercent,
  percentToBrightness,
} from "../cards/staged-lights/stages";
import { DEFAULT_SCENE_LABEL, OFF_ICON, STUDIO_RGB_PRESETS } from "./const";
import { lookSceneId, parseLookSceneId, slugify } from "./ids";
import type {
  LightGroupDraft,
  LightProfile,
  LightRowId,
  LightSceneLook,
  SceneConfig,
  SceneEntityState,
} from "./types";

export const DEFAULT_RGB_PERCENT = brightnessToPercent(DEFAULT_RGB_BRIGHTNESS);

export const asRgbPercent = (value: unknown): number =>
  parseRgbPercent(value) ?? DEFAULT_RGB_PERCENT;

export const colorFromSceneEntity = (
  look?: SceneEntityState,
): Pick<LightSceneLook, "brightness" | "hex" | "kelvin" | "effect"> => {
  if (!look || look.state !== "on") {
    return {};
  }
  const hex = look.rgb_color
    ? rgbToHex(look.rgb_color)
    : look.hs_color
      ? hueToHex(Number(look.hs_color[0]) || 0)
      : look.color_temp_kelvin
        ? kelvinToHex(look.color_temp_kelvin)
        : undefined;
  return {
    brightness: look.brightness ? brightnessToPercent(look.brightness) : undefined,
    hex,
    kelvin: look.color_temp_kelvin,
    effect: look.effect ?? "",
  };
};

export const newLightGroupDraft = (
  name = "",
  profile: LightProfile = "simple",
): LightGroupDraft => ({
  name: name.trim(),
  slug: name.trim() ? slugify(name) : "",
  profile,
  entities: [],
  rgb: [],
  warm: [],
  white: [],
  whites: [],
  hex: DEFAULT_RGB_HEX,
  presets: [...STUDIO_RGB_PRESETS],
  brightness: DEFAULT_RGB_PERCENT,
  effect: "",
  musicSync: false,
  sceneLooks: {},
});

export const cloneLightLooks = (
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

export const slotStageIndex = (
  slot: string,
  prefix: "w" | "n" | "t",
): number | undefined => {
  if (slot.length < 2 || slot[0] !== prefix) {
    return undefined;
  }
  const n = Number(slot.slice(1));
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

export const trimStageLooks = (
  looks: Record<string, Record<string, LightSceneLook>> | undefined,
  prefix: "w" | "n" | "t",
  stages: number,
): Record<string, Record<string, LightSceneLook>> => {
  const next = cloneLightLooks(looks);
  const keep = Math.max(0, stages);
  Object.keys(next).forEach((slot) => {
    const index = slotStageIndex(slot, prefix);
    if (index != null && index > keep) {
      delete next[slot];
    }
  });
  return next;
};

export const cloneLightDraft = (draft: LightGroupDraft): LightGroupDraft => ({
  ...draft,
  profile: draft.profile === "minimal" ? "minimal" : "simple",
  entities: [...(draft.entities ?? [])],
  rgb: [...(draft.rgb ?? [])],
  warm: [...(draft.warm ?? [])],
  white: [...(draft.white ?? [])],
  whites: [...(draft.whites ?? [])],
  presets: [...(draft.presets?.length ? draft.presets : STUDIO_RGB_PRESETS)],
  sceneLooks: cloneLightLooks(draft.sceneLooks),
});

export const lightSceneTitle = (scene: SceneConfig): string =>
  scene.name.includes(" · ") ? scene.name.split(" · ").slice(1).join(" · ") : scene.name;

export const lightSceneOnIds = (scene: SceneConfig, ids: string[]): string[] =>
  ids.filter((entityId) => scene.entities[entityId]?.state === "on");

export const allLightIds = (draft: LightGroupDraft): string[] =>
  uniqueEntityIds([
    ...(draft.entities ?? []),
    ...(draft.rgb ?? []),
    ...(draft.warm ?? []),
    ...(draft.white ?? []),
    ...(draft.whites ?? []),
  ]);

export const entityIdsFromScenes = (
  scenes: SceneConfig[],
  extra: string[] = [],
): string[] =>
  uniqueEntityIds([
    ...scenes.flatMap((scene) => Object.keys(scene.entities)),
    ...extra,
  ]);

export const rowIds = (draft: LightGroupDraft, row: LightRowId): string[] =>
  uniqueEntityIds(draft[row] ?? []);

export const warmWhiteStageCount = (ids: string[], override?: number): number => {
  if (ids.length < MIN_WARM_WHITE_ENTITIES) {
    return 0;
  }
  if (override == null || !Number.isFinite(override)) {
    return DEFAULT_LIGHT_STAGES;
  }
  return clamp(Math.round(override), MIN_LIGHT_STAGES, MAX_LIGHT_STAGES);
};

export const studioStageCount = (ids: string[], override?: number): number => {
  if (!ids.length) {
    return 0;
  }
  if (override == null || !Number.isFinite(override)) {
    return ids.length <= 2 ? 3 : 5;
  }
  return Math.max(1, Math.round(override));
};

export const isIntensityStageName = (value: string): boolean => {
  const named = new Set(Object.values(INTENSITY_NAMES).flat());
  return named.has(value) || /^Step \d+$/.test(value);
};

export const studioIntensityNames = (count: number): string[] => {
  if (count <= 0) {
    return [];
  }
  const named = INTENSITY_NAMES[count];
  if (named) {
    return named;
  }
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) {
      return "Min";
    }
    if (index === count - 1) {
      return "Max";
    }
    return `Step ${index + 1}`;
  });
};

export const INTENSITY_PERCENTS: Record<number, number[]> = {
  2: [20, 100],
  3: [20, 60, 100],
  4: [15, 40, 70, 100],
  5: [5, 25, 50, 75, 100],
};

export const WARM_HEX = DEFAULT_RGB_HEX;
export const NEUTRAL_HEX = "#f3eadc";
export const WHITE_HEX = "#ffffff";
export const MIN_WHITES_ENTITIES = 1;
export const MIN_WHITES_STAGES = 2;
export const MAX_WHITES_STAGES = 4;
export const DEFAULT_WHITES_STAGES = 3;
export const WHITES_DIM_PERCENT = 20;

export const isMinimalDraft = (draft?: LightGroupDraft): boolean =>
  draft?.profile === "minimal";

export const studioRows = (draft?: LightGroupDraft): LightRowId[] =>
  isMinimalDraft(draft) ? ["rgb", "whites"] : ["rgb", "warm", "white"];

export const STUDIO_ROW_META: Record<LightRowId, { label: string; icon: string }> = {
  rgb: ROW_META.rgb,
  warm: ROW_META.warm,
  white: ROW_META.white,
  whites: { label: "Whites", icon: "mdi:lightbulb-group" },
};

export const whitesStageNames = (count: number): string[] => {
  if (count <= 2) {
    return ["Min", "Max"];
  }
  if (count === 3) {
    return ["Warm", "Neutral", "White"];
  }
  return ["Dim", "Warm", "Neutral", "White"];
};

const whitesStageLabel = (stage: number, stages: number): string => {
  const names = whitesStageNames(stages);
  const current = Number.isFinite(stage) ? Math.round(stage) : 1;
  const index = Math.max(0, Math.min(names.length - 1, current - 1));
  return names[index] ?? "White";
};

export const whitesStageHex = (stage: number, stages: number): string => {
  const name = whitesStageLabel(stage, stages);
  if (name === "White") {
    return WHITE_HEX;
  }
  if (name === "Neutral") {
    return NEUTRAL_HEX;
  }
  return WARM_HEX;
};

export const whitesStagePercent = (stage: number, stages: number): number => {
  const name = whitesStageLabel(stage, stages);
  if (name === "Min" || name === "Dim") {
    return WHITES_DIM_PERCENT;
  }
  return 100;
};

export const WHITES_STAGE_CHOICES: Array<{ count: number; label: string }> =
  Array.from({ length: MAX_WHITES_STAGES - MIN_WHITES_STAGES + 1 }, (_, index) => {
    const count = MIN_WHITES_STAGES + index;
    return { count, label: `${count} · ${whitesStageNames(count).join("/")}` };
  });

const withoutToneLooks = (
  looks: Record<string, Record<string, LightSceneLook>>,
): Record<string, Record<string, LightSceneLook>> => {
  const next = { ...looks };
  Object.keys(next).forEach((slot) => {
    if (slotStageIndex(slot, "t") != null) {
      delete next[slot];
    }
  });
  return next;
};

export const remapWhitesLooks = (
  looks: Record<string, Record<string, LightSceneLook>> | undefined,
  from: number,
  to: number,
): Record<string, Record<string, LightSceneLook>> => {
  const source = cloneLightLooks(looks);
  if (from === to) {
    return trimStageLooks(source, "t", to);
  }
  // 2-level names do not line up with Warm/Neutral/White.
  if (from === 2 || to === 2 || from < MIN_WHITES_STAGES || to < MIN_WHITES_STAGES) {
    return withoutToneLooks(source);
  }
  const tones: Record<number, Record<string, LightSceneLook>> = {};
  Object.entries(source).forEach(([slot, entities]) => {
    const index = slotStageIndex(slot, "t");
    if (index) {
      tones[index] = entities;
    }
  });
  const rest = withoutToneLooks(source);
  const write = (stage: number, entities?: Record<string, LightSceneLook>) => {
    if (entities && Object.keys(entities).length) {
      rest[`t${stage}`] = entities;
    }
  };
  // 4-level prepends Dim in front of Warm/Neutral/White.
  if (from === 3 && to === 4) {
    write(2, tones[1]);
    write(3, tones[2]);
    write(4, tones[3]);
    return rest;
  }
  if (from === 4 && to === 3) {
    write(1, tones[2]);
    write(2, tones[3]);
    write(3, tones[4]);
    return rest;
  }
  return trimStageLooks(source, "t", to);
};

export const whitesStageCount = (ids: string[], override?: number): number => {
  if (ids.length < MIN_WHITES_ENTITIES) {
    return 0;
  }
  if (override == null || !Number.isFinite(override)) {
    return DEFAULT_WHITES_STAGES;
  }
  return clamp(Math.round(override), MIN_WHITES_STAGES, MAX_WHITES_STAGES);
};

export const lookKind = (draft?: LightGroupDraft): "light" | "minimal" =>
  isMinimalDraft(draft) ? "minimal" : "light";

export const studioStagePercent = (stage: number, count: number): number => {
  const total = Math.max(1, Number.isFinite(count) ? Math.round(count) : 1);
  const current = Math.min(
    total,
    Math.max(1, Number.isFinite(stage) ? Math.round(stage) : 1),
  );
  const named = INTENSITY_PERCENTS[total];
  if (named) {
    return named[current - 1] ?? 100;
  }
  return Math.max(1, Math.min(100, Math.round((current / total) * 100)));
};

export interface SimpleLightSlot {
  slot: string;
  row: LightRowId;
  label: string;
  entities: string[];
  stage?: number;
  stages?: number;
}

export const rowDefaultSlot = (_row?: LightRowId): string => "off";

export const isLightDefaultSlot = (slot?: string): boolean =>
  slot === "off" || slot === "rgb0" || slot === "w0" || slot === "n0" || slot === "t0";

export const rowFromLightSlot = (slot?: string): LightRowId | undefined => {
  if (!slot || slot === "off") {
    return undefined;
  }
  if (slot === "rgb" || slot === "rgb0") {
    return "rgb";
  }
  if (slot.startsWith("t")) {
    return "whites";
  }
  if (slot.startsWith("w")) {
    return "warm";
  }
  if (slot.startsWith("n")) {
    return "white";
  }
  return undefined;
};

export const lightSlotOrder = (slot: string): number => {
  if (slot === "off") {
    return 0;
  }
  if (slot === "rgb0") {
    return 1;
  }
  if (slot === "rgb") {
    return 2;
  }
  const match = /^(w|n|t)(\d+)$/.exec(slot);
  if (match?.[1] === "w") {
    return 10 + Number(match[2]);
  }
  if (match?.[1] === "t") {
    return 30 + Number(match[2]);
  }
  if (match?.[1] === "n") {
    return 50 + Number(match[2]);
  }
  return 99;
};

export const simpleLightSlots = (draft: LightGroupDraft): SimpleLightSlot[] => {
  const slots: SimpleLightSlot[] = [];
  const rgb = rowIds(draft, "rgb");
  if (rgb.length) {
    slots.push({
      slot: "rgb",
      row: "rgb",
      label: STUDIO_ROW_META.rgb.label,
      entities: rgb,
    });
  }
  if (isMinimalDraft(draft)) {
    const entities = rowIds(draft, "whites");
    const stages = whitesStageCount(entities, draft.whitesStages);
    if (stages) {
      whitesStageNames(stages).forEach((label, index) => {
        slots.push({
          slot: `t${index + 1}`,
          row: "whites",
          label: `${STUDIO_ROW_META.whites.label} · ${label}`,
          entities,
          stage: index + 1,
          stages,
        });
      });
    }
    return slots;
  }
  (
    [
      ["warm", rowIds(draft, "warm"), draft.warmStages, "w"],
      ["white", rowIds(draft, "white"), draft.whiteStages, "n"],
    ] as const
  ).forEach(([row, entities, override, prefix]) => {
    const stages = warmWhiteStageCount(entities, override);
    if (!stages) {
      return;
    }
    studioIntensityNames(stages).forEach((label, index) => {
      slots.push({
        slot: `${prefix}${index + 1}`,
        row,
        label: `${STUDIO_ROW_META[row].label} · ${label}`,
        entities,
        stage: index + 1,
        stages,
      });
    });
  });
  return slots;
};

export const slotForLightScene = (
  draft: LightGroupDraft,
  scene: SceneConfig | string,
  slots = simpleLightSlots(draft),
): SimpleLightSlot | undefined => {
  const id = typeof scene === "string" ? scene : scene.id;
  const slot = parseLookSceneId(id)?.slot;
  if (!slot || isLightDefaultSlot(slot)) {
    return undefined;
  }
  return slots.find((item) => item.slot === slot);
};

export const defaultEntityLook = (
  draft: LightGroupDraft,
  slot: SimpleLightSlot,
): LightSceneLook => {
  if (slot.row === "rgb") {
    return {
      state: "on",
      brightness: asRgbPercent(draft.brightness),
      hex: draft.hex || DEFAULT_RGB_HEX,
      kelvin: draft.kelvin,
      effect: draft.effect ?? "",
    };
  }
  return {
    state: "on",
    brightness:
      slot.row === "whites"
        ? whitesStagePercent(slot.stage ?? 1, slot.stages ?? DEFAULT_WHITES_STAGES)
        : studioStagePercent(slot.stage ?? 1, slot.stages ?? DEFAULT_LIGHT_STAGES),
    hex:
      slot.row === "warm"
        ? WARM_HEX
        : slot.row === "whites"
          ? whitesStageHex(slot.stage ?? 1, slot.stages ?? DEFAULT_WHITES_STAGES)
          : WHITE_HEX,
    effect: "",
  };
};

export const entityLookForSlot = (
  draft: LightGroupDraft,
  slot: SimpleLightSlot,
  entityId: string,
): LightSceneLook => {
  const override = draft.sceneLooks?.[slot.slot]?.[entityId];
  if (!slot.entities.includes(entityId)) {
    return { state: "off", effect: "" };
  }
  const fallback = defaultEntityLook(draft, slot);
  if (slot.row === "rgb") {
    return {
      state: override?.state === "on" ? "on" : "off",
      brightness: asRgbPercent(draft.brightness),
      hex: draft.hex || DEFAULT_RGB_HEX,
      kelvin: draft.kelvin,
      effect: draft.effect ?? "",
    };
  }
  if (!override) {
    return { ...fallback, state: "off" };
  }
  return {
    ...fallback,
    ...override,
    hex:
      slot.row === "warm"
        ? WARM_HEX
        : slot.row === "whites"
          ? whitesStageHex(slot.stage ?? 1, slot.stages ?? DEFAULT_WHITES_STAGES)
          : WHITE_HEX,
    effect: "",
  };
};

export const draftPatchFromSavedScene = (
  draft: LightGroupDraft,
  scene: SceneConfig,
): Partial<LightGroupDraft> | undefined => {
  const slot = slotForLightScene(draft, scene);
  if (!slot) {
    return undefined;
  }
  const slotLooks: Record<string, LightSceneLook> = {};
  slot.entities.forEach((entityId) => {
    const look = scene.entities[entityId];
    if (look?.state === "on") {
      slotLooks[entityId] = {
        state: "on",
        ...colorFromSceneEntity(look),
      };
      return;
    }
    slotLooks[entityId] = { state: "off" };
  });
  const sceneLooks = cloneLightLooks(draft.sceneLooks);
  sceneLooks[slot.slot] = slotLooks;
  const patch: Partial<LightGroupDraft> = { sceneLooks };
  if (slot.row === "rgb") {
    const sample = slot.entities
      .map((entityId) => slotLooks[entityId])
      .find((look) => look?.state === "on");
    if (sample) {
      patch.brightness = asRgbPercent(sample.brightness);
      patch.hex = sample.hex || draft.hex || DEFAULT_RGB_HEX;
      patch.kelvin = sample.kelvin ?? draft.kelvin;
      patch.effect = sample.effect ?? "";
    }
  }
  return patch;
};

export const lookToSceneState = (
  entityId: string,
  look: LightSceneLook,
  hass?: HomeAssistant,
): SceneEntityState => {
  if (look.state !== "on") {
    return { state: "off" };
  }
  const next: SceneEntityState = { state: "on" };
  if (isLightEntity(entityId)) {
    next.brightness = percentToBrightness(asRgbPercent(look.brightness));
    const kind = lightAdjustKind(hass, entityId);
    if (look.hex && kind === "rgb") {
      next.rgb_color = hexToRgb(look.hex);
    }
    if (look.hex && kind === "hs") {
      next.hs_color = [hexToHue(look.hex), 100];
    }
    if (kind === "temp") {
      next.color_temp_kelvin = look.kelvin ?? DEFAULT_KELVIN;
    }
    if (look.effect?.trim() && kind === "rgb") {
      next.effect = look.effect.trim();
    }
  }
  return next;
};

const offLook = (): SceneEntityState => ({ state: "off" });

const allOff = (ids: string[]): Record<string, SceneEntityState> =>
  Object.fromEntries(ids.map((entityId) => [entityId, offLook()]));

export const reviewSceneGroups = (
  scenes: SceneConfig[],
  draft?: LightGroupDraft,
): Array<{ row: LightRowId | "default"; label: string; scenes: SceneConfig[] }> => {
  const tagged = scenes.map((scene) => ({
    scene,
    slot: parseLookSceneId(scene.id)?.slot,
  }));
  const defaults = tagged
    .filter((item) => isLightDefaultSlot(item.slot))
    .map((item) => item.scene);
  const rows = draft
    ? studioRows(draft)
    : (["rgb", "warm", "white", "whites"] as LightRowId[]);
  return [
    ...(defaults.length
      ? [{ row: "default" as const, label: "Default", scenes: defaults }]
      : []),
    ...rows.map((row) => ({
      row,
      label: STUDIO_ROW_META[row].label,
      scenes: tagged
        .filter(
          (item) =>
            rowFromLightSlot(item.slot) === row && !isLightDefaultSlot(item.slot),
        )
        .map((item) => item.scene),
    })).filter((group) => group.scenes.length),
  ];
};

export const lightGroupToScenes = (
  draft: LightGroupDraft,
  hass?: HomeAssistant,
): SceneConfig[] => {
  const named = (draft.name ?? "").trim();
  const slug = (draft.slug ?? "").trim() || (named ? slugify(named) : "");
  const name = named || slug;
  const ids = allLightIds(draft);
  const rgb = rowIds(draft, "rgb");
  const warm = rowIds(draft, "warm");
  const white = rowIds(draft, "white");
  const whites = rowIds(draft, "whites");
  const kind = lookKind(draft);
  if (!slug) {
    return [];
  }
  if (
    !ids.length ||
    (!rgb.length && !warm.length && !white.length && !whites.length)
  ) {
    return name
      ? [
          {
            id: lookSceneId(kind, slug, "off"),
            name: `${name} · ${DEFAULT_SCENE_LABEL}`,
            icon: OFF_ICON,
            entities: ids.length ? allOff(ids) : {},
            meta: {
              entities: ids,
              rgb,
              warm,
              white,
              whites,
              warmStages: draft.warmStages,
              whiteStages: draft.whiteStages,
              whitesStages: draft.whitesStages,
              hex: draft.hex,
              kelvin: draft.kelvin,
              brightness: draft.brightness,
              effect: draft.effect,
            },
          },
        ]
      : [];
  }

  const meta = {
    entities: ids,
    rgb,
    warm,
    white,
    whites,
    warmStages: draft.warmStages,
    whiteStages: draft.whiteStages,
    whitesStages:
      draft.whitesStages ??
      (whites.length ? whitesStageCount(whites, draft.whitesStages) : undefined),
    hex: draft.hex,
    kelvin: draft.kelvin,
    brightness: draft.brightness,
    effect: draft.effect,
  };
  const scenes: SceneConfig[] = [
    {
      id: lookSceneId(kind, slug, "off"),
      name: `${name} · ${DEFAULT_SCENE_LABEL}`,
      icon: OFF_ICON,
      entities: allOff(ids),
      meta,
    },
  ];
  const looks = simpleLightSlots(draft);
  looks.forEach((slot) => {
    const entities = Object.fromEntries(
      ids.map((entityId) => [
        entityId,
        lookToSceneState(entityId, entityLookForSlot(draft, slot, entityId), hass),
      ]),
    );
    scenes.push({
      id: lookSceneId(kind, slug, slot.slot),
      name: `${name} · ${slot.label}`,
      icon: STUDIO_ROW_META[slot.row].icon,
      entities,
      meta,
    });
  });

  return scenes;
};

export const draftFromLightScenes = (
  slug: string,
  scenes: SceneConfig[] = [],
): LightGroupDraft => {
  const tagged = scenes.map((scene) => ({
    scene,
    parsed: parseLookSceneId(scene.id),
  }));
  const profile: LightProfile = tagged.some((item) => item.parsed?.kind === "minimal")
    ? "minimal"
    : "simple";
  if (!scenes.length) {
    return {
      ...newLightGroupDraft(slug, profile),
      slug: slugify(slug),
      name: slug.trim() || slugify(slug),
    };
  }
  const ordered = [...tagged].sort(
    (left, right) =>
      lightSlotOrder(left.parsed?.slot ?? "") - lightSlotOrder(right.parsed?.slot ?? ""),
  );
  const first = ordered[0]?.scene;
  const name =
    ordered.find((item) => item.scene.name.includes(" · "))?.scene.name.split(" · ")[0]?.trim() ||
    first?.name.split(" · ")[0]?.trim() ||
    slug;
  const meta = ordered.find((item) => item.scene.meta)?.scene.meta;
  const entities = entityIdsFromScenes(scenes, [
    ...(meta?.entities ?? []),
    ...(meta?.rgb ?? []),
    ...(meta?.warm ?? []),
    ...(meta?.white ?? []),
    ...(meta?.whites ?? []),
  ]);
  const rgb: string[] = [...(meta?.rgb ?? [])];
  const warm: string[] = [...(meta?.warm ?? [])];
  const white: string[] = [...(meta?.white ?? [])];
  const whites: string[] = [...(meta?.whites ?? [])];
  let hex = meta?.hex || DEFAULT_RGB_HEX;
  let kelvin = meta?.kelvin;
  let brightness = meta?.brightness ?? DEFAULT_RGB_PERCENT;
  let effect = meta?.effect ?? "";
  let warmStages = meta?.warmStages ?? 0;
  let whiteStages = meta?.whiteStages ?? 0;
  let whitesStages = meta?.whitesStages ?? 0;
  const sceneLooks: Record<string, Record<string, LightSceneLook>> = {};
  const addMember = (slot: string, entityId: string): void => {
    if (slot === "rgb" && !rgb.includes(entityId)) {
      rgb.push(entityId);
    } else if (slotStageIndex(slot, "t") != null && !whites.includes(entityId)) {
      whites.push(entityId);
    } else if (slotStageIndex(slot, "w") != null && !warm.includes(entityId)) {
      warm.push(entityId);
    } else if (slotStageIndex(slot, "n") != null && !white.includes(entityId)) {
      white.push(entityId);
    }
  };
  const membersFor = (slot: string): Set<string> => {
    if (slot === "rgb") {
      return new Set(rgb);
    }
    if (slotStageIndex(slot, "t") != null) {
      return new Set(whites);
    }
    if (slotStageIndex(slot, "w") != null) {
      return new Set(warm);
    }
    return new Set(white);
  };
  ordered.forEach(({ scene, parsed }) => {
    if (!parsed || isLightDefaultSlot(parsed.slot)) {
      return;
    }
    warmStages = Math.max(warmStages, slotStageIndex(parsed.slot, "w") ?? 0);
    whiteStages = Math.max(whiteStages, slotStageIndex(parsed.slot, "n") ?? 0);
    whitesStages = Math.max(whitesStages, slotStageIndex(parsed.slot, "t") ?? 0);
    Object.entries(scene.entities).forEach(([entityId, look]) => {
      if (look.state === "on") {
        addMember(parsed.slot, entityId);
      }
    });
  });
  ordered.forEach(({ scene, parsed }) => {
    if (!parsed || isLightDefaultSlot(parsed.slot)) {
      return;
    }
    const members = membersFor(parsed.slot);
    const slotLooks: Record<string, LightSceneLook> = {};
    Object.entries(scene.entities).forEach(([entityId, look]) => {
      if (look.state !== "on") {
        if (members.has(entityId)) {
          slotLooks[entityId] = { state: "off" };
        }
        return;
      }
      slotLooks[entityId] = {
        state: "on",
        ...colorFromSceneEntity(look),
      };
      if (parsed.slot === "rgb") {
        const color = colorFromSceneEntity(look);
        if (color.brightness) {
          brightness = color.brightness;
        }
        if (color.hex) {
          hex = color.hex;
        }
        if (color.kelvin) {
          kelvin = color.kelvin;
        }
        if (look.effect) {
          effect = look.effect;
        }
      }
    });
    if (Object.keys(slotLooks).length) {
      sceneLooks[parsed.slot] = slotLooks;
    }
  });
  return {
    name,
    slug,
    profile,
    entities,
    rgb: uniqueEntityIds(rgb),
    warm: uniqueEntityIds(warm),
    white: uniqueEntityIds(white),
    whites: uniqueEntityIds(whites),
    hex,
    kelvin,
    presets: [...STUDIO_RGB_PRESETS],
    brightness,
    effect,
    musicSync: false,
    warmStages: warmStages || undefined,
    whiteStages: whiteStages || undefined,
    whitesStages: whitesStages || undefined,
    sceneLooks,
  };
};

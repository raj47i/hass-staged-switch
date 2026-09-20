import { isValidEntityId } from "../shared/entities";
import { DEFAULT_OFF_LABEL } from "../cards/staged-switch/const";
import { OFF_ICON, OFF_LABEL, STAGE_ICON } from "./const";
import { draftFromAdvancedScenes } from "./advanced";
import {
  parseAdvancedSceneId,
  parseLookSceneId,
  parseSceneId,
  parseStudioSceneId,
  sceneId,
  slugify,
} from "./ids";
import { allLightIds, draftFromLightScenes, entityIdsFromScenes, lightSlotOrder } from "./lights";
import type {
  SceneConfig,
  StudioSetKind,
  SwitchGroupDraft,
  SwitchGroupSummary,
  SwitchStageMode,
} from "./types";

const emptyDraft = (): SwitchGroupDraft => ({
  name: "",
  slug: "",
  entities: [],
  mode: "cumulative",
  stage_names: [OFF_LABEL],
});

export const newSwitchGroupDraft = (name = ""): SwitchGroupDraft => {
  const draft = emptyDraft();
  if (!name.trim()) {
    return { ...draft, fresh: true };
  }
  return { ...draft, name: name.trim(), slug: slugify(name), fresh: true };
};

export const allOffSwitchStages = (
  draft: SwitchGroupDraft,
): NonNullable<SwitchGroupDraft["stages"]> => {
  const entities = (draft.entities ?? []).filter(isValidEntityId);
  const names = [
    draft.stage_names[0] || OFF_LABEL,
    ...entities.map((_, index) => draft.stage_names[index + 1] || `Stage ${index + 1}`),
  ];
  return names.map((name) => ({
    name,
    switches: Object.fromEntries(entities.map((entityId) => [entityId, "off" as const])),
  }));
};

const offMap = (ids: string[]): Record<string, { state: "off" }> =>
  Object.fromEntries(ids.map((entityId) => [entityId, { state: "off" as const }]));

export const switchGroupToScenes = (draft: SwitchGroupDraft): SceneConfig[] => {
  const named = (draft.name ?? "").trim();
  const slug = (draft.slug ?? "").trim() || (named ? slugify(named) : "");
  const name = named || slug;
  const entities = (draft.entities ?? []).filter(isValidEntityId);
  if (!slug) {
    return [];
  }
  if (!entities.length) {
    return name
      ? [
          {
            id: sceneId(slug, 0),
            name: `${name} · ${OFF_LABEL}`,
            icon: OFF_ICON,
            entities: {},
          },
        ]
      : [];
  }
  if (draft.mode === "explicit" && draft.stages?.length) {
    return draft.stages.map((stage, index) => ({
      id: sceneId(slug, index),
      name: `${name} · ${stage.name?.trim() || (index === 0 ? OFF_LABEL : `Stage ${index}`)}`,
      icon: index === 0 ? OFF_ICON : STAGE_ICON,
      entities: Object.fromEntries(
        entities.map((entityId) => [
          entityId,
          { state: stage.switches[entityId] === "on" ? "on" : "off" },
        ]),
      ),
    }));
  }
  if (draft.fresh) {
    return allOffSwitchStages({ ...draft, stage_names: draft.stage_names }).map(
      (stage, index) => ({
        id: sceneId(slug, index),
        name: `${name} · ${stage.name}`,
        icon: index === 0 ? OFF_ICON : STAGE_ICON,
        entities: offMap(entities),
      }),
    );
  }
  const names = draft.stage_names.length
    ? draft.stage_names
    : [OFF_LABEL, ...entities.map((_, index) => `Stage ${index + 1}`)];
  return [
    {
      id: sceneId(slug, 0),
      name: `${name} · ${names[0] || OFF_LABEL}`,
      icon: OFF_ICON,
      entities: offMap(entities),
    },
    ...entities.map((entityId, index) => ({
      id: sceneId(slug, index + 1),
      name: `${name} · ${names[index + 1] || entityId}`,
      icon: STAGE_ICON,
      entities: Object.fromEntries(
        entities.map((id, entityIndex) => [
          id,
          { state: (entityIndex <= index ? "on" : "off") as "on" | "off" },
        ]),
      ),
    })),
  ];
};

const isOn = (scene: SceneConfig, entityId: string): boolean =>
  scene.entities[entityId]?.state === "on";

export const inferSwitchMode = (scenes: SceneConfig[]): SwitchStageMode => {
  const ordered = [...scenes].sort(
    (left, right) =>
      (parseSceneId(left.id)?.index ?? 0) - (parseSceneId(right.id)?.index ?? 0),
  );
  if (ordered.length < 2) {
    return "cumulative";
  }
  const entities = entityIdsFromScenes(ordered);
  return ordered.every((scene, index) =>
    entities.every((entityId, entityIndex) => {
      const shouldOn = index > 0 && entityIndex < index;
      return isOn(scene, entityId) === shouldOn;
    }),
  )
    ? "cumulative"
    : "explicit";
};

export const draftFromScenes = (
  slug: string,
  scenes: SceneConfig[],
): SwitchGroupDraft => {
  const ordered = [...scenes].sort(
    (left, right) =>
      (parseSceneId(left.id)?.index ?? 0) - (parseSceneId(right.id)?.index ?? 0),
  );
  const first = ordered[0];
  const groupName =
    first?.name.split(" · ")[0]?.trim() || slugify(slug) || slug;
  const entities = entityIdsFromScenes(ordered);
  const mode = inferSwitchMode(ordered);
  const stage_names = ordered.map((scene, index) => {
    const named = scene.name.split(" · ").slice(1).join(" · ").trim();
    if (named) {
      return named;
    }
    return index === 0 ? DEFAULT_OFF_LABEL : `Stage ${index}`;
  });
  const stages =
    mode === "explicit"
      ? ordered.map((scene, index) => ({
          name: stage_names[index],
          switches: Object.fromEntries(
            entities.map((entityId) => [
              entityId,
              (scene.entities[entityId]?.state === "on" ? "on" : "off") as "on" | "off",
            ]),
          ),
        }))
      : undefined;
  return {
    name: groupName,
    slug,
    entities,
    mode,
    stage_names,
    stages,
  };
};

export const KIND_ORDER: StudioSetKind[] = [
  "light",
  "minimal",
  "advanced",
  "switch",
];

export const summarizeGroups = (scenes: SceneConfig[]): SwitchGroupSummary[] => {
  const buckets = new Map<string, { kind: StudioSetKind; scenes: SceneConfig[] }>();
  scenes.forEach((scene) => {
    const parsed = parseStudioSceneId(scene.id);
    if (!parsed) {
      return;
    }
    const key = `${parsed.kind}:${parsed.slug}`;
    const bucket = buckets.get(key) ?? { kind: parsed.kind, scenes: [] };
    bucket.scenes.push(scene);
    buckets.set(key, bucket);
  });
  return Array.from(buckets.entries())
    .map(([, bucket]) => {
      const slug =
        parseStudioSceneId(bucket.scenes[0]?.id)?.slug ??
        bucket.scenes[0]?.id ??
        "";
      if (bucket.kind === "light" || bucket.kind === "minimal") {
        const draft = draftFromLightScenes(slug, bucket.scenes);
        return {
          kind: bucket.kind,
          slug,
          name: draft.name,
          sceneCount: bucket.scenes.length,
          entityCount: allLightIds(draft).length,
          scenes: [...bucket.scenes].sort(
            (left, right) =>
              lightSlotOrder(parseLookSceneId(left.id)?.slot ?? "") -
              lightSlotOrder(parseLookSceneId(right.id)?.slot ?? ""),
          ),
        };
      }
      if (bucket.kind === "advanced") {
        const draft = draftFromAdvancedScenes(slug, bucket.scenes);
        return {
          kind: "advanced" as const,
          slug,
          name: draft.name,
          sceneCount: bucket.scenes.length,
          entityCount: draft.entities.length,
          scenes: [...bucket.scenes].sort(
            (left, right) =>
              (parseAdvancedSceneId(left.id)?.index ?? 0) -
              (parseAdvancedSceneId(right.id)?.index ?? 0),
          ),
        };
      }
      const draft = draftFromScenes(slug, bucket.scenes);
      return {
        kind: "switch" as const,
        slug,
        name: draft.name,
        sceneCount: bucket.scenes.length,
        entityCount: draft.entities.length,
        scenes: [...bucket.scenes].sort(
          (left, right) =>
            (parseSceneId(left.id)?.index ?? 0) -
            (parseSceneId(right.id)?.index ?? 0),
        ),
      };
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
      }
      return left.name.localeCompare(right.name);
    });
};

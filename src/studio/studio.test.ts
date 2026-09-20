import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "../shared/types";
import { uniqueEntityIds } from "../shared/entities";
import { showsEntityButtons } from "../shared/entity-buttons";
import { visibleLights } from "../cards/staged-lights/roster";
import { studioSetEntityIds } from "./entity-buttons";
import { rgbToHex } from "../cards/staged-lights/color";
import { lightsStorageKey, writeStoredLightsState } from "../cards/staged-lights/persist";
import { exclusiveGroupState, exclusiveLightsState } from "../cards/staged-lights/state";
import { percentToBrightness } from "../cards/staged-lights/stages";
import {
  advancedSceneId,
  lightSceneId,
  minimalSceneId,
  parseAdvancedSceneId,
  parseLightSceneId,
  parseLookSceneId,
  parseMinimalSceneId,
  parseSceneId,
  parseStudioSceneId,
  sceneId,
  slugify,
  uniqueStudioSceneIds,
} from "./ids";
import {
  shouldListStudioEntities,
  studioDevicesInArea,
  studioEntitiesFromArea,
  studioEntitiesFromDevice,
  studioEntityMatchesQuery,
  studioFilteredEntities,
} from "./bulk";
import { PACKAGE_TITLE, pickerName, PROJECT_TITLE } from "../shared/const";
import { CARD_TITLE as SWITCH_CARD_TITLE } from "../cards/staged-switch/const";
import { CARD_TITLE as LIGHTS_CARD_TITLE } from "../cards/staged-lights/const";
import { CARD_TITLE as MINI_CARD_TITLE } from "../cards/staged-lights-mini/const";
import {
  STUDIO_CARD_TITLE,
  STUDIO_CARD_TYPE,
  STUDIO_RGB_PRESETS,
  STUDIO_SCENE_GAP_MS,
  studioSetEditorTitle,
  studioSetKindLabel,
} from "./const";
import { studioEffectOptions } from "./effects";
import { loadStudioScenes, saveSwitchGroup, scenesFromHass, studioSceneIdsForSlug } from "./ha";
import {
  draftFromLightScenes,
  draftPatchFromSavedScene,
  lightGroupToScenes,
  lookToSceneState,
  newLightGroupDraft,
  reviewSceneGroups,
  remapWhitesLooks,
  simpleLightSlots,
  studioStagePercent,
  trimStageLooks,
  whitesStageCount,
  whitesStageHex,
  WHITES_STAGE_CHOICES,
  warmWhiteStageCount,
} from "./lights";
import {
  advancedLevelOverflow,
  advancedLightToScenes,
  advancedLookSlots,
  draftFromAdvancedScenes,
  draftPatchFromAdvancedScene,
  isAdvancedOffScene,
  isAdvancedRgbGroup,
  newAdvancedGroup,
  newAdvancedLightDraft,
  newAdvancedLook,
  newAdvancedRgbGroup,
  nextAdvancedRgbName,
  parseAdvancedLevelNames,
  reviewAdvancedSceneGroups,
  slotForAdvancedScene,
  trimAdvancedLooks,
} from "./advanced";
import {
  draftFromScenes,
  inferSwitchMode,
  KIND_ORDER,
  newSwitchGroupDraft,
  summarizeGroups,
  switchGroupToScenes,
} from "./scenes";
import type { LightGroupDraft } from "./types";
import {
  parseStudioLocation,
  parseStudioTail,
  resolveWizardStep,
  serializeStudioTail,
  studioHref,
  wizardStepAt,
  WIZARD_STEPS,
} from "./route";
import {
  activateStudioScene,
  deleteStudioSet,
  ensureStudioScenes,
  hydrateStudioCard,
  isRgbLiveTweak,
  isStudioOffSceneId,
  lightsCardFromAdvanced,
  lightsCardFromStudio,
  lightsStateFromStudio,
  lightsStudioKind,
  mergeLightsStudioConfig,
  mergeSwitchStudioConfig,
  peekStudioScenes,
  persistStudioScenes,
  pickCardTitle,
  previewStudioScene,
  rememberWrittenScenes,
  refreshStudioScenes,
  resetStudioSceneCache,
  resolveStudioLightsState,
  sceneIdForLightsState,
  sceneIdForSwitchIndex,
  showStudioEditor,
  studioCardTitle,
  studioChildCardConfig,
  studioControlCardType,
  studioDashboardSets,
  studioLooksMatch,
  studioOffSceneId,
  studioOffSceneIds,
  studioScenesVersion,
  switchCardFromStudio,
} from "./bind";
import {
  configHasStudioCard,
  findStudioDashboard,
  isEmptyLovelaceConfig,
  studioConfigNeedsEditorFlag,
  studioLovelaceConfig,
} from "./sidebar";

const onLooksFor = (draft: LightGroupDraft) =>
  Object.fromEntries(
    simpleLightSlots(draft).map((slot) => [
      slot.slot,
      Object.fromEntries(slot.entities.map((entityId) => [entityId, { state: "on" as const }])),
    ]),
  );

describe("scene ids", () => {
  it("round-trips slug and index", () => {
    expect(slugify("Patio lights!")).toBe("patio_lights");
    expect(sceneId("patio", 0)).toBe("sst_patio_00");
    expect(sceneId("guest_room", 3)).toBe("sst_guest_room_03");
    expect(parseSceneId("sst_guest_room_03")).toEqual({
      slug: "guest_room",
      index: 3,
    });
    expect(parseSceneId("scene.sst_patio_00")).toEqual({ slug: "patio", index: 0 });
    expect(parseSceneId("scene.living_room")).toBeUndefined();
    expect(lightSceneId("guest_room", "w1")).toBe("ssl_guest_room_w1");
    expect(parseLightSceneId("ssl_guest_room_w1")).toEqual({
      slug: "guest_room",
      slot: "w1",
    });
    expect(parseLightSceneId("ssl_guest_room_rgb0")).toEqual({
      slug: "guest_room",
      slot: "rgb0",
    });
    expect(parseLightSceneId("ssl_guest_room_w0")).toEqual({
      slug: "guest_room",
      slot: "w0",
    });
    expect(parseStudioSceneId("ssl_living_rgb")).toEqual({
      kind: "light",
      slug: "living",
    });
    expect(parseStudioSceneId("sst_patio_01")).toEqual({
      kind: "switch",
      slug: "patio",
    });
    expect(advancedSceneId("movie", 1)).toBe("sla_movie_01");
    expect(parseAdvancedSceneId("sla_movie_02")).toEqual({
      slug: "movie",
      index: 2,
    });
    expect(parseStudioSceneId("sla_movie_00")).toEqual({
      kind: "advanced",
      slug: "movie",
    });
    expect(minimalSceneId("guest", "t2")).toBe("ssm_guest_t2");
    expect(parseMinimalSceneId("ssm_guest_t1")).toEqual({
      slug: "guest",
      slot: "t1",
    });
    expect(parseLookSceneId("ssm_guest_rgb")).toEqual({
      kind: "minimal",
      slug: "guest",
      slot: "rgb",
    });
    expect(parseStudioSceneId("ssm_guest_off")).toEqual({
      kind: "minimal",
      slug: "guest",
    });
    expect(uniqueStudioSceneIds([
      "ssl_hall_w4",
      "scene.ssl_hall_w4",
      "ssl_hall_w5",
      "ssm_guest_t3",
      "light.lamp",
      "",
      undefined,
    ])).toEqual(["ssl_hall_w4", "ssl_hall_w5", "ssm_guest_t3"]);
    expect(uniqueEntityIds(["ssl_hall_w4", "light.lamp"])).toEqual(["light.lamp"]);
  });

  it("uses scene-set labels for every kind", () => {
    expect(studioSetKindLabel("light")).toBe("Lights scene-set : Simple");
    expect(studioSetKindLabel("minimal")).toBe("Lights scene-set : Minimal");
    expect(studioSetKindLabel("advanced")).toBe("Lights scene-set : Advanced");
    expect(studioSetKindLabel("switch")).toBe("Switches scene-set");
    expect(studioSetKindLabel("unknown")).toBe("Scene-set");
    expect(studioSetEditorTitle("light", false)).toBe("New Lights scene-set : Simple");
    expect(studioSetEditorTitle("switch", true)).toBe("Edit Switches scene-set");
  });

  it("uses Scene Studio picker names for every card", () => {
    expect(PROJECT_TITLE).toBe("Hass Scene Studio");
    expect(STUDIO_CARD_TITLE).toBe(pickerName("Scene-set"));
    expect(MINI_CARD_TITLE).toBe(pickerName("Room Lights: Mini"));
    expect(LIGHTS_CARD_TITLE).toBe(pickerName("Room Lights: Advanced"));
    expect(SWITCH_CARD_TITLE).toBe(pickerName("Room Switches"));
    expect(STUDIO_CARD_TITLE).toBe("Scene Studio - Scene-set");
    expect(MINI_CARD_TITLE).toBe("Scene Studio - Room Lights: Mini");
    expect(PACKAGE_TITLE).toBe("Scene Studio");
  });
});

describe("switch group scenes", () => {
  it("builds cumulative on/off snapshots including Off", () => {
    const scenes = switchGroupToScenes({
      name: "Patio",
      slug: "patio",
      entities: ["switch.fan", "light.string", "switch.heater"],
      mode: "cumulative",
      stage_names: ["Off", "Fan", "String lights", "Heater"],
    });
    expect(scenes.map((scene) => scene.id)).toEqual([
      "sst_patio_00",
      "sst_patio_01",
      "sst_patio_02",
      "sst_patio_03",
    ]);
    expect(scenes[0]?.name).toBe("Patio · Off");
    expect(scenes[0]?.entities["switch.heater"]?.state).toBe("off");
    expect(scenes[1]?.entities).toEqual({
      "switch.fan": { state: "on" },
      "light.string": { state: "off" },
      "switch.heater": { state: "off" },
    });
    expect(scenes[3]?.entities["switch.heater"]?.state).toBe("on");
    expect(inferSwitchMode(scenes)).toBe("cumulative");
  });

  it("keeps an explicit mix and can rebuild the draft", () => {
    const scenes = switchGroupToScenes({
      name: "Living",
      slug: "living",
      entities: ["light.sofa", "light.reading", "switch.soundbar"],
      mode: "explicit",
      stage_names: ["Off", "Reading", "Movie"],
      stages: [
        {
          name: "Off",
          switches: {
            "light.sofa": "off",
            "light.reading": "off",
            "switch.soundbar": "off",
          },
        },
        {
          name: "Reading",
          switches: {
            "light.sofa": "off",
            "light.reading": "on",
            "switch.soundbar": "off",
          },
        },
        {
          name: "Movie",
          switches: {
            "light.sofa": "off",
            "light.reading": "off",
            "switch.soundbar": "on",
          },
        },
      ],
    });
    expect(inferSwitchMode(scenes)).toBe("explicit");
    expect(scenes[2]?.entities["switch.soundbar"]?.state).toBe("on");
    expect(scenes[2]?.entities["light.reading"]?.state).toBe("off");
    const draft = draftFromScenes("living", scenes);
    expect(draft.mode).toBe("explicit");
    expect(draft.entities).toEqual([
      "light.sofa",
      "light.reading",
      "switch.soundbar",
    ]);
    expect(summarizeGroups(scenes)[0]?.name).toBe("Living");
  });

  it("saves a named empty switch set as a stub Off scene", () => {
    const scenes = switchGroupToScenes({
      name: "Empty",
      slug: "empty",
      entities: [],
      mode: "cumulative",
      stage_names: ["Off"],
    });
    expect(scenes).toEqual([
      {
        id: "sst_empty_00",
        name: "Empty · Off",
        icon: "mdi:power",
        entities: {},
      },
    ]);
    expect(summarizeGroups(scenes)[0]).toMatchObject({
      kind: "switch",
      slug: "empty",
      name: "Empty",
      entityCount: 0,
    });
    expect(switchGroupToScenes(newSwitchGroupDraft())).toEqual([]);
  });

  it("restores switch entities when the Off scene has no roster", () => {
    const scenes = switchGroupToScenes({
      name: "Patio",
      slug: "patio",
      entities: ["switch.fan", "light.string", "switch.heater"],
      mode: "cumulative",
      stage_names: ["Off", "Fan", "String lights", "Heater"],
    });
    const hollow = scenes.map((scene, index) =>
      index === 0 ? { ...scene, entities: {} } : scene,
    );
    const draft = draftFromScenes("patio", hollow);
    expect(draft.entities).toEqual([
      "switch.fan",
      "light.string",
      "switch.heater",
    ]);
    expect(inferSwitchMode(hollow)).toBe("cumulative");
  });

  it("persists a new switch set all-off until a stage is edited", () => {
    const scenes = switchGroupToScenes({
      ...newSwitchGroupDraft("Patio"),
      slug: "patio",
      entities: ["switch.fan", "switch.heater"],
      stage_names: ["Off", "Fan", "Heater"],
    });
    expect(scenes).toHaveLength(3);
    expect(
      scenes.every((scene) =>
        Object.values(scene.entities).every((look) => look.state === "off"),
      ),
    ).toBe(true);
    expect(inferSwitchMode(scenes)).toBe("explicit");
    const restored = draftFromScenes("patio", scenes);
    expect(restored.fresh).toBeUndefined();
    expect(restored.mode).toBe("explicit");
    expect(
      switchGroupToScenes(restored).every((scene) =>
        Object.values(scene.entities).every((look) => look.state === "off"),
      ),
    ).toBe(true);
  });
});

describe("simple light scenes", () => {
  const draft = {
    ...newLightGroupDraft("Living"),
    slug: "living",
    entities: [
      "light.living_rgb",
      "light.warm_left",
      "light.warm_right",
      "light.white_left",
      "light.white_right",
    ],
    rgb: ["light.living_rgb"],
    warm: ["light.warm_left", "light.warm_right"],
    white: ["light.white_left", "light.white_right"],
    hex: "#ff8a1d",
    brightness: 71,
  };

  it("builds exclusive RGB / Warm / White scenes with Off / Default first", () => {
    const scenes = lightGroupToScenes(draft);
    expect(scenes.map((scene) => scene.id)).toEqual([
      "ssl_living_off",
      "ssl_living_rgb",
      "ssl_living_w1",
      "ssl_living_w2",
      "ssl_living_w3",
      "ssl_living_n1",
      "ssl_living_n2",
      "ssl_living_n3",
    ]);
    expect(scenes.find((scene) => scene.id === "ssl_living_off")?.entities).toEqual({
      "light.living_rgb": { state: "off" },
      "light.warm_left": { state: "off" },
      "light.warm_right": { state: "off" },
      "light.white_left": { state: "off" },
      "light.white_right": { state: "off" },
    });
    expect(scenes.find((scene) => scene.id === "ssl_living_off")?.name).toContain("Off / Default");
    scenes.forEach((scene) => {
      expect(
        Object.values(scene.entities).every((look) => look.state === "off"),
      ).toBe(true);
    });
    expect(scenes.find((scene) => scene.id === "ssl_living_rgb")?.meta?.rgb).toEqual([
      "light.living_rgb",
    ]);
    const warmMid = scenes.find((scene) => scene.id === "ssl_living_w2");
    expect(warmMid?.name).toContain("Mid");
    expect(reviewSceneGroups(scenes).map((group) => [group.label, group.scenes.length])).toEqual([
      ["Default", 1],
      ["RGB", 1],
      ["Warm", 3],
      ["White", 3],
    ]);
  });

  it("keeps exclusive ons after live edit", () => {
    const scenes = lightGroupToScenes({ ...draft, sceneLooks: onLooksFor(draft) });
    const rgb = scenes.find((scene) => scene.id === "ssl_living_rgb");
    expect(rgb?.entities["light.living_rgb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(71),
      rgb_color: [255, 138, 29],
    });
    expect(rgb?.entities["light.living_rgb"]?.brightness).toBeGreaterThan(0);
    expect(rgb?.entities["light.warm_left"]?.state).toBe("off");
    expect(rgb?.entities["light.white_left"]?.state).toBe("off");
    const warmMin = scenes.find((scene) => scene.id === "ssl_living_w1");
    expect(warmMin?.entities["light.warm_left"]?.state).toBe("on");
    expect(warmMin?.entities["light.warm_right"]?.state).toBe("on");
    expect(warmMin?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(20));
    expect(warmMin?.entities["light.warm_left"]?.rgb_color).toEqual([255, 138, 29]);
    expect(warmMin?.entities["light.living_rgb"]?.state).toBe("off");
    expect(warmMin?.entities["light.white_left"]?.state).toBe("off");
    const warmMid = scenes.find((scene) => scene.id === "ssl_living_w2");
    expect(warmMid?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(60));
    const whiteMax = scenes.find((scene) => scene.id === "ssl_living_n3");
    expect(whiteMax?.entities["light.white_left"]?.state).toBe("on");
    expect(whiteMax?.entities["light.white_right"]?.state).toBe("on");
    expect(whiteMax?.entities["light.white_left"]?.brightness).toBe(percentToBrightness(100));
    expect(whiteMax?.entities["light.white_left"]?.rgb_color).toEqual([255, 255, 255]);
    expect(whiteMax?.entities["light.living_rgb"]?.state).toBe("off");
    expect(whiteMax?.entities["light.warm_left"]?.state).toBe("off");
  });

  it("maps 1–100% to Home Assistant brightness and never writes 0", () => {
    const rgbOn = { rgb: { "light.living_rgb": { state: "on" as const } } };
    const zero = lightGroupToScenes({ ...draft, brightness: 0, sceneLooks: rgbOn });
    expect(zero.find((scene) => scene.id === "ssl_living_rgb")?.entities["light.living_rgb"]?.brightness).toBe(
      percentToBrightness(1),
    );
    const max = lightGroupToScenes({ ...draft, brightness: 100, sceneLooks: rgbOn });
    expect(max.find((scene) => scene.id === "ssl_living_rgb")?.entities["light.living_rgb"]?.brightness).toBe(255);
  });

  it("uses Min/Mid/Max by default and honors 2–5 Warm levels", () => {
    const two = lightGroupToScenes({
      ...newLightGroupDraft("Lamp"),
      slug: "lamp",
      entities: ["light.warm_left", "light.warm_right"],
      warm: ["light.warm_left", "light.warm_right"],
    });
    expect(two.map((scene) => scene.id)).toEqual([
      "ssl_lamp_off",
      "ssl_lamp_w1",
      "ssl_lamp_w2",
      "ssl_lamp_w3",
    ]);
    expect(two[1]?.name).toContain("Min");
    expect(two[2]?.name).toContain("Mid");
    expect(two[3]?.name).toContain("Max");
    const minMax = lightGroupToScenes({
      ...newLightGroupDraft("Lamp"),
      slug: "lamp",
      entities: ["light.warm_left", "light.warm_right"],
      warm: ["light.warm_left", "light.warm_right"],
      warmStages: 2,
    });
    expect(minMax.map((scene) => scene.id)).toEqual([
      "ssl_lamp_off",
      "ssl_lamp_w1",
      "ssl_lamp_w2",
    ]);
    expect(minMax[1]?.name).toContain("Min");
    expect(minMax[2]?.name).toContain("Max");
    const four = lightGroupToScenes({
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.warm_left", "light.warm_right", "light.warm_corner"],
      warm: ["light.warm_left", "light.warm_right", "light.warm_corner"],
      warmStages: 4,
    });
    expect(four.map((scene) => scene.id)).toEqual([
      "ssl_hall_off",
      "ssl_hall_w1",
      "ssl_hall_w2",
      "ssl_hall_w3",
      "ssl_hall_w4",
    ]);
    expect(four[2]?.name).toContain("Low");
    expect(four[3]?.name).toContain("High");
    const manyDraft = {
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.warm_left", "light.warm_right", "light.warm_corner"],
      warm: ["light.warm_left", "light.warm_right", "light.warm_corner"],
      warmStages: 5,
    };
    const many = lightGroupToScenes({
      ...manyDraft,
      sceneLooks: onLooksFor(manyDraft),
    });
    expect(many.map((scene) => scene.id)).toEqual([
      "ssl_hall_off",
      "ssl_hall_w1",
      "ssl_hall_w2",
      "ssl_hall_w3",
      "ssl_hall_w4",
      "ssl_hall_w5",
    ]);
    expect(many[3]?.name).toContain("Mid");
    expect(many[1]?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(5));
    expect(many[2]?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(25));
    expect(many[3]?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(50));
    expect(many[4]?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(75));
    expect(many[5]?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(100));
    expect(many[1]?.entities["light.warm_right"]?.state).toBe("on");
    const shrunk = lightGroupToScenes({
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.warm_left", "light.warm_right", "light.warm_corner"],
      warm: ["light.warm_left", "light.warm_right", "light.warm_corner"],
      warmStages: 3,
      sceneLooks: {
        w4: { "light.warm_left": { state: "on", brightness: 75 } },
        w5: { "light.warm_left": { state: "on", brightness: 100 } },
      },
    });
    expect(shrunk.map((scene) => scene.id)).toEqual([
      "ssl_hall_off",
      "ssl_hall_w1",
      "ssl_hall_w2",
      "ssl_hall_w3",
    ]);
    expect(trimStageLooks({ rgb: {}, w3: {}, w4: {}, w5: {}, n4: {} }, "w", 3)).toEqual({
      rgb: {},
      w3: {},
      n4: {},
    });
    expect(warmWhiteStageCount(["light.a"], 5)).toBe(0);
    expect(warmWhiteStageCount(["light.a", "light.b"], 1)).toBe(2);
    expect(warmWhiteStageCount(["light.a", "light.b"], 9)).toBe(5);
  });

  const sceneState = (id: string) => ({
    entity_id: `scene.${id}`,
    state: "scening",
    attributes: { id },
    last_changed: "",
    last_updated: "",
  });

  const mockSceneApi = (ids: string[], failDelete = false) => {
    const deleted: string[] = [];
    const posted: string[] = [];
    const hass = {
      states: Object.fromEntries(ids.map((id) => [`scene.${id}`, sceneState(id)])),
      callApi: async (method: string, path: string) => {
        if (method === "DELETE") {
          if (failDelete) {
            throw new Error("Scene not found");
          }
          deleted.push(path);
        }
        if (method === "POST") {
          posted.push(path);
        }
        return {};
      },
    } as HomeAssistant;
    return { hass, deleted, posted };
  };

  const hallDraft = (stages: number) =>
    lightGroupToScenes({
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.warm_left", "light.warm_right"],
      warm: ["light.warm_left", "light.warm_right"],
      warmStages: stages,
    });

  it("deletes leftover warm scenes when the stage count shrinks", async () => {
    const { hass, deleted, posted } = mockSceneApi([
      "ssl_hall_off",
      "ssl_hall_w1",
      "ssl_hall_w2",
      "ssl_hall_w3",
      "ssl_hall_w4",
      "ssl_hall_w5",
      "ssl_other_w4",
      "sla_hall_01",
      "sst_hall_01",
    ]);
    const next = hallDraft(3);
    await saveSwitchGroup(hass, next, []);
    expect(deleted).toEqual(
      expect.arrayContaining([
        "config/scene/config/ssl_hall_w4",
        "config/scene/config/ssl_hall_w5",
      ]),
    );
    expect(deleted).toHaveLength(2);
    expect(deleted.some((path) => path.includes("ssl_other_w4"))).toBe(false);
    expect(deleted.some((path) => path.includes("sla_hall_01"))).toBe(false);
    expect(deleted.some((path) => path.includes("sst_hall_01"))).toBe(false);
    expect(posted).toEqual(
      expect.arrayContaining([
        "config/scene/config/ssl_hall_off",
        "config/scene/config/ssl_hall_w1",
        "config/scene/config/ssl_hall_w2",
        "config/scene/config/ssl_hall_w3",
      ]),
    );
    expect(posted.some((path) => path.endsWith("ssl_hall_w4"))).toBe(false);
  });

  it("deletes leftover scenes listed only on previousIds, including scene. prefixes", async () => {
    const { hass, deleted } = mockSceneApi([]);
    await saveSwitchGroup(hass, hallDraft(2), [
      "scene.ssl_hall_w3",
      "ssl_hall_w4",
      "ssl_hall_w4",
    ]);
    expect(deleted).toEqual([
      "config/scene/config/ssl_hall_w3",
      "config/scene/config/ssl_hall_w4",
    ]);
  });

  it("prunes legacy rgb0 / w0 / n0 ids when rewriting a set", async () => {
    const { hass, deleted, posted } = mockSceneApi([
      "ssl_hall_off",
      "ssl_hall_rgb0",
      "ssl_hall_w0",
      "ssl_hall_n0",
      "ssl_hall_rgb",
    ]);
    const next = lightGroupToScenes({
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.living_rgb", "light.warm_left", "light.warm_right"],
      rgb: ["light.living_rgb"],
      warm: ["light.warm_left", "light.warm_right"],
      warmStages: 2,
    });
    await saveSwitchGroup(hass, next, ["ssl_hall_rgb0", "ssl_hall_w0", "ssl_hall_n0"]);
    expect(deleted).toEqual(
      expect.arrayContaining([
        "config/scene/config/ssl_hall_rgb0",
        "config/scene/config/ssl_hall_w0",
        "config/scene/config/ssl_hall_n0",
      ]),
    );
    expect(posted.some((path) => path.endsWith("ssl_hall_rgb"))).toBe(true);
    expect(posted.some((path) => path.endsWith("ssl_hall_rgb0"))).toBe(false);
  });

  it("deletes leftover white scenes without touching a 5-stage Warm group", async () => {
    const { hass, deleted, posted } = mockSceneApi([
      "ssl_hall_w4",
      "ssl_hall_w5",
      "ssl_hall_n3",
      "ssl_hall_n4",
      "ssl_hall_n5",
    ]);
    const next = lightGroupToScenes({
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: [
        "light.warm_left",
        "light.warm_right",
        "light.white_left",
        "light.white_right",
      ],
      warm: ["light.warm_left", "light.warm_right"],
      white: ["light.white_left", "light.white_right"],
      warmStages: 5,
      whiteStages: 2,
    });
    await saveSwitchGroup(hass, next);
    expect(deleted).toEqual(
      expect.arrayContaining([
        "config/scene/config/ssl_hall_n3",
        "config/scene/config/ssl_hall_n4",
        "config/scene/config/ssl_hall_n5",
      ]),
    );
    expect(deleted.some((path) => path.endsWith("ssl_hall_w4"))).toBe(false);
    expect(posted.some((path) => path.endsWith("ssl_hall_w5"))).toBe(true);
    expect(posted.some((path) => path.endsWith("ssl_hall_n2"))).toBe(true);
    expect(posted.some((path) => path.endsWith("ssl_hall_n3"))).toBe(false);
  });

  it("does not delete scenes when growing from 3 to 5 Warm levels", async () => {
    const { hass, deleted, posted } = mockSceneApi([
      "ssl_hall_off",
      "ssl_hall_w1",
      "ssl_hall_w2",
      "ssl_hall_w3",
    ]);
    await saveSwitchGroup(hass, hallDraft(5));
    expect(deleted).toEqual([]);
    expect(posted.some((path) => path.endsWith("ssl_hall_w4"))).toBe(true);
    expect(posted.some((path) => path.endsWith("ssl_hall_w5"))).toBe(true);
  });

  it("still writes the keep set if a leftover scene is already gone", async () => {
    const { hass, posted } = mockSceneApi(["ssl_hall_w4"], true);
    await saveSwitchGroup(hass, hallDraft(3));
    expect(posted.some((path) => path.endsWith("ssl_hall_w3"))).toBe(true);
  });

  it("round-trips the draft and lists simple light scenes first", () => {
    const scenes = lightGroupToScenes(draft);
    const restored = draftFromLightScenes("living", scenes);
    expect(restored.rgb).toEqual(["light.living_rgb"]);
    expect(restored.warm).toEqual(["light.warm_left", "light.warm_right"]);
    expect(restored.white).toEqual(["light.white_left", "light.white_right"]);
    expect(restored.hex).toBe("#ff8a1d");
    expect(restored.brightness).toBe(71);
    const switchScenes = switchGroupToScenes({
      name: "Patio",
      slug: "patio",
      entities: ["switch.fan"],
      mode: "cumulative",
      stage_names: ["Off", "Fan"],
    });
    const groups = summarizeGroups([...switchScenes, ...scenes]);
    expect(groups.map((group) => group.kind)).toEqual(["light", "switch"]);
    expect(groups[0]?.name).toBe("Living");
    expect(KIND_ORDER).toEqual(["light", "minimal", "advanced", "switch"]);
  });

  it("saves a named empty lights set as a stub Off scene", () => {
    const scenes = lightGroupToScenes(newLightGroupDraft("Empty"));
    expect(scenes.map((scene) => scene.id)).toEqual(["ssl_empty_off"]);
    expect(scenes[0]?.entities).toEqual({});
    expect(summarizeGroups(scenes)[0]).toMatchObject({
      kind: "light",
      slug: "empty",
      name: "Empty",
      entityCount: 0,
    });
    expect(lightGroupToScenes(newLightGroupDraft())).toEqual([]);
    const advanced = advancedLightToScenes(newAdvancedLightDraft("Hall"));
    expect(advanced.map((scene) => scene.id)).toEqual(["sla_hall_00"]);
    expect(advancedLightToScenes(newAdvancedLightDraft())).toEqual([]);
  });

  it("keeps RGB membership when live edit turns that light off", () => {
    const scenes = lightGroupToScenes({
      ...draft,
      sceneLooks: {
        rgb: { "light.living_rgb": { state: "off" } },
      },
    });
    expect(scenes.find((scene) => scene.id === "ssl_living_rgb")?.meta?.rgb).toEqual([
      "light.living_rgb",
    ]);
    const restored = draftFromLightScenes("living", scenes);
    expect(restored.rgb).toEqual(["light.living_rgb"]);
    expect(restored.sceneLooks?.rgb?.["light.living_rgb"]?.state).toBe("off");
  });

  it("reloads Warm Min offs from saved scenes even without meta", () => {
    const base = {
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.warm_left", "light.warm_right"],
      warm: ["light.warm_left", "light.warm_right"],
    };
    const scenes = lightGroupToScenes({
      ...base,
      sceneLooks: {
        ...onLooksFor(base),
        w1: { "light.warm_left": { state: "off", brightness: 40 } },
      },
    }).map((scene) => ({ ...scene, meta: undefined }));
    const restored = draftFromLightScenes("hall", scenes);
    expect(restored.sceneLooks?.w1?.["light.warm_left"]?.state).toBe("off");
    expect(restored.warm).toEqual(expect.arrayContaining(["light.warm_left", "light.warm_right"]));
  });

  it("loads live-edit controls from the saved scene, not defaults", () => {
    const base = {
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.warm_left", "light.warm_right"],
      warm: ["light.warm_left", "light.warm_right"],
    };
    const saved = lightGroupToScenes({
      ...base,
      sceneLooks: {
        w1: {
          "light.warm_left": { state: "off" },
          "light.warm_right": { state: "on", brightness: 44 },
        },
      },
    }).find((scene) => scene.id === "ssl_hall_w1");
    const patch = draftPatchFromSavedScene(base, saved!);
    expect(patch?.sceneLooks?.w1?.["light.warm_left"]?.state).toBe("off");
    expect(patch?.sceneLooks?.w1?.["light.warm_right"]?.state).toBe("on");
    expect(patch?.sceneLooks?.w1?.["light.warm_right"]?.brightness).toBeGreaterThan(1);
  });

  it("only group members can turn on in a look", () => {
    const scenes = lightGroupToScenes({
      ...draft,
      sceneLooks: {
        w1: {
          "light.warm_left": { state: "off" },
          "light.white_left": { state: "on", brightness: 40 },
        },
      },
    });
    const min = scenes.find((scene) => scene.id === "ssl_living_w1");
    expect(min?.entities["light.warm_left"]?.state).toBe("off");
    expect(min?.entities["light.warm_right"]?.state).toBe("off");
    expect(min?.entities["light.white_left"]?.state).toBe("off");
    expect(min?.entities["light.living_rgb"]?.state).toBe("off");
  });

  it("lets each entity override values on a scene", () => {
    const scenes = lightGroupToScenes({
      ...draft,
      sceneLooks: {
        w2: {
          "light.warm_left": { state: "on", brightness: 40 },
          "light.warm_right": { state: "off" },
        },
      },
    });
    const mid = scenes.find((scene) => scene.id === "ssl_living_w2");
    expect(mid?.entities["light.warm_left"]?.brightness).toBe(percentToBrightness(40));
    expect(mid?.entities["light.warm_right"]?.state).toBe("off");
    expect(mid?.entities["light.living_rgb"]?.state).toBe("off");
    const min = scenes.find((scene) => scene.id === "ssl_living_w1");
    expect(min?.entities["light.warm_right"]?.state).toBe("off");
  });

  it("lets a color light belong to RGB and Warm at once", () => {
    const overlap = {
      ...draft,
      warm: ["light.living_rgb", "light.warm_left"],
    };
    const scenes = lightGroupToScenes({
      ...overlap,
      sceneLooks: onLooksFor(overlap),
    });
    const rgb = scenes.find((scene) => scene.id === "ssl_living_rgb");
    const warmMin = scenes.find((scene) => scene.id === "ssl_living_w1");
    expect(rgb?.entities["light.living_rgb"]?.state).toBe("on");
    expect(rgb?.entities["light.living_rgb"]?.rgb_color).toEqual([255, 138, 29]);
    expect(rgb?.entities["light.warm_left"]?.state).toBe("off");
    expect(warmMin?.entities["light.living_rgb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(20),
      rgb_color: [255, 138, 29],
    });
    expect(warmMin?.entities["light.warm_left"]?.state).toBe("on");
    expect(warmMin?.entities["light.warm_left"]?.rgb_color).toEqual([255, 138, 29]);
    expect(warmMin?.entities["light.white_left"]?.state).toBe("off");
  });

  it("writes an RGB effect and keeps a 6-color palette", () => {
    const fresh = newLightGroupDraft("Color");
    expect(fresh.presets).toEqual([...STUDIO_RGB_PRESETS]);
    expect(fresh.presets).toHaveLength(6);
    const scenes = lightGroupToScenes({
      ...draft,
      effect: "colorloop",
      sceneLooks: { rgb: { "light.living_rgb": { state: "on" } } },
    });
    expect(scenes.find((scene) => scene.id === "ssl_living_rgb")?.entities["light.living_rgb"]?.effect).toBe(
      "colorloop",
    );
    const restored = draftFromLightScenes("living", scenes);
    expect(restored.effect).toBe("colorloop");
  });
});

describe("minimal light scenes", () => {
  const draft = {
    ...newLightGroupDraft("Guest", "minimal"),
    slug: "guest",
    entities: ["light.guest_rgb", "light.guest_bulb"],
    rgb: ["light.guest_rgb"],
    whites: ["light.guest_bulb"],
    hex: "#7ea6ff",
    brightness: 80,
  };

  it("builds RGB plus Warm/Neutral/White scenes as ssm_ ids", () => {
    const unset = lightGroupToScenes(draft);
    unset.forEach((scene) => {
      expect(
        Object.values(scene.entities).every((look) => look.state === "off"),
      ).toBe(true);
    });
    const scenes = lightGroupToScenes({ ...draft, sceneLooks: onLooksFor(draft) });
    expect(scenes.map((scene) => scene.id)).toEqual([
      "ssm_guest_off",
      "ssm_guest_rgb",
      "ssm_guest_t1",
      "ssm_guest_t2",
      "ssm_guest_t3",
    ]);
    expect(scenes[0]?.name).toContain("Off / Default");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t1")?.name).toContain("Warm");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t2")?.name).toContain("Neutral");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t3")?.name).toContain("White");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t1")?.entities["light.guest_bulb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(100),
      rgb_color: [255, 138, 29],
    });
    expect(scenes.find((scene) => scene.id === "ssm_guest_t2")?.entities["light.guest_bulb"]?.rgb_color).toEqual(
      [243, 234, 220],
    );
    expect(scenes.find((scene) => scene.id === "ssm_guest_t3")?.entities["light.guest_bulb"]?.rgb_color).toEqual(
      [255, 255, 255],
    );
    expect(scenes.find((scene) => scene.id === "ssm_guest_t1")?.entities["light.guest_rgb"]?.state).toBe("off");
    expect(reviewSceneGroups(scenes, draft).map((group) => [group.label, group.scenes.length])).toEqual([
      ["Default", 1],
      ["RGB", 1],
      ["Whites", 3],
    ]);
    const restored = draftFromLightScenes("guest", scenes);
    expect(restored.profile).toBe("minimal");
    expect(restored.whites).toEqual(["light.guest_bulb"]);
    expect(restored.whitesStages).toBe(3);
    expect(summarizeGroups(scenes)[0]?.kind).toBe("minimal");
  });

  it("uses Min/Max at two Whites levels and keeps both warm", () => {
    const two = { ...draft, whitesStages: 2 };
    const scenes = lightGroupToScenes({ ...two, sceneLooks: onLooksFor(two) });
    expect(scenes.map((scene) => scene.id)).toEqual([
      "ssm_guest_off",
      "ssm_guest_rgb",
      "ssm_guest_t1",
      "ssm_guest_t2",
    ]);
    expect(scenes.find((scene) => scene.id === "ssm_guest_t1")?.name).toContain("Min");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t2")?.name).toContain("Max");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t1")?.entities["light.guest_bulb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(20),
      rgb_color: [255, 138, 29],
    });
    expect(scenes.find((scene) => scene.id === "ssm_guest_t2")?.entities["light.guest_bulb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(100),
      rgb_color: [255, 138, 29],
    });
    expect(draftFromLightScenes("guest", scenes).whitesStages).toBe(2);
  });

  it("uses Dim/Warm/Neutral/White at four Whites levels", () => {
    const four = { ...draft, whitesStages: 4 };
    const scenes = lightGroupToScenes({ ...four, sceneLooks: onLooksFor(four) });
    expect(scenes.map((scene) => scene.id)).toEqual([
      "ssm_guest_off",
      "ssm_guest_rgb",
      "ssm_guest_t1",
      "ssm_guest_t2",
      "ssm_guest_t3",
      "ssm_guest_t4",
    ]);
    expect(scenes.find((scene) => scene.id === "ssm_guest_t1")?.name).toContain("Dim");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t2")?.name).toContain("Warm");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t3")?.name).toContain("Neutral");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t4")?.name).toContain("White");
    expect(scenes.find((scene) => scene.id === "ssm_guest_t1")?.entities["light.guest_bulb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(20),
      rgb_color: [255, 138, 29],
    });
    expect(scenes.find((scene) => scene.id === "ssm_guest_t2")?.entities["light.guest_bulb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(100),
      rgb_color: [255, 138, 29],
    });
    expect(scenes.find((scene) => scene.id === "ssm_guest_t3")?.entities["light.guest_bulb"]?.rgb_color).toEqual(
      [243, 234, 220],
    );
    expect(scenes.find((scene) => scene.id === "ssm_guest_t4")?.entities["light.guest_bulb"]).toEqual({
      state: "on",
      brightness: percentToBrightness(100),
      rgb_color: [255, 255, 255],
    });
    expect(draftFromLightScenes("guest", scenes).whitesStages).toBe(4);
  });

  it("fills a lights card from minimal scenes and maps Whites to White", () => {
    const scenes = lightGroupToScenes(draft);
    const config = lightsCardFromStudio("custom:scene-studio-room-lights-card", "guest", scenes);
    expect(config.studio).toBe("guest");
    expect(config.rgb).toEqual(["light.guest_rgb"]);
    expect(config.warm).toEqual([]);
    expect(config.white).toEqual(["light.guest_bulb"]);
    expect(config.white_stages).toEqual([
      { name: "Warm" },
      { name: "Neutral" },
      { name: "White" },
    ]);
    expect(sceneIdForLightsState("guest", {
      rgb: { on: false, brightness: 1, hex: "#fff" },
      warm: { on: false, stage: 1 },
      white: { on: true, stage: 2 },
    }, "minimal")).toBe("ssm_guest_t2");
    expect(sceneIdForLightsState("guest", {
      rgb: { on: false, brightness: 1, hex: "#fff" },
      warm: { on: false, stage: 1 },
      white: { on: false, stage: 1 },
    }, "minimal")).toBe("ssm_guest_off");
    expect(studioOffSceneId("ssm_guest_t1")).toBe("ssm_guest_off");
    expect(isStudioOffSceneId("ssm_guest_off")).toBe(true);
    expect(studioControlCardType("minimal")).toBe("custom:scene-studio-room-lights-mini-card");
  });

  it("shifts Warm/Neutral/White looks when adding or removing Dim", () => {
    const looks = {
      rgb: { "light.guest_rgb": { state: "on" as const } },
      t1: { "light.guest_bulb": { state: "on" as const, brightness: 100 } },
      t2: { "light.guest_bulb": { state: "on" as const, brightness: 90 } },
      t3: { "light.guest_bulb": { state: "on" as const, brightness: 80 } },
    };
    const four = remapWhitesLooks(looks, 3, 4);
    expect(four.rgb).toEqual(looks.rgb);
    expect(four.t1).toBeUndefined();
    expect(four.t2).toEqual(looks.t1);
    expect(four.t3).toEqual(looks.t2);
    expect(four.t4).toEqual(looks.t3);
    const three = remapWhitesLooks(four, 4, 3);
    expect(three.t1).toEqual(looks.t1);
    expect(three.t2).toEqual(looks.t2);
    expect(three.t3).toEqual(looks.t3);
    expect(three.t4).toBeUndefined();
    expect(remapWhitesLooks(four, 4, 2).t2).toBeUndefined();
  });

  it("restores leftover t4 as four levels and prunes it when saving three", async () => {
    const leftover = lightGroupToScenes({ ...draft, whitesStages: 4 });
    leftover.push({
      id: "ssm_guest_t0",
      name: "Guest · Whites · leftover",
      entities: { "light.guest_bulb": { state: "off" } },
    });
    const restored = draftFromLightScenes("guest", leftover);
    expect(restored.whitesStages).toBe(4);
    expect(restored.profile).toBe("minimal");
    const hole = leftover.filter((scene) => scene.id !== "ssm_guest_t2" && scene.id !== "ssm_guest_t0");
    expect(draftFromLightScenes("guest", hole).whitesStages).toBe(4);
    const deleted: string[] = [];
    const posted: string[] = [];
    const hass = {
      states: Object.fromEntries(
        leftover.map((scene) => [
          `scene.${scene.id}`,
          {
            entity_id: `scene.${scene.id}`,
            state: "scening",
            attributes: { id: scene.id },
            last_changed: "",
            last_updated: "",
          },
        ]),
      ),
      callApi: async (method: string, path: string) => {
        if (method === "DELETE") {
          deleted.push(path);
        }
        if (method === "POST") {
          posted.push(path);
        }
        return {};
      },
    } as HomeAssistant;
    await saveSwitchGroup(hass, lightGroupToScenes({ ...draft, whitesStages: 3 }));
    expect(deleted).toEqual(
      expect.arrayContaining([
        "config/scene/config/ssm_guest_t4",
        "config/scene/config/ssm_guest_t0",
      ]),
    );
    expect(posted.some((path) => path.endsWith("ssm_guest_t3"))).toBe(true);
    expect(posted.some((path) => path.endsWith("ssm_guest_t4"))).toBe(false);
  });

  it("allows RGB-only or Whites-only sets and clamps Whites levels", () => {
    expect(
      lightGroupToScenes({
        ...draft,
        whites: [],
      }).map((scene) => scene.id),
    ).toEqual(["ssm_guest_off", "ssm_guest_rgb"]);
    expect(
      lightGroupToScenes({
        ...draft,
        rgb: [],
        whitesStages: 2,
      }).map((scene) => scene.id),
    ).toEqual(["ssm_guest_off", "ssm_guest_t1", "ssm_guest_t2"]);
    expect(whitesStageCount(["light.guest_bulb"], 1)).toBe(2);
    expect(whitesStageCount(["light.guest_bulb"], 9)).toBe(4);
    expect(whitesStageCount([], 3)).toBe(0);
    expect(whitesStageHex(Number.NaN, 3)).toBe("#ff8a1d");
    expect(WHITES_STAGE_CHOICES.map((item) => item.count)).toEqual([2, 3, 4]);
    expect(lightsStudioKind("guest", lightGroupToScenes(draft))).toBe("minimal");
  });

  it("saves Whites membership on every scene and restores it after Home Assistant strips looks", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {},
      callApi: async (method: string, _path: string, data?: unknown) => {
        if (method === "POST") {
          bodies.push(data as Record<string, unknown>);
        }
      },
    } as HomeAssistant;
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb", "light.warm_a", "light.warm_b"],
      rgb: ["light.rgb"],
      whites: ["light.warm_a", "light.warm_b"],
      whitesStages: 3,
    });
    await saveSwitchGroup(hass, scenes);
    expect(bodies.map((body) => body.id)).toEqual(scenes.map((scene) => scene.id));
    expect(
      bodies.every((body) => {
        const meta = body.meta as { whites?: string[]; whitesStages?: number };
        return (
          meta.whites?.includes("light.warm_a") &&
          meta.whites.includes("light.warm_b") &&
          meta.whitesStages === 3
        );
      }),
    ).toBe(true);
    const stripped = scenes
      .filter((scene) => scene.id.endsWith("_off") || scene.id.endsWith("_rgb"))
      .map((scene) => ({
        ...scene,
        entities: scene.id.endsWith("_rgb")
          ? { "light.rgb": { state: "on" as const } }
          : {},
      }));
    const restored = draftFromLightScenes("lamp", stripped);
    expect(restored.rgb).toEqual(["light.rgb"]);
    expect(restored.whites).toEqual(["light.warm_a", "light.warm_b"]);
    expect(restored.whitesStages).toBe(3);
    expect(restored.entities).toEqual(["light.rgb", "light.warm_a", "light.warm_b"]);
  });
});

describe("studio scene cache", () => {
  const listed = (scenes: Array<{ id: string; name: string }>) =>
    Object.fromEntries(
      scenes.map((scene) => [
        `scene.${scene.id}`,
        {
          entity_id: `scene.${scene.id}`,
          state: "scening",
          attributes: { id: scene.id, friendly_name: scene.name },
          last_changed: "",
          last_updated: "",
        },
      ]),
    );

  beforeEach(() => {
    resetStudioSceneCache();
  });

  afterEach(() => {
    resetStudioSceneCache();
  });

  it("reads membership from metadata when meta is missing", async () => {
    const hass = {
      states: listed([{ id: "ssm_lamp_off", name: "Lamp · Off / Default" }]),
      callApi: async () => ({
        id: "ssm_lamp_off",
        name: "Lamp · Off / Default",
        entities: {},
        metadata: {
          rgb: ["light.rgb"],
          whites: ["light.warm_a"],
          whitesStages: 3,
        },
      }),
    } as HomeAssistant;
    const loaded = await loadStudioScenes(hass);
    expect(loaded[0]?.meta?.whites).toEqual(["light.warm_a"]);
    expect(loaded[0]?.meta?.whitesStages).toBe(3);
  });

  it("dedupes concurrent refreshes and skips GET when cached", async () => {
    const gets: string[] = [];
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb", "light.warm_a"],
      rgb: ["light.rgb"],
      whites: ["light.warm_a"],
      whitesStages: 3,
    });
    const hass = {
      states: listed(scenes),
      callApi: async (method: string, path: string) => {
        if (method === "GET") {
          gets.push(path);
          const id = path.replace("config/scene/config/", "");
          return scenes.find((scene) => scene.id === id) ?? {};
        }
        return {};
      },
    } as HomeAssistant;
    const [first, second] = await Promise.all([
      refreshStudioScenes(hass),
      refreshStudioScenes(hass),
    ]);
    expect(first).toHaveLength(scenes.length);
    expect(second).toBe(first);
    expect(gets).toHaveLength(scenes.length);
    gets.length = 0;
    await refreshStudioScenes(hass);
    expect(gets).toEqual([]);
    expect(
      peekStudioScenes(hass).some((scene) =>
        scene.meta?.whites?.includes("light.warm_a"),
      ),
    ).toBe(true);
  });

  it("lets cards pick up a just-written set without another GET", async () => {
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb", "light.warm_a"],
      rgb: ["light.rgb"],
      whites: ["light.warm_a"],
      whitesStages: 3,
    });
    rememberWrittenScenes(scenes);
    expect(studioScenesVersion()).toBeGreaterThan(0);
    expect(peekStudioScenes().map((scene) => scene.id)).toEqual(
      scenes.map((scene) => scene.id),
    );
    const hass = {
      states: {},
      callApi: async () => {
        throw new Error("should not GET");
      },
    } as HomeAssistant;
    const version = await ensureStudioScenes(hass, "lamp");
    expect(version).toBe(studioScenesVersion());
    const first = await hydrateStudioCard(hass, "lamp", { version: 0 });
    expect(first?.changed).toBe(true);
    const second = await hydrateStudioCard(hass, "lamp", {
      slug: "lamp",
      version: first?.version ?? 0,
    });
    expect(second?.changed).toBe(false);
  });

  it("keeps other slugs visible after remembering one written set", () => {
    const written = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb"],
      rgb: ["light.rgb"],
    });
    rememberWrittenScenes(written);
    const hass = {
      states: listed([{ id: "ssl_guest_off", name: "Guest · Off / Default" }]),
    } as HomeAssistant;
    expect(peekStudioScenes(hass).map((scene) => scene.id)).toEqual(
      expect.arrayContaining(["ssl_guest_off", "ssm_lamp_off"]),
    );
  });
});

describe("wizard step persist", () => {
  beforeEach(() => {
    resetStudioSceneCache();
  });

  afterEach(() => {
    resetStudioSceneCache();
  });

  const recordingHass = () => {
    const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> =
      [];
    const hass = {
      states: {},
      callApi: async (method: string, path: string, data?: unknown) => {
        calls.push({
          method,
          path,
          body: data as Record<string, unknown> | undefined,
        });
        if (method === "POST" && path.endsWith("ssl_bad_off")) {
          throw new Error("Home Assistant rejected the scene");
        }
        return {};
      },
    } as HomeAssistant;
    return { hass, calls };
  };

  it("does not write when there are no scenes yet", async () => {
    const { hass, calls } = recordingHass();
    await persistStudioScenes(hass, []);
    expect(calls).toEqual([]);
    expect(studioScenesVersion()).toBe(0);
  });

  it("writes the full set in order and keeps it in the studio cache", async () => {
    const { hass, calls } = recordingHass();
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb", "light.warm_a"],
      rgb: ["light.rgb"],
      whites: ["light.warm_a"],
      whitesStages: 3,
    });
    await persistStudioScenes(hass, scenes);
    expect(calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual(
      scenes.map((scene) => `config/scene/config/${scene.id}`),
    );
    expect(
      calls.every(
        (call) =>
          call.method !== "POST" ||
          ((call.body?.meta as { whites?: string[] })?.whites ?? []).includes(
            "light.warm_a",
          ),
      ),
    ).toBe(true);
    expect(peekStudioScenes().map((scene) => scene.id)).toEqual(
      scenes.map((scene) => scene.id),
    );
    expect(draftFromLightScenes("lamp", peekStudioScenes()).whites).toEqual([
      "light.warm_a",
    ]);
  });

  it("rewrites later steps and deletes leftover looks", async () => {
    const four = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.warm_a"],
      whites: ["light.warm_a"],
      whitesStages: 4,
    });
    const three = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.warm_a"],
      whites: ["light.warm_a"],
      whitesStages: 3,
    });
    const { hass, calls } = recordingHass();
    hass.states = Object.fromEntries(
      four.map((scene) => [
        `scene.${scene.id}`,
        {
          entity_id: `scene.${scene.id}`,
          state: "scening",
          attributes: { id: scene.id },
          last_changed: "",
          last_updated: "",
        },
      ]),
    );
    await persistStudioScenes(
      hass,
      three,
      four.map((scene) => scene.id),
    );
    expect(calls.some((call) => call.method === "DELETE" && call.path.endsWith("ssm_lamp_t4"))).toBe(
      true,
    );
    expect(calls.some((call) => call.method === "POST" && call.path.endsWith("ssm_lamp_t4"))).toBe(
      false,
    );
    expect(peekStudioScenes().map((scene) => scene.id)).toEqual(
      three.map((scene) => scene.id),
    );
  });

  it("writes switch scenes on a named step and does not touch an empty slug", async () => {
    const { hass, calls } = recordingHass();
    const unnamed = switchGroupToScenes({
      name: "",
      slug: "",
      entities: ["switch.fan"],
      mode: "cumulative",
      stage_names: ["Off", "Fan"],
    });
    expect(unnamed.map((scene) => scene.id).every((id) => id.startsWith("sst_"))).toBe(true);
    const named = switchGroupToScenes({
      name: "Patio",
      slug: "patio",
      entities: ["switch.fan", "switch.heater"],
      mode: "cumulative",
      stage_names: ["Off", "Fan", "Heater"],
    });
    await persistStudioScenes(hass, named);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(named.length);
    expect(draftFromScenes("patio", peekStudioScenes()).entities).toEqual([
      "switch.fan",
      "switch.heater",
    ]);
  });

  it("does not cache a set when Home Assistant rejects a write", async () => {
    const { hass, calls } = recordingHass();
    await expect(
      persistStudioScenes(hass, [
        {
          id: "ssl_bad_off",
          name: "Bad · Off / Default",
          entities: { "light.lamp": { state: "off" } },
        },
      ]),
    ).rejects.toThrow(/rejected/);
    expect(calls.some((call) => call.method === "POST")).toBe(true);
    expect(peekStudioScenes()).toEqual([]);
  });

  it("keeps Whites membership when a later step rewrites the same slug", async () => {
    const { hass } = recordingHass();
    const first = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb", "light.warm_a", "light.warm_b"],
      rgb: ["light.rgb"],
      whites: ["light.warm_a", "light.warm_b"],
      whitesStages: 3,
    });
    await persistStudioScenes(hass, first);
    const second = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb", "light.warm_a", "light.warm_b"],
      rgb: ["light.rgb"],
      whites: ["light.warm_a", "light.warm_b"],
      whitesStages: 3,
      hex: "#7ea6ff",
    });
    await persistStudioScenes(
      hass,
      second,
      first.map((scene) => scene.id),
    );
    const restored = draftFromLightScenes("lamp", peekStudioScenes());
    expect(restored.whites).toEqual(["light.warm_a", "light.warm_b"]);
    expect(restored.rgb).toEqual(["light.rgb"]);
    expect(restored.hex.toLowerCase()).toBe("#7ea6ff");
  });
});

describe("studio set delete", () => {
  beforeEach(() => {
    resetStudioSceneCache();
  });

  afterEach(() => {
    resetStudioSceneCache();
  });

  it("deletes every scene in the set and hides it even if Home Assistant still lists it", async () => {
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.rgb", "light.warm_a"],
      rgb: ["light.rgb"],
      whites: ["light.warm_a"],
      whitesStages: 3,
    });
    const deleted: string[] = [];
    const hass = {
      states: Object.fromEntries(
        scenes.map((scene) => [
          `scene.${scene.id}`,
          {
            entity_id: `scene.${scene.id}`,
            state: "scening",
            attributes: { id: scene.id, friendly_name: scene.name },
            last_changed: "",
            last_updated: "",
          },
        ]),
      ),
      callApi: async (method: string, path: string) => {
        if (method === "DELETE") {
          deleted.push(path);
        }
        return {};
      },
    } as HomeAssistant;
    rememberWrittenScenes(scenes);
    const group = summarizeGroups(scenes)[0];
    expect(group?.slug).toBe("lamp");
    const ids = await deleteStudioSet(hass, group!);
    expect(ids).toEqual(scenes.map((scene) => scene.id));
    expect(deleted).toEqual(
      scenes.map((scene) => `config/scene/config/${scene.id}`),
    );
    expect(peekStudioScenes(hass).some((scene) => scene.id.startsWith("ssm_lamp_"))).toBe(
      false,
    );
    expect(summarizeGroups(peekStudioScenes(hass))).toEqual([]);
  });

  it("does not delete another slug when removing one set", async () => {
    const guest = lightGroupToScenes({
      ...newLightGroupDraft("Guest"),
      slug: "guest",
      entities: ["light.rgb"],
      rgb: ["light.rgb"],
    });
    const patio = switchGroupToScenes({
      name: "Patio",
      slug: "patio",
      entities: ["switch.fan"],
      mode: "cumulative",
      stage_names: ["Off", "Fan"],
    });
    const deleted: string[] = [];
    const hass = {
      states: Object.fromEntries(
        [...guest, ...patio].map((scene) => [
          `scene.${scene.id}`,
          {
            entity_id: `scene.${scene.id}`,
            state: "scening",
            attributes: { id: scene.id },
            last_changed: "",
            last_updated: "",
          },
        ]),
      ),
      callApi: async (method: string, path: string) => {
        if (method === "DELETE") {
          deleted.push(path);
        }
        return {};
      },
    } as HomeAssistant;
    rememberWrittenScenes([...guest, ...patio]);
    const group = summarizeGroups(guest)[0]!;
    await deleteStudioSet(hass, group);
    expect(deleted.every((path) => path.includes("ssl_guest_"))).toBe(true);
    expect(deleted.some((path) => path.includes("sst_patio_"))).toBe(false);
    expect(peekStudioScenes(hass).map((scene) => scene.id)).toEqual(
      expect.arrayContaining(patio.map((scene) => scene.id)),
    );
    expect(peekStudioScenes(hass).some((scene) => scene.id.startsWith("ssl_guest_"))).toBe(
      false,
    );
  });

  it("can still prune leftover Home Assistant scenes after a set was forgotten", async () => {
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.warm_a"],
      whites: ["light.warm_a"],
      whitesStages: 3,
    });
    const hass = {
      states: Object.fromEntries(
        scenes.map((scene) => [
          `scene.${scene.id}`,
          {
            entity_id: `scene.${scene.id}`,
            state: "scening",
            attributes: { id: scene.id },
            last_changed: "",
            last_updated: "",
          },
        ]),
      ),
      callApi: async () => ({}),
    } as HomeAssistant;
    await deleteStudioSet(hass, {
      kind: "minimal",
      slug: "lamp",
      name: "Lamp",
      sceneCount: scenes.length,
      entityCount: 1,
      scenes,
    });
    expect(peekStudioScenes(hass)).toEqual([]);
    expect(studioSceneIdsForSlug(hass, "lamp", "minimal")).toEqual(
      scenes.map((scene) => scene.id),
    );
  });

  it("does not delete when the set has no slug", async () => {
    await expect(deleteStudioSet({} as HomeAssistant, undefined)).resolves.toEqual(
      [],
    );
  });
});

describe("studio RGB effects", () => {
  it("merges catalog effects with the light effect_list", () => {
    const labels = studioEffectOptions(
      {
        states: {
          "light.living_rgb": {
            entity_id: "light.living_rgb",
            state: "off",
            attributes: {
              supported_color_modes: ["rgb"],
              effect_list: ["colorloop", "aurora"],
            },
            last_changed: "",
            last_updated: "",
          },
        },
        localize: (key) => key,
        language: "en",
        callService: async () => undefined,
      } as HomeAssistant,
      ["light.living_rgb"],
    );
    expect(labels.map((item) => item.id)).toContain("strobe");
    expect(labels.map((item) => item.id)).toContain("aurora");
    expect(labels[0]?.id).toBe("");
  });
});

describe("advanced light scenes", () => {
  it("writes Off plus named looks with brightness percent", () => {
    const scenes = advancedLightToScenes({
      name: "Movie",
      slug: "movie",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [],
      looks: [
        {
          name: "Dim",
          entities: {
            "light.living_rgb": { state: "on", brightness: 40, hex: "#7ea6ff" },
            "light.lamp": { state: "on", brightness: 20 },
          },
        },
      ],
    });
    expect(scenes.map((scene) => scene.id)).toEqual(["sla_movie_00", "sla_movie_01"]);
    expect(scenes[0]?.name).toBe("Movie · Off / Default");
    expect(scenes[0]?.entities["light.lamp"]?.state).toBe("off");
    expect(scenes[0]?.entities["light.living_rgb"]?.state).toBe("off");
    expect(scenes[1]?.name).toBe("Movie · Dim");
    expect(scenes[1]?.entities["light.living_rgb"]?.brightness).toBe(percentToBrightness(40));
    expect(scenes[1]?.entities["light.lamp"]?.state).toBe("on");
    const restored = draftFromAdvancedScenes("movie", scenes);
    expect(restored.looks[0]?.name).toBe("Dim");
    expect(restored.looks[0]?.entities["light.living_rgb"]?.brightness).toBe(40);
    expect(summarizeGroups(scenes)[0]?.kind).toBe("advanced");
  });

  it("writes multiple RGB / Smart groups as one color look each", () => {
    expect(isAdvancedRgbGroup(newAdvancedRgbGroup("RGB"))).toBe(true);
    expect(isAdvancedRgbGroup(newAdvancedGroup("Warm"))).toBe(false);
    expect(isAdvancedRgbGroup(newAdvancedGroup("RGB"))).toBe(true);
    expect(nextAdvancedRgbName([])).toBe("RGB");
    expect(nextAdvancedRgbName([newAdvancedRgbGroup("RGB")])).toBe("RGB 2");
    const scenes = advancedLightToScenes({
      name: "Den",
      slug: "den",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [
        newAdvancedRgbGroup("RGB", ["light.living_rgb"]),
        newAdvancedRgbGroup("Smart", ["light.lamp"]),
        {
          ...newAdvancedGroup("Warm", ["light.lamp"]),
          stages: 2,
          levelNames: ["Min", "Max"],
          levelText: "Min|Max",
        },
      ],
      looks: [],
    });
    expect(scenes.map((scene) => scene.id)).toEqual([
      "sla_den_00",
      "sla_den_01",
      "sla_den_02",
      "sla_den_03",
      "sla_den_04",
    ]);
    expect(scenes[1]?.name).toBe("Den · RGB");
    expect(scenes[2]?.name).toBe("Den · Smart");
    expect(scenes[3]?.name).toBe("Den · Warm · Min");
    expect(scenes[1]?.meta?.groups?.map((group) => group.mode)).toEqual([
      "rgb",
      "rgb",
      "levels",
    ]);
    const restored = draftFromAdvancedScenes("den", scenes);
    expect(restored.groups.map((group) => [group.name, group.mode])).toEqual([
      ["RGB", "rgb"],
      ["Smart", "rgb"],
      ["Warm", undefined],
    ]);
    const config = lightsCardFromAdvanced(
      "custom:scene-studio-room-lights-mini-card",
      "den",
      scenes,
    );
    expect(config.groups?.map((group) => [group.name, group.kind])).toEqual([
      ["RGB", "rgb"],
      ["Smart", "rgb"],
      ["Warm", "group"],
    ]);
    expect(config.groups?.[0]?.stages).toHaveLength(1);
    expect(config.groups?.[2]?.stages).toHaveLength(2);
    expect(
      sceneIdForLightsState(
        "den",
        exclusiveGroupState(undefined, config.groups?.[0]?.id, 1, {
          hex: "#7ea6ff",
          brightness: 40,
        }),
        "light",
        config,
      ),
    ).toBe("sla_den_01");
    expect(
      isRgbLiveTweak(
        exclusiveGroupState(undefined, config.groups?.[0]?.id, 1, {
          hex: "#ffffff",
          brightness: 20,
        }),
        exclusiveGroupState(undefined, config.groups?.[0]?.id, 1, {
          hex: "#7ea6ff",
          brightness: 20,
        }),
      ),
    ).toBe(true);
  });

  it("can start from an empty extra look", () => {
    expect(
      advancedLightToScenes({
        name: "Empty",
        slug: "empty",
        entities: ["light.lamp"],
        groups: [],
        looks: [newAdvancedLook(["light.lamp"], "Look 1")],
      }).map((scene) => scene.id),
    ).toEqual(["sla_empty_00", "sla_empty_01"]);
  });

  it("writes custom groups and restores overlapping membership", () => {
    const three = {
      stages: 3,
      levelNames: ["Min", "Mid", "Max"],
      levelText: "Min|Mid|Max",
    };
    const rgb = { ...newAdvancedGroup("RGB", ["light.living_rgb"]), ...three };
    const warm = { ...newAdvancedGroup("Warm", ["light.living_rgb", "light.lamp"]), ...three };
    const scenes = advancedLightToScenes({
      name: "Movie",
      slug: "movie",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [
        { ...rgb, effect: "candle" },
        warm,
      ],
      looks: [],
    });
    expect(scenes.map((scene) => scene.id)).toEqual([
      "sla_movie_00",
      "sla_movie_01",
      "sla_movie_02",
      "sla_movie_03",
      "sla_movie_04",
      "sla_movie_05",
      "sla_movie_06",
    ]);
    expect(scenes[1]?.name).toBe("Movie · RGB · Min");
    expect(scenes[1]?.entities["light.living_rgb"]?.state).toBe("off");
    expect(scenes[1]?.entities["light.living_rgb"]?.effect).toBeUndefined();
    expect(scenes[6]?.entities["light.living_rgb"]?.state).toBe("off");
    expect(scenes[6]?.entities["light.lamp"]?.state).toBe("off");
    const restored = draftFromAdvancedScenes("movie", scenes);
    expect(restored.groups.map((group) => group.name)).toEqual(["RGB", "Warm"]);
    expect(restored.groups[0]?.stages).toBe(3);
    expect(restored.groups[1]?.entities).toEqual(["light.living_rgb", "light.lamp"]);
    const lit = advancedLightToScenes({
      name: "Movie",
      slug: "movie",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [
        {
          ...rgb,
          effect: "candle",
          sceneLooks: {
            "1": { "light.living_rgb": { state: "on" } },
          },
        },
        {
          ...warm,
          sceneLooks: {
            "3": {
              "light.living_rgb": { state: "on" },
              "light.lamp": { state: "on" },
            },
          },
        },
      ],
      looks: [],
    });
    expect(lit[1]?.entities["light.living_rgb"]?.effect).toBe("candle");
    expect(lit[6]?.entities["light.living_rgb"]?.state).toBe("on");
    expect(lit[6]?.entities["light.lamp"]?.state).toBe("on");
  });

  it("keeps Advanced looks by level index when names change and drops the tail", () => {
    expect(parseAdvancedLevelNames("")).toEqual(["Min", "Low", "Mid", "High", "Max"]);
    expect(parseAdvancedLevelNames(" Soft low | Mid  |Max ")).toEqual([
      "Soft low",
      "Mid",
      "Max",
    ]);
    expect(advancedLevelOverflow("A|B|C|D|E|F|G|H")).toBe(1);
    expect(parseAdvancedLevelNames("A|B|C|D|E|F|G|H")).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
    const group = {
      ...newAdvancedGroup("RGB", ["light.living_rgb"]),
      sceneLooks: {
        "1": { "light.living_rgb": { state: "on" as const, brightness: 10 } },
        "5": { "light.living_rgb": { state: "on" as const, brightness: 90 } },
      },
    };
    const renamed = {
      ...group,
      levelText: "Dim|Soft|Mid|High|Peak",
      levelNames: parseAdvancedLevelNames("Dim|Soft|Mid|High|Peak"),
      stages: 5,
    };
    const scenes = advancedLightToScenes({
      name: "Movie",
      slug: "movie",
      entities: ["light.living_rgb"],
      groups: [renamed],
      looks: [],
    });
    expect(scenes[1]?.name).toBe("Movie · RGB · Dim");
    expect(scenes[5]?.name).toBe("Movie · RGB · Peak");
    expect(scenes[5]?.entities["light.living_rgb"]?.brightness).toBe(
      percentToBrightness(90),
    );
    const restored = draftFromAdvancedScenes("movie", scenes);
    expect(restored.groups[0]?.levelNames).toEqual(["Dim", "Soft", "Mid", "High", "Peak"]);
    expect(restored.groups[0]?.sceneLooks?.["5"]?.["light.living_rgb"]?.state).toBe("on");
    const shrunk = trimAdvancedLooks(renamed.sceneLooks, 3);
    expect(shrunk["1"]?.["light.living_rgb"]?.state).toBe("on");
    expect(shrunk["5"]).toBeUndefined();
    expect(
      advancedLightToScenes({
        name: "Movie",
        slug: "movie",
        entities: ["light.living_rgb"],
        groups: [{ ...renamed, levelText: "Dim|Soft|Mid", levelNames: ["Dim", "Soft", "Mid"], stages: 3, sceneLooks: shrunk }],
        looks: [],
      }).map((scene) => scene.id),
    ).toEqual(["sla_movie_00", "sla_movie_01", "sla_movie_02", "sla_movie_03"]);
  });

  it("restores advanced entities when the Off scene has no roster", () => {
    const scenes = advancedLightToScenes({
      name: "Movie",
      slug: "movie",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [],
      looks: [
        {
          name: "Dim",
          entities: {
            "light.living_rgb": { state: "on", brightness: 40, hex: "#7ea6ff" },
            "light.lamp": { state: "on", brightness: 20 },
          },
        },
      ],
    });
    const hollow = [{ ...scenes[0], entities: {} }, ...scenes.slice(1)];
    const restored = draftFromAdvancedScenes("movie", hollow);
    expect(restored.entities).toEqual(["light.living_rgb", "light.lamp"]);
    expect(restored.looks[0]?.name).toBe("Dim");
  });
});

describe("area and device bulk pick", () => {
  const entity = (entity_id: string) => ({
    entity_id,
    state: "off",
    attributes: {},
    last_changed: "",
    last_updated: "",
  });
  const hass = {
    language: "en",
    localize: (key: string) => key,
    callService: async () => undefined,
    states: {
      "light.living_rgb": entity("light.living_rgb"),
      "light.lamp": entity("light.lamp"),
      "switch.heater": entity("switch.heater"),
      "fan.patio": entity("fan.patio"),
    },
    entities: {
      "light.living_rgb": {
        entity_id: "light.living_rgb",
        device_id: "kit",
        area_id: "living",
      },
      "light.lamp": { entity_id: "light.lamp", device_id: "kit", area_id: "living" },
      "switch.heater": {
        entity_id: "switch.heater",
        device_id: "box",
        area_id: "patio",
      },
      "fan.patio": { entity_id: "fan.patio", device_id: "box", area_id: "patio" },
    },
    devices: {
      kit: { id: "kit", name: "Living kit", area_id: "living" },
      box: { id: "box", name: "Patio box", area_id: "patio" },
    },
    areas: {
      living: { area_id: "living", name: "Living room" },
      patio: { area_id: "patio", name: "Patio" },
    },
  };

  it("adds only lights and switches from an area or device", () => {
    expect(studioEntitiesFromArea(hass, "living")).toEqual([
      "light.lamp",
      "light.living_rgb",
    ]);
    expect(studioEntitiesFromArea(hass, "patio")).toEqual(["switch.heater"]);
    expect(studioEntitiesFromDevice(hass, "box")).toEqual(["switch.heater"]);
    expect(studioEntitiesFromArea(hass, "living", ["light.lamp"])).toEqual([
      "light.living_rgb",
    ]);
  });

  it("filters entities by search, area, then device", () => {
    expect(shouldListStudioEntities({})).toBe(false);
    expect(shouldListStudioEntities({ query: "lamp" })).toBe(true);
    expect(studioEntityMatchesQuery(hass, "light.living_rgb", "living")).toBe(true);
    expect(studioEntityMatchesQuery(hass, "switch.heater", "rgb")).toBe(false);
    expect(studioDevicesInArea(hass, "living").map((device) => device.id)).toEqual(["kit"]);
    expect(studioFilteredEntities(hass, { query: "heater" })).toEqual(["switch.heater"]);
    expect(studioFilteredEntities(hass, { areaId: "living", query: "rgb" })).toEqual([
      "light.living_rgb",
    ]);
    expect(studioFilteredEntities(hass, { areaId: "living", deviceId: "kit" })).toEqual([
      "light.lamp",
      "light.living_rgb",
    ]);
    expect(
      studioFilteredEntities(hass, { areaId: "living", deviceId: "kit", used: ["light.lamp"] }),
    ).toEqual(["light.living_rgb"]);
  });
});

describe("studio edge cases", () => {
  const hass = {
    language: "en",
    localize: (key: string) => key,
    callService: async () => undefined,
    states: {
      "light.living_rgb": {
        entity_id: "light.living_rgb",
        state: "off",
        attributes: { supported_color_modes: ["rgb"] },
        last_changed: "",
        last_updated: "",
      },
      "light.lamp": {
        entity_id: "light.lamp",
        state: "off",
        attributes: { supported_color_modes: ["brightness"] },
        last_changed: "",
        last_updated: "",
      },
      "scene.ssl_living_rgb": {
        entity_id: "scene.ssl_living_rgb",
        state: "unknown",
        attributes: {
          id: "ssl_living_rgb",
          friendly_name: "Living · RGB",
          entities: {
            "light.living_rgb": {
              state: "on",
              brightness: 180,
              rgb_color: [255, 138, 29],
            },
            "not-an-id": { state: "on" },
            "light.lamp": { state: "off", rgb_color: ["x", 1, 2] },
          },
        },
        last_changed: "",
        last_updated: "",
      },
      "scene.living_room": {
        entity_id: "scene.living_room",
        state: "unknown",
        attributes: { friendly_name: "Living room" },
        last_changed: "",
        last_updated: "",
      },
    },
  } as HomeAssistant;

  it("slugifies empty values and keeps scene id parsers defensive", () => {
    expect(slugify(undefined)).toBe("scenes");
    expect(slugify("")).toBe("scenes");
    expect(parseSceneId(undefined)).toBeUndefined();
    expect(parseLightSceneId("")).toBeUndefined();
    expect(parseStudioSceneId(undefined)).toBeUndefined();
    expect(studioStagePercent(Number.NaN, Number.NaN)).toBe(100);
    expect(rgbToHex([Number.NaN, 12, 300])).toBe("#000cff");
  });

  it("writes warm/white color only on RGB-capable lights", () => {
    const rgb = lookToSceneState(
      "light.living_rgb",
      { state: "on", brightness: 20, hex: "#ff8a1d" },
      hass,
    );
    const lamp = lookToSceneState(
      "light.lamp",
      { state: "on", brightness: 20, hex: "#ff8a1d" },
      hass,
    );
    const fan = lookToSceneState("switch.fan", { state: "on", brightness: 20, hex: "#ffffff" }, hass);
    expect(rgb.rgb_color).toEqual([255, 138, 29]);
    expect(lamp.rgb_color).toBeUndefined();
    expect(lamp.brightness).toBe(percentToBrightness(20));
    expect(fan).toEqual({ state: "on" });
  });

  it("writes hue, kelvin, or brightness for RGB-group members", () => {
    const hueHass = {
      ...hass,
      states: {
        ...hass.states,
        "light.hue": {
          entity_id: "light.hue",
          state: "on",
          attributes: { supported_color_modes: ["hs"] },
          last_changed: "",
          last_updated: "",
        },
        "light.temp": {
          entity_id: "light.temp",
          state: "on",
          attributes: { supported_color_modes: ["color_temp"] },
          last_changed: "",
          last_updated: "",
        },
      },
    };
    const hue = lookToSceneState(
      "light.hue",
      { state: "on", brightness: 40, hex: "#ff0000" },
      hueHass,
    );
    const temp = lookToSceneState(
      "light.temp",
      { state: "on", brightness: 40, kelvin: 2700 },
      hueHass,
    );
    expect(hue.hs_color).toEqual([0, 100]);
    expect(hue.rgb_color).toBeUndefined();
    expect(temp.color_temp_kelvin).toBe(2700);
    expect(temp.rgb_color).toBeUndefined();
    const scenes = lightGroupToScenes(
      {
        ...newLightGroupDraft("Adjust"),
        slug: "adjust",
        entities: ["light.hue", "light.temp", "light.lamp"],
        rgb: ["light.hue", "light.temp", "light.lamp"],
        hex: "#00ff00",
        kelvin: 4000,
        brightness: 50,
        sceneLooks: {
          rgb: {
            "light.hue": { state: "on" },
            "light.temp": { state: "on" },
            "light.lamp": { state: "on" },
          },
        },
      },
      hueHass,
    );
    const rgb = scenes.find((scene) => scene.id === "ssl_adjust_rgb");
    expect(rgb?.entities["light.hue"]?.hs_color?.[0]).toBe(120);
    expect(rgb?.entities["light.temp"]?.color_temp_kelvin).toBe(4000);
    expect(rgb?.entities["light.lamp"]?.rgb_color).toBeUndefined();
    expect(rgb?.entities["light.lamp"]?.brightness).toBe(percentToBrightness(50));
  });

  it("loads a valid empty draft and ignores junk scene entities", () => {
    expect(draftFromLightScenes("living", []).slug).toBe("living");
    expect(draftFromAdvancedScenes("movie", []).entities).toEqual([]);
    const listed = scenesFromHass(hass);
    expect(listed.map((scene) => scene.id)).toEqual(["ssl_living_rgb"]);
    expect(listed[0]?.entities["not-an-id"]).toBeUndefined();
    expect(listed[0]?.entities["light.lamp"]?.rgb_color).toBeUndefined();
    expect(scenesFromHass(undefined)).toEqual([]);
  });

  it("lists Off / Default first and keeps it out of live edit", () => {
    const rgb = newAdvancedGroup("RGB", ["light.living_rgb"]);
    const draft = {
      name: "Movie",
      slug: "movie",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [rgb],
      looks: [newAdvancedLook(["light.living_rgb", "light.lamp"], "Mix")],
    };
    const scenes = advancedLightToScenes(draft);
    const slots = advancedLookSlots(draft);
    expect(isAdvancedOffScene(scenes[0]!)).toBe(true);
    expect(slots[0]?.kind).toBe("off");
    expect(slotForAdvancedScene(draft, scenes[0]!)).toEqual(
      expect.objectContaining({ kind: "off" }),
    );
    expect(slotForAdvancedScene(draft, scenes[1]!)).toEqual(
      expect.objectContaining({ kind: "group", stage: 1 }),
    );
    expect(reviewAdvancedSceneGroups(draft).map((group) => group.label)).toEqual([
      "Default",
      "RGB",
      "Custom looks",
    ]);
    const saved = {
      ...scenes[scenes.length - 1]!,
      entities: {
        "light.living_rgb": { state: "on" as const, brightness: 80 },
        "light.lamp": { state: "off" as const },
      },
    };
    const patch = draftPatchFromAdvancedScene(draft, saved);
    expect(patch?.looks?.[0]?.entities["light.living_rgb"]?.state).toBe("on");
    expect(patch?.looks?.[0]?.entities["light.lamp"]?.state).toBe("off");
    expect(draftPatchFromAdvancedScene(draft, scenes[0]!)).toBeUndefined();
  });

  it("does not write color or brightness onto switches in advanced looks", () => {
    const scenes = advancedLightToScenes(
      {
        name: "Movie",
        slug: "movie",
        entities: ["light.lamp", "switch.fan"],
        groups: [],
        looks: [
          {
            name: "Mix",
            entities: {
              "light.lamp": { state: "on", brightness: 40, hex: "#7ea6ff" },
              "switch.fan": { state: "on", brightness: 40, hex: "#7ea6ff" },
            },
          },
        ],
      },
      hass,
    );
    expect(scenes[1]?.entities["light.lamp"]?.brightness).toBe(percentToBrightness(40));
    expect(scenes[1]?.entities["light.lamp"]?.rgb_color).toBeUndefined();
    expect(scenes[1]?.entities["switch.fan"]).toEqual({ state: "on" });
  });

  it("builds the Scene Studio dashboard config", () => {
    const config = studioLovelaceConfig();
    expect(configHasStudioCard(config)).toBe(true);
    expect(isEmptyLovelaceConfig({ views: [] })).toBe(true);
    expect(findStudioDashboard([{ id: "1", url_path: "scene-studio" }])?.id).toBe("1");
    expect(config.views[0]?.cards[0]?.type).toBe(STUDIO_CARD_TYPE);
    expect(config.views[0]?.cards[0]?.editor).toBe(true);
    expect(studioConfigNeedsEditorFlag({ views: [{ cards: [{ type: STUDIO_CARD_TYPE }] }] })).toBe(
      true,
    );
    expect(studioConfigNeedsEditorFlag(config)).toBe(false);
  });
});

describe("studio card bind", () => {
  it("fills a lights card from simple light scenes", () => {
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Living"),
      slug: "living",
      entities: ["light.living_rgb", "light.warm_left", "light.warm_right"],
      rgb: ["light.living_rgb"],
      warm: ["light.warm_left", "light.warm_right"],
      hex: "#ff8a1d",
      brightness: 71,
    });
    const config = lightsCardFromStudio("custom:scene-studio-room-lights-card", "living", scenes);
    expect(config.studio).toBe("living");
    expect(config.title).toBe("Living");
    expect(config.rgb).toEqual(["light.living_rgb"]);
    expect(config.warm).toEqual(["light.warm_left", "light.warm_right"]);
    expect(config.switches).toEqual([
      "light.living_rgb",
      "light.warm_left",
      "light.warm_right",
    ]);
    expect(config.warm_stages).toHaveLength(3);
    expect(sceneIdForLightsState("living", {
      rgb: { on: false, brightness: 1, hex: "#fff" },
      warm: { on: true, stage: 2 },
      white: { on: false, stage: 1 },
    })).toBe("ssl_living_w2");
    expect(sceneIdForLightsState("living", {
      rgb: { on: false, brightness: 1, hex: "#fff" },
      warm: { on: false, stage: 2 },
      white: { on: false, stage: 1 },
      last: "warm",
    })).toBe("ssl_living_off");
    expect(isRgbLiveTweak(
      { rgb: { on: true, brightness: 10, hex: "#fff" }, warm: { on: false, stage: 1 }, white: { on: false, stage: 1 } },
      { rgb: { on: true, brightness: 40, hex: "#fff" }, warm: { on: false, stage: 1 }, white: { on: false, stage: 1 } },
    )).toBe(true);
    expect(config.groups).toBeUndefined();
  });

  it("fills a Mini card from Advanced groups and custom looks", () => {
    const three = {
      stages: 3,
      levelNames: ["Min", "Mid", "Max"],
      levelText: "Min|Mid|Max",
    };
    const scenes = advancedLightToScenes({
      name: "Living Room Lights",
      slug: "living_room",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [
        { ...newAdvancedGroup("Fun", ["light.living_rgb"]), ...three },
        { ...newAdvancedGroup("RGB", ["light.living_rgb"]), ...three },
        { ...newAdvancedGroup("Warm", ["light.lamp"]), ...three },
        { ...newAdvancedGroup("Cool", ["light.lamp"]), ...three },
        { ...newAdvancedGroup("Party", ["light.living_rgb"]), ...three },
        { ...newAdvancedGroup("White", ["light.lamp"]), ...three },
      ],
      looks: [
        {
          name: "Special",
          entities: {
            "light.living_rgb": { state: "on", brightness: 40, hex: "#7ea6ff" },
            "light.lamp": { state: "off" },
          },
        },
      ],
    });
    const config = lightsCardFromAdvanced(
      "custom:scene-studio-room-lights-mini-card",
      "living_room",
      scenes,
    );
    expect(config.title).toBe("Living Room");
    expect(config.groups?.map((group) => group.name)).toEqual([
      "Fun",
      "RGB",
      "Warm",
      "Cool",
      "Party",
      "White",
      "Special",
    ]);
    expect(config.groups?.[6]?.stages).toHaveLength(1);
    expect(config.groups?.[0]?.stages).toHaveLength(3);
    expect(config.groups?.[0]?.stages?.[1]?.scene).toBe("sla_living_room_02");
    expect(config.rgb).toBeUndefined();
    const merged = mergeLightsStudioConfig(
      { type: "custom:scene-studio-room-lights-mini-card", studio: "living_room" },
      scenes,
    );
    expect(merged.groups).toHaveLength(7);
    expect(
      sceneIdForLightsState(
        "living_room",
        exclusiveGroupState(undefined, config.groups?.[0]?.id, 2),
        "light",
        config,
      ),
    ).toBe("sla_living_room_02");
    expect(
      sceneIdForLightsState(
        "living_room",
        exclusiveGroupState(exclusiveGroupState(undefined, config.groups?.[0]?.id, 2), undefined),
        "light",
        config,
      ),
    ).toBe("sla_living_room_00");
    expect(
      sceneIdForLightsState(
        "living_room",
        exclusiveGroupState(undefined, config.groups?.[6]?.id, 1),
        "light",
        config,
      ),
    ).toBe(config.groups?.[6]?.stages?.[0]?.scene);
    expect(studioChildCardConfig("advanced", "living_room")).toEqual({
      type: "custom:scene-studio-room-lights-mini-card",
      studio: "living_room",
    });
    const hass = {
      language: "en",
      localize: (key: string) => key,
      callService: async () => undefined,
      states: {
        "light.living_rgb": {
          entity_id: "light.living_rgb",
          state: "on",
          attributes: { brightness: 80 },
          last_changed: "",
          last_updated: "",
        },
        "light.lamp": {
          entity_id: "light.lamp",
          state: "off",
          attributes: {},
          last_changed: "",
          last_updated: "",
        },
      },
    } as HomeAssistant;
    const inferred = lightsStateFromStudio(hass, config, scenes);
    expect(inferred.group?.on).toBe(true);
    expect(config.groups?.some((group) => group.id === inferred.group?.id)).toBe(true);
    expect(
      studioLooksMatch(
        exclusiveGroupState(undefined, inferred.group?.id, inferred.group?.stage),
        inferred,
      ),
    ).toBe(true);
  });

  it("keeps a mixed custom look, skips empty groups, and allows a single group", () => {
    const scenes = advancedLightToScenes({
      name: "Den",
      slug: "den",
      entities: ["light.living_rgb", "light.lamp"],
      groups: [
        { ...newAdvancedGroup("Empty", []), stages: 3, levelNames: ["Min", "Mid", "Max"] },
        {
          ...newAdvancedGroup("RGB", ["light.living_rgb"]),
          stages: 2,
          levelNames: ["Min", "Max"],
          levelText: "Min|Max",
        },
      ],
      looks: [
        {
          name: "Cinema",
          entities: {
            "light.living_rgb": { state: "on", brightness: 40, hex: "#7ea6ff" },
            "light.lamp": { state: "on", brightness: 20 },
          },
        },
      ],
    });
    const config = lightsCardFromAdvanced(
      "custom:scene-studio-room-lights-mini-card",
      "den",
      scenes,
    );
    expect(config.groups?.map((group) => group.name)).toEqual(["RGB"]);
    expect(config.looks?.map((look) => look.name)).toEqual(["Cinema"]);
    expect(
      sceneIdForLightsState(
        "den",
        exclusiveGroupState(undefined, "look-0", 1),
        "light",
        config,
      ),
    ).toBe("sla_den_03");
    expect(mergeLightsStudioConfig(
      { type: "custom:scene-studio-room-lights-mini-card", studio: "living" },
      lightGroupToScenes({
        ...newLightGroupDraft("Living"),
        slug: "living",
        entities: ["light.living_rgb"],
        rgb: ["light.living_rgb"],
      }),
    ).groups).toBeUndefined();
  });

  it("fills a switch card from switch scenes", () => {
    const scenes = switchGroupToScenes({
      name: "Patio",
      slug: "patio",
      entities: ["switch.fan", "switch.heater"],
      mode: "cumulative",
      stage_names: ["Off", "Fan", "Heater"],
    });
    const config = switchCardFromStudio("custom:scene-studio-room-switches-card", "patio", scenes);
    expect(config.studio).toBe("patio");
    expect(config.switches).toEqual(["switch.fan", "switch.heater"]);
    expect(config.stages).toHaveLength(3);
    expect(sceneIdForSwitchIndex("patio", 2, scenes)).toBe("sst_patio_02");
  });

  it("lists ungrouped scene-set entities and hides chips until opted in", () => {
    const scenes = lightGroupToScenes({
      ...newLightGroupDraft("Guest"),
      slug: "guest",
      entities: ["light.living_rgb", "light.spare", "light.warm_left", "light.warm_right"],
      rgb: ["light.living_rgb"],
      warm: ["light.warm_left", "light.warm_right"],
      hex: "#ff8a1d",
      brightness: 71,
    });
    expect(scenes[0]?.meta?.entities).toEqual([
      "light.living_rgb",
      "light.spare",
      "light.warm_left",
      "light.warm_right",
    ]);
    expect(studioSetEntityIds("guest", scenes)).toEqual([
      "light.living_rgb",
      "light.spare",
      "light.warm_left",
      "light.warm_right",
    ]);
    const existing = mergeLightsStudioConfig(
      { type: "custom:scene-studio-card", studio: "guest" },
      scenes,
    );
    expect(existing.title).toBe("Guest");
    expect(
      mergeLightsStudioConfig(
        { type: "custom:scene-studio-card", studio: "guest", title: "Guest nook" },
        scenes,
      ).title,
    ).toBe("Guest nook");
    expect(
      mergeLightsStudioConfig(
        { type: "custom:scene-studio-card", studio: "guest", title: "" },
        scenes,
      ).title,
    ).toBe("");
    expect(
      mergeLightsStudioConfig(
        {
          type: "custom:scene-studio-card",
          studio: "guest",
          title: "Guest nook",
          title_align: "right",
        },
        scenes,
      ).title_align,
    ).toBe("right");
    expect(showsEntityButtons(existing)).toBe(false);
    expect(visibleLights(existing).map((item) => item.entity)).toEqual([
      "light.living_rgb",
      "light.spare",
      "light.warm_left",
      "light.warm_right",
    ]);
    const shown = mergeLightsStudioConfig(
      {
        type: "custom:scene-studio-room-lights-mini-card",
        studio: "guest",
        show_switches: true,
        hidden_entities: ["light.spare", "light.gone"],
      },
      scenes,
    );
    expect(showsEntityButtons(shown)).toBe(true);
    expect(shown.hidden_entities).toEqual(["light.spare"]);
    expect(visibleLights(shown).map((item) => item.entity)).toEqual([
      "light.living_rgb",
      "light.warm_left",
      "light.warm_right",
    ]);
    expect(studioChildCardConfig("light", "guest")).toEqual({
      type: "custom:scene-studio-room-lights-mini-card",
      studio: "guest",
    });
    expect(
      studioChildCardConfig("switch", "patio", {
        show_switches: true,
        hidden_entities: ["switch.fan"],
        title: "Patio fan",
      }),
    ).toEqual({
      type: "custom:scene-studio-room-switches-card",
      studio: "patio",
      show_switches: true,
      hidden_entities: ["switch.fan"],
      title: "Patio fan",
    });
    expect(studioChildCardConfig("light", "guest", { title: "" })).toEqual({
      type: "custom:scene-studio-room-lights-mini-card",
      studio: "guest",
      title: "",
    });
    expect(
      studioChildCardConfig("light", "guest", {
        title: "Guest Room",
        title_align: "center",
      }),
    ).toEqual({
      type: "custom:scene-studio-room-lights-mini-card",
      studio: "guest",
      title: "Guest Room",
      title_align: "center",
    });
    expect(
      studioChildCardConfig("light", "guest", { title: "Guest Room", title_align: "left" }),
    ).toEqual({
      type: "custom:scene-studio-room-lights-mini-card",
      studio: "guest",
      title: "Guest Room",
    });
    const switchScenes = switchGroupToScenes({
      name: "Patio",
      slug: "patio",
      entities: ["switch.fan", "switch.heater"],
      mode: "cumulative",
      stage_names: ["Off", "Fan", "Heater"],
    });
    const switchMerged = mergeSwitchStudioConfig(
      { type: "custom:scene-studio-room-switches-card", studio: "patio", show_switches: true },
      switchScenes,
    );
    expect(switchMerged.title).toBe("Patio");
    expect(
      mergeSwitchStudioConfig(
        { type: "custom:scene-studio-room-switches-card", studio: "patio", title: "" },
        switchScenes,
      ).title,
    ).toBe("");
    expect(showsEntityButtons(switchMerged)).toBe(true);
    expect(showsEntityButtons({ type: "custom:scene-studio-room-switches-card", studio: "patio" } as never)).toBe(
      false,
    );
  });

  it("turns a dashboard Scene-set card into Room Lights: Mini", () => {
    expect(studioCardTitle("Guest Room lights")).toBe("Guest Room");
    expect(studioCardTitle("Patio switches")).toBe("Patio");
    expect(pickCardTitle(undefined, "Guest Room")).toBe("Guest Room");
    expect(pickCardTitle("Dining", "Guest Room")).toBe("Dining");
    expect(pickCardTitle("", "Guest Room")).toBe("");
    expect(studioControlCardType("light")).toBe("custom:scene-studio-room-lights-mini-card");
    expect(studioControlCardType("minimal")).toBe("custom:scene-studio-room-lights-mini-card");
    expect(studioControlCardType("advanced")).toBe("custom:scene-studio-room-lights-mini-card");
    expect(studioControlCardType("switch")).toBe("custom:scene-studio-room-switches-card");
    expect(showStudioEditor({ editor: true }, false)).toBe(true);
    expect(showStudioEditor({}, true)).toBe(true);
    expect(showStudioEditor({ studio: "guest_room" }, false)).toBe(false);
    expect(
      studioDashboardSets(
        [
          { kind: "light", slug: "guest_room", name: "Guest Room lights", sceneCount: 1, entityCount: 1, scenes: [] },
          { kind: "switch", slug: "patio", name: "Patio", sceneCount: 1, entityCount: 1, scenes: [] },
        ],
        "guest_room",
      ).map((set) => set.slug),
    ).toEqual(["guest_room"]);
  });

  it("turns on Off / Default, waits, then the look", async () => {
    vi.useFakeTimers();
    const calls: Array<{ domain: string; service: string; data?: unknown; target?: unknown }> = [];
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {},
      callService: async (
        domain: string,
        service: string,
        data?: unknown,
        target?: unknown,
      ) => {
        calls.push({ domain, service, data, target });
      },
    } as HomeAssistant;
    try {
      expect(studioOffSceneId("ssl_living_w1")).toBe("ssl_living_off");
      expect(isStudioOffSceneId("ssl_living_off")).toBe(true);
      expect(isStudioOffSceneId("ssl_living_w1")).toBe(false);
      const pending = activateStudioScene(hass, "ssl_living_w1");
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toEqual([
        {
          domain: "scene",
          service: "turn_on",
          data: { entity_id: "scene.ssl_living_off" },
          target: { entity_id: "scene.ssl_living_off" },
        },
      ]);
      await vi.advanceTimersByTimeAsync(STUDIO_SCENE_GAP_MS - 1);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(calls).toEqual([
        {
          domain: "scene",
          service: "turn_on",
          data: { entity_id: "scene.ssl_living_off" },
          target: { entity_id: "scene.ssl_living_off" },
        },
        {
          domain: "scene",
          service: "turn_on",
          data: { entity_id: "scene.ssl_living_w1" },
          target: { entity_id: "scene.ssl_living_w1" },
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns on Off / Default without a delay", async () => {
    const calls: Array<{ data?: unknown }> = [];
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {},
      callService: async (_domain: string, _service: string, data?: unknown) => {
        calls.push({ data });
      },
    } as HomeAssistant;
    await activateStudioScene(hass, "ssl_living_off");
    expect(calls).toEqual([{ data: { entity_id: "scene.ssl_living_off" } }]);
  });

  it("uses legacy rgb0 / w0 / n0 when unified Off / Default was never saved", async () => {
    const calls: Array<{ domain: string; service: string; data?: unknown }> = [];
    const scene = (
      id: string,
      entities: Record<string, { state: "on" | "off" }>,
    ) => ({
      entity_id: `scene.${id}`,
      state: "scening",
      attributes: { id, entities },
      last_changed: "",
      last_updated: "",
    });
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {
        "scene.ssl_guest_rgb0": scene("ssl_guest_rgb0", {
          "light.rgb_a": { state: "off" },
          "light.rgb_b": { state: "off" },
        }),
        "scene.ssl_guest_w0": scene("ssl_guest_w0", {
          "light.warm_left": { state: "off" },
        }),
        "scene.ssl_guest_rgb": scene("ssl_guest_rgb", {
          "light.rgb_a": { state: "on" },
          "light.rgb_b": { state: "on" },
          "light.rgb_c": { state: "on" },
        }),
      },
      callService: async (domain: string, service: string, data?: unknown) => {
        calls.push({ domain, service, data });
      },
    } as HomeAssistant;
    expect(studioOffSceneIds("ssl_guest_rgb", hass)).toEqual([
      "ssl_guest_rgb0",
      "ssl_guest_w0",
    ]);
    expect(isStudioOffSceneId("ssl_guest_rgb0")).toBe(true);
    await activateStudioScene(hass, "ssl_guest_off");
    expect(calls.filter((call) => call.service === "turn_on")).toEqual([
      { domain: "scene", service: "turn_on", data: { entity_id: "scene.ssl_guest_rgb0" } },
      { domain: "scene", service: "turn_on", data: { entity_id: "scene.ssl_guest_w0" } },
    ]);
    const offs = calls.find((call) => call.service === "turn_off")?.data as
      | { entity_id?: string[] }
      | undefined;
    expect(offs?.entity_id).toEqual(
      expect.arrayContaining(["light.rgb_a", "light.rgb_b", "light.rgb_c"]),
    );
  });

  it("turns off an RGB light missing from a later Off / Default scene", async () => {
    const calls: Array<{ service: string; data?: unknown }> = [];
    const scene = (
      id: string,
      entities: Record<string, { state: "on" | "off" }>,
    ) => ({
      entity_id: `scene.${id}`,
      state: "scening",
      attributes: { id, entities },
      last_changed: "",
      last_updated: "",
    });
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {
        "scene.ssl_guest_off": scene("ssl_guest_off", {
          "light.rgb_a": { state: "off" },
          "light.rgb_b": { state: "off" },
        }),
        "scene.ssl_guest_rgb": scene("ssl_guest_rgb", {
          "light.rgb_a": { state: "on" },
          "light.rgb_b": { state: "on" },
          "light.rgb_c": { state: "on" },
        }),
      },
      callService: async (_domain: string, service: string, data?: unknown) => {
        calls.push({ service, data });
      },
    } as HomeAssistant;
    await activateStudioScene(hass, "ssl_guest_off");
    const offs = calls.find((call) => call.service === "turn_off")?.data as
      | { entity_id?: string[] }
      | undefined;
    expect(offs?.entity_id).toContain("light.rgb_c");
  });

  it("applies Off then the in-memory look when the saved scene is missing", async () => {
    vi.useFakeTimers();
    const calls: Array<{ service: string; data?: unknown }> = [];
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {},
      callService: async (_domain: string, service: string, data?: unknown) => {
        if (service === "turn_on") {
          throw new Error("Scene not found");
        }
        calls.push({ service, data });
      },
    } as HomeAssistant;
    const off = {
      id: "ssl_hall_off",
      name: "Hall · Off / Default",
      entities: { "light.warm_left": { state: "off" as const } },
    };
    const look = {
      id: "ssl_hall_w1",
      name: "Hall · Warm · Min",
      entities: { "light.warm_left": { state: "on" as const, brightness: 51 } },
    };
    try {
      const pending = previewStudioScene(hass, "ssl_hall_w1", look, off);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toEqual([{ service: "apply", data: { entities: off.entities } }]);
      await vi.advanceTimersByTimeAsync(STUDIO_SCENE_GAP_MS);
      await pending;
      expect(calls[1]).toEqual({ service: "apply", data: { entities: look.entities } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fall back to scene.apply after a bluetooth failure", async () => {
    const calls: string[] = [];
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {},
      callService: async (_domain: string, service: string) => {
        calls.push(service);
        if (service === "turn_on") {
          throw new Error(
            "Failed to connect after 9 attempt(s): The proxy/adapter is out of connection slots",
          );
        }
      },
    } as HomeAssistant;
    const off = {
      id: "ssl_hall_off",
      name: "Hall · Off / Default",
      entities: { "light.warm_left": { state: "off" as const } },
    };
    const look = {
      id: "ssl_hall_w1",
      name: "Hall · Warm · Min",
      entities: { "light.warm_left": { state: "on" as const, brightness: 51 } },
    };
    await expect(previewStudioScene(hass, "ssl_hall_w1", look, off)).rejects.toThrow(
      /Failed to connect/,
    );
    expect(calls.includes("apply")).toBe(false);
  });

  it("shows Warm Mid from live lights on load even if this browser last saved RGB", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    const draft = {
      ...newLightGroupDraft("Hall"),
      slug: "hall",
      entities: ["light.hall_rgb", "light.hall_warm_a", "light.hall_warm_b"],
      rgb: ["light.hall_rgb"],
      warm: ["light.hall_warm_a", "light.hall_warm_b"],
      warmStages: 3,
    };
    const scenes = lightGroupToScenes({ ...draft, sceneLooks: onLooksFor(draft) });
    const config = lightsCardFromStudio("custom:scene-studio-room-lights-mini-card", "hall", scenes);
    const key = lightsStorageKey(config, "scene-studio-room-lights-mini-card");
    writeStoredLightsState(key, exclusiveLightsState(undefined, "rgb"));
    const mid = percentToBrightness(60);
    const entity = (id: string, state: string, brightness?: number) => ({
      entity_id: id,
      state,
      attributes: brightness ? { brightness } : {},
      last_changed: "",
      last_updated: "",
    });
    const hass = {
      language: "en",
      localize: (key: string) => key,
      callService: async () => undefined,
      states: {
        "light.hall_rgb": entity("light.hall_rgb", "off"),
        "light.hall_warm_a": entity("light.hall_warm_a", "on", mid),
        "light.hall_warm_b": entity("light.hall_warm_b", "on", mid),
      },
    } as HomeAssistant;
    const loaded = resolveStudioLightsState(hass, config, undefined, key, scenes);
    expect(loaded.warm.on).toBe(true);
    expect(loaded.warm.stage).toBe(2);
    expect(loaded.rgb.on).toBe(false);
    expect(studioLooksMatch(loaded, exclusiveLightsState(undefined, "warm", { stage: 2 }))).toBe(
      true,
    );
  });

  it("keeps the last row when every studio light is off", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    const draft = {
      ...newLightGroupDraft("Lamp", "minimal"),
      slug: "lamp",
      entities: ["light.ble"],
      rgb: ["light.ble"],
      whites: ["light.ble"],
      whitesStages: 3,
    };
    const scenes = lightGroupToScenes(draft);
    const config = lightsCardFromStudio("custom:scene-studio-room-lights-mini-card", "lamp", scenes);
    const key = lightsStorageKey(config, "scene-studio-room-lights-mini-card");
    writeStoredLightsState(key, exclusiveLightsState(undefined, "white", { stage: 2 }));
    const hass = {
      language: "en",
      localize: (key: string) => key,
      callService: async () => undefined,
      states: {
        "light.ble": {
          entity_id: "light.ble",
          state: "off",
          attributes: {},
          last_changed: "",
          last_updated: "",
        },
      },
    } as HomeAssistant;
    const loaded = resolveStudioLightsState(hass, config, undefined, key, scenes);
    expect(loaded.white.on).toBe(false);
    expect(loaded.rgb.on).toBe(false);
    expect(loaded.last).toBe("white");
  });

  it("still turns other lights off when Off / Default cannot reach a bluetooth light", async () => {
    const calls: string[] = [];
    const scene = (
      id: string,
      entities: Record<string, { state: "on" | "off" }>,
    ) => ({
      entity_id: `scene.${id}`,
      state: "scening",
      attributes: { id, entities },
      last_changed: "",
      last_updated: "",
    });
    const hass = {
      language: "en",
      localize: (key: string) => key,
      states: {
        "scene.ssm_lamp_off": scene("ssm_lamp_off", {
          "light.ble": { state: "off" },
          "light.wifi": { state: "off" },
        }),
        "scene.ssm_lamp_rgb": scene("ssm_lamp_rgb", {
          "light.ble": { state: "on" },
          "light.wifi": { state: "off" },
        }),
      },
      callService: async (_domain: string, service: string) => {
        calls.push(service);
        if (service === "turn_on") {
          throw new Error(
            "Failed to connect after 9 attempt(s): The proxy/adapter is out of connection slots",
          );
        }
      },
    } as HomeAssistant;
    await expect(activateStudioScene(hass, "ssm_lamp_off")).rejects.toThrow(/Failed to connect/);
    expect(calls).toContain("turn_off");
  });
});

describe("studio wizard routes", () => {
  it("starts every wizard on name", () => {
    expect(WIZARD_STEPS.light[0]).toBe("name");
    expect(WIZARD_STEPS.minimal[0]).toBe("name");
    expect(WIZARD_STEPS.advanced[0]).toBe("name");
    expect(WIZARD_STEPS.advanced).toEqual(["name", "entities", "groups", "edit", "review"]);
    expect(WIZARD_STEPS.light).toEqual(["name", "entities", "groups", "edit", "review"]);
    expect(WIZARD_STEPS.switch[0]).toBe("name");
  });

  it("parses create, edit, numeric, and short step paths", () => {
    expect(parseStudioTail("new/light/name")).toEqual({
      view: "wizard",
      kind: "light",
      step: "name",
      creating: true,
    });
    expect(parseStudioTail("new/switches/2")).toEqual({
      view: "wizard",
      kind: "switch",
      step: "entities",
      creating: true,
    });
    expect(parseStudioTail("edit/minimal/guest/groups")).toEqual({
      view: "wizard",
      kind: "minimal",
      step: "groups",
      slug: "guest",
      creating: false,
    });
    expect(parseStudioTail("entities")).toEqual({
      view: "step",
      step: "entities",
    });
    expect(parseStudioTail("3")).toEqual({
      view: "step",
      index: 3,
    });
    expect(wizardStepAt("switch", { view: "step", index: 3 })).toBe("stages");
    expect(wizardStepAt("light", { view: "step", index: 3 })).toBe("groups");
    expect(wizardStepAt("advanced", { view: "step", index: 4 })).toBe("edit");
    expect(resolveWizardStep(WIZARD_STEPS.advanced, "stages")).toBe("edit");
    expect(resolveWizardStep(WIZARD_STEPS.light, "edit")).toBe("edit");
    expect(parseStudioTail("new/advanced/stages")).toEqual({
      view: "wizard",
      kind: "advanced",
      step: "edit",
      creating: true,
    });
    expect(
      studioHref(
        {
          view: "wizard",
          kind: "light",
          step: "name",
          creating: true,
        },
        "/studio.html",
      ),
    ).toBe("/studio.html#/new/light/name");
    expect(
      parseStudioLocation("/scene-studio/studio/new/light/name", ""),
    ).toEqual({
      view: "wizard",
      kind: "light",
      step: "name",
      creating: true,
    });
    expect(
      parseStudioLocation("/scene-studio/studio", "#/edit/switch/patio/stages"),
    ).toEqual({
      view: "wizard",
      kind: "switch",
      step: "stages",
      slug: "patio",
      creating: false,
    });
    expect(
      serializeStudioTail({
        view: "wizard",
        kind: "light",
        step: "groups",
        slug: "guest",
        creating: false,
      }),
    ).toBe("edit/light/guest/groups");
    expect(
      studioHref({
        view: "wizard",
        kind: "switch",
        step: "name",
        creating: true,
      }),
    ).toBe("/scene-studio/studio/new/switch/name");
  });
});

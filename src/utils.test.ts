import { beforeEach, describe, expect, it } from "vitest";
import {
  allOffTargets,
  cardEntities,
  extraStagesHidden,
  stageDesiredStates,
  cardStorageKey,
  clamp,
  domainOf,
  entityIcon,
  entitiesFromArea,
  entitiesFromDevice,
  entityStateLabel,
  readStoredPower,
  readStoredStage,
  writeStoredPower,
  writeStoredStage,
  chunkEvenly,
  distributeEvenly,
  rowFillPercent,
  isToggleEntity,
  isValidEntityId,
  normalizeSwitch,
  visibleCardEntities,
  matchingStageIndex,
  normalizeState,
  parseStageIndex,
  partitionTargets,
  relevantEntityIds,
  resolveStages,
  uniqueEntities,
} from "./utils";

describe("isValidEntityId", () => {
  it("accepts standard Home Assistant ids", () => {
    expect(isValidEntityId("switch.pool_pump")).toBe(true);
    expect(isValidEntityId("input_number.pool_stage")).toBe(true);
  });

  it("rejects empty or placeholder ids", () => {
    expect(isValidEntityId("")).toBe(false);
    expect(isValidEntityId("switch")).toBe(false);
    expect(isValidEntityId(undefined)).toBe(false);
  });
});

describe("normalizeState", () => {
  it("treats common truthy values as on", () => {
    expect(normalizeState("on")).toBe("on");
    expect(normalizeState("ON")).toBe("on");
    expect(normalizeState(true)).toBe("on");
    expect(normalizeState(1)).toBe("on");
  });

  it("treats everything else as off", () => {
    expect(normalizeState("off")).toBe("off");
    expect(normalizeState("unavailable")).toBe("off");
    expect(normalizeState("")).toBe("off");
  });
});

describe("resolveStages", () => {
  it("builds cumulative stages with all-off as stage 0", () => {
    const stages = resolveStages({
      type: "custom:staged-switch-card",
      switches: ["switch.pump", { entity: "switch.heater", name: "Heating" }],
    });

    expect(stages).toHaveLength(3);
    expect(stages[0]?.name).toBe("Off");
    expect(stages[0]?.targets.map((item) => item.state)).toEqual(["off", "off"]);
    expect(stages[1]?.targets.map((item) => item.state)).toEqual(["on", "off"]);
    expect(stages[1]?.name).toBe("Stage 1");
    expect(stages[2]?.name).toBe("Heating");
    expect(stages[2]?.targets.map((item) => item.state)).toEqual(["on", "on"]);
  });

  it("drops incomplete switch rows", () => {
    const stages = resolveStages({
      type: "custom:staged-switch-card",
      switches: ["", { entity: "" }, null as unknown as string, "switch.pump"],
    });

    expect(stages).toHaveLength(2);
    expect(uniqueEntities(stages).map((item) => item.entity)).toEqual(["switch.pump"]);
  });

  it("honors explicit stage maps and lists", () => {
    const stages = resolveStages({
      type: "custom:staged-switch-card",
      stages: [
        {
          name: "Path",
          switches: { "light.hall": "on", "light.reading": "off", "": "on" },
        },
        {
          name: "Reading",
          switches: [
            { entity: "light.hall", state: "off" },
            { entity: "light.reading", state: "on" },
          ],
        },
      ],
    });

    expect(stages[0]?.targets).toEqual([
      { entity: "light.hall", name: "Hall", state: "on" },
      { entity: "light.reading", name: "Reading", state: "off" },
    ]);
    expect(stages[1]?.targets.map((item) => item.state)).toEqual(["off", "on"]);
  });

  it("derives slider-only stages from the helper range", () => {
    const stages = resolveStages(
      { type: "custom:staged-switch-card", entity: "input_number.scene" },
      {
        entity_id: "input_number.scene",
        state: "1",
        last_changed: "",
        last_updated: "",
        attributes: { min: 1, max: 3 },
      },
    );

    expect(stages.map((stage) => stage.name)).toEqual(["Off", "Stage 2", "Stage 3"]);
    expect(stages.every((stage) => stage.targets.length === 0)).toBe(true);
  });

  it("lets stage_names override explicit stage titles", () => {
    const stages = resolveStages({
      type: "custom:staged-switch-card",
      stage_names: ["Night"],
      stages: [{ name: "Path", switches: { "light.hall": "on" } }],
    });

    expect(stages[0]?.name).toBe("Night");
  });

  it("uses editable stage_names instead of entity names", () => {
    const stages = resolveStages({
      type: "custom:staged-switch-card",
      stage_names: ["All off", "Reading", "Movie"],
      switches: ["switch.pump", "light.sofa"],
    });

    expect(stages.map((stage) => stage.name)).toEqual([
      "All off",
      "Reading",
      "Movie",
    ]);
    expect(stages[1]?.targets.map((item) => item.state)).toEqual(["on", "off"]);
    expect(stages[2]?.targets.map((item) => item.state)).toEqual(["on", "on"]);
  });

  it("caps helper ranges and extra switches at 5 stages besides Off", () => {
    const sliderOnly = resolveStages(
      { type: "custom:staged-switch-card", entity: "input_number.scene" },
      {
        entity_id: "input_number.scene",
        state: "0",
        last_changed: "",
        last_updated: "",
        attributes: { min: 0, max: 500 },
      },
    );
    expect(sliderOnly).toHaveLength(6);

    const many = resolveStages({
      type: "custom:staged-switch-card",
      switches: [
        "switch.a",
        "switch.b",
        "switch.c",
        "switch.d",
        "switch.e",
        "switch.f",
        "switch.g",
        "switch.h",
      ],
    });
    expect(many).toHaveLength(6);
    expect(uniqueEntities(many).map((item) => item.entity)).toHaveLength(8);
    expect(many[5]?.targets.filter((item) => item.state === "on")).toHaveLength(5);
  });
});

describe("partitionTargets", () => {
  it("splits valid entities by target state", () => {
    expect(
      partitionTargets([
        { entity: "switch.a", state: "on" },
        { entity: "switch.b", state: "off" },
        { entity: "", state: "on" },
      ]),
    ).toEqual({
      on: ["switch.a"],
      off: ["switch.b"],
    });
  });
});

describe("parseStageIndex and clamp", () => {
  it("rounds and clamps slider values", () => {
    expect(parseStageIndex(1.6, 3)).toBe(2);
    expect(parseStageIndex("unavailable", 3)).toBe(0);
    expect(parseStageIndex(-2, 3)).toBe(0);
    expect(parseStageIndex(9, 3)).toBe(3);
    expect(clamp(5, 0, 2)).toBe(2);
  });
});

describe("relevantEntityIds", () => {
  it("includes the helper and every mapped switch", () => {
    expect(
      relevantEntityIds({
        type: "custom:staged-switch-card",
        entity: "input_number.pool_stage",
        switches: ["switch.pump", "switch.heater"],
      }),
    ).toEqual([
      "input_number.pool_stage",
      "switch.pump",
      "switch.heater",
    ]);
  });

  it("includes roster entities that never appear in a stage", () => {
    expect(
      relevantEntityIds({
        type: "custom:staged-switch-card",
        entity: "input_number.pool_stage",
        switches: ["switch.pump", "fan.patio"],
        stages: [{ name: "Off", switches: { "switch.pump": "off" } }],
      }),
    ).toEqual(["input_number.pool_stage", "switch.pump", "fan.patio"]);
  });

  it("includes the optional power helper", () => {
    expect(
      relevantEntityIds({
        type: "custom:staged-switch-card",
        entity: "input_number.pool_stage",
        power_entity: "input_boolean.pool_power",
        switches: ["switch.pump"],
      }),
    ).toEqual([
      "input_number.pool_stage",
      "input_boolean.pool_power",
      "switch.pump",
    ]);
  });
});

describe("power and stage persistence", () => {
  beforeEach(() => {
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
  });

  it("stores last power and stage separately from each other", () => {
    const key = cardStorageKey({
      type: "custom:staged-switch-card",
      entity: "input_number.patio_stage",
    });
    writeStoredPower(key, false);
    writeStoredStage(key, 2);
    expect(readStoredPower(key)).toBe(false);
    expect(readStoredStage(key)).toBe(2);
  });
});

describe("matchingStageIndex", () => {
  const stages = resolveStages({
    type: "custom:staged-switch-card",
    switches: ["switch.fan", "light.string", "switch.heater"],
  });

  it("returns the Off stage when every entity is off", () => {
    expect(
      matchingStageIndex(stages, {
        "switch.fan": "off",
        "light.string": "off",
        "switch.heater": "off",
      }),
    ).toBe(0);
  });

  it("returns a cumulative stage for an exact combination", () => {
    expect(
      matchingStageIndex(stages, {
        "switch.fan": "on",
        "light.string": "on",
        "switch.heater": "off",
      }),
    ).toBe(2);
  });

  it("returns undefined when the mix is not a configured stage", () => {
    expect(
      matchingStageIndex(stages, {
        "switch.fan": "off",
        "light.string": "off",
        "switch.heater": "on",
      }),
    ).toBeUndefined();
  });

  it("ignores entities omitted from an explicit stage", () => {
    const explicit = resolveStages({
      type: "custom:staged-switch-card",
      stages: [
        { name: "Reading", switches: { "light.reading": "on" } },
        {
          name: "Movie",
          switches: { "light.cabinet": "on", "switch.soundbar": "on" },
        },
      ],
    });

    expect(
      matchingStageIndex(explicit, {
        "light.reading": "off",
        "light.cabinet": "on",
        "switch.soundbar": "on",
      }),
    ).toBe(1);
  });

  it("prefers the more specific matching stage", () => {
    const explicit = resolveStages({
      type: "custom:staged-switch-card",
      stages: [
        { name: "Fan only", switches: { "switch.fan": "on" } },
        {
          name: "Fan and lights",
          switches: { "switch.fan": "on", "light.string": "on" },
        },
      ],
    });

    expect(
      matchingStageIndex(explicit, {
        "switch.fan": "on",
        "light.string": "on",
      }),
    ).toBe(1);
  });
});

describe("allOffTargets", () => {
  it("turns every mapped entity off", () => {
    const stages = resolveStages({
      type: "custom:staged-switch-card",
      switches: ["switch.pump", "light.sofa"],
    });
    expect(allOffTargets(stages).map((item) => item.state)).toEqual(["off", "off"]);
  });

  it("includes roster entities omitted from explicit stages", () => {
    const config = {
      type: "custom:staged-switch-card",
      switches: ["switch.pump", "light.sofa", "fan.patio"],
      stages: [
        { name: "Off", switches: { "switch.pump": "off" as const } },
        { name: "Low", switches: { "switch.pump": "on" as const } },
      ],
    };
    const stages = resolveStages(config);
    expect(cardEntities(config, stages).map((item) => item.entity)).toEqual([
      "switch.pump",
      "light.sofa",
      "fan.patio",
    ]);
    expect(allOffTargets(stages, config).map((item) => item.entity)).toEqual([
      "switch.pump",
      "light.sofa",
      "fan.patio",
    ]);
    expect(allOffTargets(stages, config).every((item) => item.state === "off")).toBe(
      true,
    );
  });
});

describe("stageDesiredStates and extraStagesHidden", () => {
  it("defaults every card entity to off, then applies the stage", () => {
    const config = {
      type: "custom:staged-switch-card",
      switches: ["switch.pump", "light.sofa"],
      stages: [{ name: "Low", switches: { "switch.pump": "on" as const } }],
    };
    const stages = resolveStages(config);
    expect(
      stageDesiredStates(stages[0]!, cardEntities(config, stages)),
    ).toEqual({
      "switch.pump": "on",
      "light.sofa": "off",
    });
  });

  it("flags explicit configs that exceed the 5-stage cap", () => {
    expect(
      extraStagesHidden({
        type: "custom:staged-switch-card",
        stages: Array.from({ length: 7 }, (_, index) => ({
          name: `Stage ${index}`,
        })),
      }),
    ).toBe(true);
    expect(
      extraStagesHidden({
        type: "custom:staged-switch-card",
        stages: [{ name: "Off" }],
      }),
    ).toBe(false);
  });
});

describe("entityStateLabel", () => {
  it("keeps unavailable and missing distinct from off", () => {
    expect(entityStateLabel(undefined)).toBe("missing");
    expect(entityStateLabel("unavailable")).toBe("unavailable");
    expect(entityStateLabel("off")).toBe("off");
    expect(entityStateLabel("on")).toBe("on");
  });
});

describe("domainOf", () => {
  it("reads the domain prefix", () => {
    expect(domainOf("input_number.pool_stage")).toBe("input_number");
  });
});

describe("entityIcon", () => {
  it("prefers a configured icon, then the entity attribute, then a domain default", () => {
    expect(entityIcon({ entity: "light.patio", icon: "mdi:string-lights" })).toBe(
      "mdi:string-lights",
    );
    expect(
      entityIcon(
        { entity: "light.patio" },
        {
          entity_id: "light.patio",
          state: "on",
          last_changed: "",
          last_updated: "",
          attributes: { icon: "mdi:ceiling-light" },
        },
      ),
    ).toBe("mdi:ceiling-light");
    expect(entityIcon({ entity: "fan.exhaust" })).toBe("mdi:fan");
    expect(entityIcon({ entity: "scene.evening" })).toBe("mdi:power");
  });
});

describe("entitiesFromArea and entitiesFromDevice", () => {
  const hass = {
    language: "en",
    localize: (key: string) => key,
    callService: async () => undefined,
    states: {
      "light.guest_rgb": {
        entity_id: "light.guest_rgb",
        state: "off",
        attributes: {},
        last_changed: "",
        last_updated: "",
      },
      "light.guest_white": {
        entity_id: "light.guest_white",
        state: "off",
        attributes: {},
        last_changed: "",
        last_updated: "",
      },
      "sensor.guest_temp": {
        entity_id: "sensor.guest_temp",
        state: "21",
        attributes: {},
        last_changed: "",
        last_updated: "",
      },
      "light.hall": {
        entity_id: "light.hall",
        state: "off",
        attributes: {},
        last_changed: "",
        last_updated: "",
      },
      "light.guest_diag": {
        entity_id: "light.guest_diag",
        state: "off",
        attributes: {},
        last_changed: "",
        last_updated: "",
      },
    },
    entities: {
      "light.guest_rgb": { entity_id: "light.guest_rgb", device_id: "dev-1" },
      "light.guest_white": {
        entity_id: "light.guest_white",
        device_id: "dev-1",
        area_id: "guest",
      },
      "light.guest_diag": {
        entity_id: "light.guest_diag",
        device_id: "dev-1",
        area_id: "guest",
        entity_category: "diagnostic",
      },
      "sensor.guest_temp": {
        entity_id: "sensor.guest_temp",
        device_id: "dev-1",
        area_id: "guest",
      },
      "light.hall": { entity_id: "light.hall", area_id: "hall" },
    },
    devices: {
      "dev-1": { id: "dev-1", area_id: "guest" },
    },
    areas: {
      guest: { area_id: "guest", name: "Guest" },
      hall: { area_id: "hall", name: "Hall" },
    },
  };

  it("adds controllable entities from an area, including those that inherit the device area", () => {
    expect(entitiesFromArea(hass, "guest")).toEqual([
      "light.guest_rgb",
      "light.guest_white",
    ]);
  });

  it("adds controllable entities from a device", () => {
    expect(entitiesFromDevice(hass, "dev-1")).toEqual([
      "light.guest_rgb",
      "light.guest_white",
    ]);
  });

  it("skips sensors, diagnostics, and empty picker values", () => {
    expect(isToggleEntity(hass, "sensor.guest_temp")).toBe(false);
    expect(isToggleEntity(hass, "light.guest_diag")).toBe(false);
    expect(isToggleEntity(hass, "light.guest_rgb")).toBe(true);
    expect(entitiesFromArea(hass, "")).toEqual([]);
    expect(entitiesFromDevice(hass, "")).toEqual([]);
  });

  it("allows a control entity that is not loaded in hass.states yet", () => {
    expect(isToggleEntity(hass, "light.unloaded_lamp")).toBe(true);
    expect(isToggleEntity(hass, "sensor.unloaded_temp")).toBe(false);
  });
});

describe("normalizeSwitch", () => {
  it("turns null or incomplete rows into empty entities", () => {
    expect(normalizeSwitch(null).entity).toBe("");
    expect(normalizeSwitch({ entity: undefined as unknown as string }).entity).toBe(
      "",
    );
    expect(normalizeSwitch("light.guest_rgb").entity).toBe("light.guest_rgb");
  });

  it("keeps hide only when it is set", () => {
    expect(normalizeSwitch({ entity: "switch.fan", hide: true }).hide).toBe(true);
    expect(normalizeSwitch({ entity: "switch.fan" }).hide).toBeUndefined();
  });
});

describe("distributeEvenly and visibleCardEntities", () => {
  it("keeps six or fewer on one row", () => {
    expect(distributeEvenly(0)).toEqual([]);
    expect(distributeEvenly(1)).toEqual([1]);
    expect(distributeEvenly(6)).toEqual([6]);
  });

  it("splits extra entities evenly across the fewest rows", () => {
    expect(distributeEvenly(7)).toEqual([4, 3]);
    expect(distributeEvenly(8)).toEqual([4, 4]);
    expect(distributeEvenly(9)).toEqual([5, 4]);
    expect(distributeEvenly(12)).toEqual([6, 6]);
    expect(distributeEvenly(13)).toEqual([5, 4, 4]);
  });

  it("fills the rail to the current stage", () => {
    expect(rowFillPercent([1, 2, 3], 1)).toBeCloseTo(100 / 3);
    expect(rowFillPercent([1, 2, 3], 2)).toBeCloseTo(200 / 3);
    expect(rowFillPercent([1, 2, 3], 3)).toBe(100);
    expect(rowFillPercent([1, 2, 3, 4, 5], 5)).toBe(100);
    expect(rowFillPercent([1, 2, 3, 4, 5], 0)).toBe(0);
    expect(rowFillPercent([3, 4, 5], 1)).toBe(0);
    expect(rowFillPercent([1, 2], 9)).toBe(100);
    expect(rowFillPercent([], 1)).toBe(0);
  });

  it("hides flagged entities from the button rows", () => {
    const entities = [
      { entity: "switch.fan", state: "on" as const },
      { entity: "light.string", state: "on" as const },
      { entity: "switch.heater", state: "off" as const },
    ];
    expect(
      visibleCardEntities(
        {
          type: "custom:staged-switch-card",
          switches: [
            "switch.fan",
            { entity: "light.string", hide: true },
            "switch.heater",
          ],
        },
        entities,
      ).map((item) => item.entity),
    ).toEqual(["switch.fan", "switch.heater"]);
    expect(
      chunkEvenly(
        visibleCardEntities(
          {
            type: "custom:staged-switch-card",
            switches: [
              "a.a",
              "a.b",
              "a.c",
              "a.d",
              { entity: "a.e", hide: true },
              "a.f",
              "a.g",
              "a.h",
            ],
          },
          [
            { entity: "a.a", state: "off" },
            { entity: "a.b", state: "off" },
            { entity: "a.c", state: "off" },
            { entity: "a.d", state: "off" },
            { entity: "a.e", state: "off" },
            { entity: "a.f", state: "off" },
            { entity: "a.g", state: "off" },
            { entity: "a.h", state: "off" },
          ],
        ),
      ).map((row) => row.map((item) => item.entity)),
    ).toEqual([
      ["a.a", "a.b", "a.c", "a.d"],
      ["a.e", "a.f", "a.g", "a.h"].filter((id) => id !== "a.e"),
    ]);
  });
});

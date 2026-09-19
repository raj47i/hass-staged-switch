import { beforeEach, describe, expect, it } from "vitest";
import {
  allOffTargets,
  cardStorageKey,
  clamp,
  domainOf,
  entityIcon,
  entityStateLabel,
  readStoredPower,
  readStoredStage,
  writeStoredPower,
  writeStoredStage,
  isValidEntityId,
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
      switches: ["", { entity: "" }, "switch.pump"],
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

  it("caps huge helper ranges", () => {
    const stages = resolveStages(
      { type: "custom:staged-switch-card", entity: "input_number.scene" },
      {
        entity_id: "input_number.scene",
        state: "0",
        last_changed: "",
        last_updated: "",
        attributes: { min: 0, max: 500 },
      },
    );

    expect(stages).toHaveLength(33);
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

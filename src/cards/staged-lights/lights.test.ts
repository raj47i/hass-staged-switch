import { describe, expect, it } from "vitest";
import { hexToHue, hexToRgb, hueToHex, rgbToHex } from "./color";
import {
  allLightIds,
  configuredRosterItems,
  isEmptyLightsConfig,
  relevantLightEntityIds,
  rowIsConfigured,
  rowRoster,
  visibleLights,
} from "./roster";
import { lightsRowMuted, resolveRgbPresets, rowPowerIcons, rowStageIcon } from "./look";
import {
  alignedStageMaps,
  brightnessToPercent,
  configuredRows,
  displayRgbPercent,
  intensityName,
  intensityNames,
  lightsLayoutRows,
  lightsStageCount,
  maxRowStages,
  parseRgbPercent,
  percentToBrightness,
  resolveRowStageTargets,
  splitRowIds,
  splitStageTargets,
  stageToBrightness,
} from "./stages";
import {
  lightsStorageKey,
  readStoredLightsState,
  resolveLightsState,
  writeStoredLightsState,
} from "./persist";
import {
  activeLightRow,
  exclusiveLightsState,
  isLightsHelperPayload,
  parseLightsState,
  serializeLightsState,
} from "./state";

describe("color helpers", () => {
  it("round-trips hex and rgb", () => {
    expect(hexToRgb("#ff9800")).toEqual([255, 152, 0]);
    expect(rgbToHex([255, 152, 0])).toBe("#ff9800");
    expect(hexToRgb("#f80")).toEqual([255, 136, 0]);
  });

  it("maps hue to a saturated hex", () => {
    expect(hueToHex(0)).toBe("#ff0000");
    expect(hueToHex(120)).toBe("#00ff00");
    expect(hueToHex(240)).toBe("#0000ff");
    expect(hexToHue("#ff0000")).toBe(0);
  });
});

describe("lights JSON state", () => {
  it("serializes a compact exclusive payload and reads it back", () => {
    const state = {
      rgb: { on: true, brightness: 180, hex: "#2196f3" },
      warm: { on: false, stage: 2 },
      white: { on: false, stage: 1 },
    };
    const raw = serializeLightsState(state);
    expect(raw.length).toBeLessThan(255);
    expect(parseLightsState(raw)).toEqual(state);
    expect(activeLightRow(state)).toBe("rgb");
  });

  it("keeps only one row on when older JSON had several", () => {
    const parsed = parseLightsState(
      '{"r":{"o":1,"b":180,"c":"#ff9800"},"w":{"o":1,"s":2},"n":{"o":1,"s":1}}',
    );
    expect(parsed.rgb.on).toBe(true);
    expect(parsed.rgb.brightness).toBe(180);
    expect(parsed.warm).toEqual({ on: false, stage: 2 });
    expect(parsed.white).toEqual({ on: false, stage: 1 });
  });

  it("falls back when the helper is empty or invalid", () => {
    expect(parseLightsState("").rgb.hex).toBe("#ff8a1d");
    expect(parseLightsState("").rgb.brightness).toBe(180);
    expect(parseLightsState("not-json").warm.stage).toBe(1);
    expect(parseLightsState('{"r":1,"w":true}').rgb.brightness).toBe(180);
    expect(parseLightsState('{"r":1,"w":true}').warm.on).toBe(false);
    expect(parseLightsState(undefined).rgb.on).toBe(true);
    expect(serializeLightsState(undefined)).toContain('"o":1');
    expect(exclusiveLightsState(undefined, "white")?.white.on).toBe(true);
  });

  it("turns a different row on exclusively", () => {
    const current = parseLightsState();
    const next = exclusiveLightsState(current, "warm", { stage: 3 });
    expect(activeLightRow(next)).toBe("warm");
    expect(next.rgb.on).toBe(false);
    expect(next.warm).toEqual({ on: true, stage: 3 });
    expect(exclusiveLightsState(next).rgb.on).toBe(false);
    expect(exclusiveLightsState(next).warm.on).toBe(false);
  });

  it("greys every row when none is on and remembers last values", () => {
    expect(lightsRowMuted(true)).toBe(false);
    expect(lightsRowMuted(false)).toBe(true);
    expect(lightsRowMuted(undefined)).toBe(true);
    expect(lightsRowMuted(0)).toBe(true);
    const rgbOn = parseLightsState(
      '{"r":{"o":1,"b":90,"c":"#ffffff"},"w":{"o":0,"s":2},"n":{"o":0,"s":4}}',
    );
    expect(lightsRowMuted(rgbOn.rgb.on)).toBe(false);
    expect(lightsRowMuted(rgbOn.warm.on)).toBe(true);
    expect(lightsRowMuted(rgbOn.white.on)).toBe(true);
    const allOff = exclusiveLightsState(rgbOn, undefined);
    expect(activeLightRow(allOff)).toBeUndefined();
    expect(lightsRowMuted(allOff.rgb.on)).toBe(true);
    expect(allOff.rgb).toEqual({ on: false, brightness: 90, hex: "#ffffff" });
    expect(allOff.warm).toEqual({ on: false, stage: 2 });
    expect(allOff.white).toEqual({ on: false, stage: 4 });
    expect(parseLightsState(serializeLightsState(allOff))).toEqual(allOff);
  });

  it("activates a greyed row from a stage, preset, or power toggle", () => {
    const allOff = exclusiveLightsState(parseLightsState(), undefined);
    const fromStage = exclusiveLightsState(allOff, "white", { stage: 4 });
    expect(activeLightRow(fromStage)).toBe("white");
    expect(fromStage.white.stage).toBe(4);
    expect(lightsRowMuted(fromStage.rgb.on)).toBe(true);
    const fromPreset = exclusiveLightsState(fromStage, "rgb", { hex: "#7ea6ff" });
    expect(fromPreset.rgb).toMatchObject({ on: true, hex: "#7ea6ff" });
    expect(fromPreset.white).toEqual({ on: false, stage: 4 });
    const toggledOff = exclusiveLightsState(
      fromPreset,
      fromPreset.rgb.on ? undefined : "rgb",
    );
    expect(activeLightRow(toggledOff)).toBeUndefined();
    expect(toggledOff.rgb.hex).toBe("#7ea6ff");
    const toggledOn = exclusiveLightsState(toggledOff, "rgb");
    expect(toggledOn.rgb.on).toBe(true);
    expect(toggledOn.rgb.hex).toBe("#7ea6ff");
    expect(toggledOn.white.stage).toBe(4);
    const brighter = exclusiveLightsState(toggledOn, "rgb", { brightness: 40 });
    expect(brighter.rgb).toEqual({ on: true, brightness: 40, hex: "#7ea6ff" });
    expect(brighter.white.stage).toBe(4);
  });

  it("keeps an all-off helper payload all-off", () => {
    const parsed = parseLightsState(
      '{"r":{"o":0,"b":40,"c":"#2196f3"},"w":{"o":0,"s":3},"n":{"o":0,"s":2}}',
    );
    expect(activeLightRow(parsed)).toBeUndefined();
    expect(parsed.rgb).toEqual({ on: false, brightness: 40, hex: "#2196f3" });
    expect(parsed.warm).toEqual({ on: false, stage: 3 });
    expect(parsed.white).toEqual({ on: false, stage: 2 });
    expect(parseLightsState('{"r":{"o":0},"n":{"o":1,"s":5}}')).toEqual({
      rgb: { on: false, brightness: 180, hex: "#ff8a1d" },
      warm: { on: false, stage: 1 },
      white: { on: true, stage: 5 },
    });
    expect(intensityName(Number.NaN, Number.NaN)).toBe("Min");
    expect(intensityName(0, 3)).toBe("Min");
    expect(intensityName(9, 3)).toBe("Max");
  });
});

describe("intensity stages", () => {
  it("caps stages by entity count and names Min through Max", () => {
    const two = {
      type: "custom:staged-lights-card",
      warm: ["light.floor", "light.reading"],
    };
    const many = {
      type: "custom:staged-lights-card",
      warm: ["light.a", "light.b", "light.c"],
      white: ["light.x", "light.y"],
    };
    expect(maxRowStages(two, "warm")).toBe(3);
    expect(maxRowStages(many, "warm")).toBe(5);
    expect(maxRowStages(many, "white")).toBe(3);
    expect(maxRowStages({ type: "custom:staged-lights-card", warm: ["light.only"] }, "warm")).toBe(
      0,
    );
    expect(lightsStageCount(two, "warm")).toBe(3);
    expect(lightsStageCount(many, "warm")).toBe(5);
    expect(lightsStageCount(many, "white")).toBe(3);
    expect(lightsStageCount({ ...two, stages: 5 }, "warm")).toBe(3);
    expect(lightsStageCount({ ...many, stages: 2 }, "warm")).toBe(2);
    expect(intensityNames(2)).toEqual(["Min", "Max"]);
    expect(intensityNames(3)).toEqual(["Min", "Mid", "Max"]);
    expect(intensityNames(4)).toEqual(["Min", "Low", "High", "Max"]);
    expect(intensityNames(5)).toEqual(["Min", "Low", "Mid", "High", "Max"]);
    expect(intensityNames(1)).toEqual(["Min", "Max"]);
    expect(intensityNames(99)).toEqual(["Min", "Low", "Mid", "High", "Max"]);
    expect(intensityName(1, 5)).toBe("Min");
    expect(intensityName(3, 5)).toBe("Mid");
    expect(intensityName(2, 3)).toBe("Mid");
    expect(intensityName(5, 5)).toBe("Max");
    expect(intensityName(2, 2)).toBe("Max");
    expect(intensityName(1.4, 3)).toBe("Min");
    expect(intensityName(1.6, 3)).toBe("Mid");
    expect(stageToBrightness(1, 3)).toBe(85);
    expect(stageToBrightness(3, 3)).toBe(255);
    expect(brightnessToPercent(255)).toBe(100);
    expect(percentToBrightness(70)).toBe(179);
  });

  it("splits lights from switches and ignores bad ids", () => {
    expect(splitRowIds(["light.a", "switch.b", "", "fan.c"])).toEqual({
      lights: ["light.a"],
      switches: ["switch.b", "fan.c"],
    });
  });

  it("turns Warm/White stages into a per-light on/off mix", () => {
    const config = {
      type: "custom:staged-lights-card",
      stages: 3,
      warm: ["light.floor", "light.reading", "switch.sconce"],
    };
    expect(resolveRowStageTargets(config, "warm", 1).map((item) => item.state)).toEqual([
      "on",
      "off",
      "off",
    ]);
    expect(resolveRowStageTargets(config, "warm", 2).map((item) => item.state)).toEqual([
      "on",
      "on",
      "off",
    ]);
    expect(resolveRowStageTargets(config, "warm", 3).map((item) => [item.entity, item.state])).toEqual([
      ["light.floor", "on"],
      ["light.reading", "on"],
      ["switch.sconce", "on"],
    ]);
  });

  it("uses an explicit Warm/White map and keeps omitted roster lights off", () => {
    const config = {
      type: "custom:staged-lights-card",
      stages: 2,
      warm: ["light.floor", "light.reading", "switch.sconce"],
      warm_stages: [
        { switches: { "light.floor": "on", "light.reading": "off" } },
        {
          switches: [
            { entity: "light.reading", state: "on" as const },
            { entity: "switch.sconce", state: "on" as const },
          ],
        },
      ],
    };
    expect(resolveRowStageTargets(config, "warm", 1).map((item) => item.state)).toEqual([
      "on",
      "off",
      "off",
    ]);
    expect(resolveRowStageTargets(config, "warm", 2).map((item) => item.state)).toEqual([
      "off",
      "on",
      "on",
    ]);
    const aligned = alignedStageMaps(config, "warm");
    expect(aligned).toHaveLength(2);
    expect(aligned[0]?.switches).toEqual([
      { entity: "light.floor", state: "on" },
      { entity: "light.reading", state: "off" },
      { entity: "switch.sconce", state: "off" },
    ]);
    const { onLights, rest } = splitStageTargets(resolveRowStageTargets(config, "warm", 2));
    expect(onLights).toEqual(["light.reading"]);
    expect(rest.map((item) => [item.entity, item.state])).toEqual([
      ["light.floor", "off"],
      ["switch.sconce", "on"],
    ]);
  });
});

describe("look", () => {
  it("keeps default RGB swatches unless valid presets are set", () => {
    expect(resolveRgbPresets(undefined)).toHaveLength(8);
    expect(resolveRgbPresets({ type: "custom:staged-lights-card", rgb_presets: ["nope"] })).toEqual(
      resolveRgbPresets(undefined),
    );
    expect(
      resolveRgbPresets({ type: "custom:staged-lights-card", rgb_presets: ["#fff", "2196f3"] }),
    ).toEqual(["#ffffff", "#2196f3"]);
  });

  it("resolves on/off and stage icons with fallbacks", () => {
    const config = {
      type: "custom:staged-lights-card",
      rgb_icons: { on: "mdi:palette", off: "mdi:palette-outline" },
      warm_stages: [{ icon: "mdi:weather-night", switches: { "light.a": "on" } }],
    };
    expect(rowPowerIcons(config, "rgb")).toEqual({
      on: "mdi:palette",
      off: "mdi:palette-outline",
    });
    expect(rowPowerIcons(config, "warm").on).toBe("mdi:lamp");
    expect(rowStageIcon(config, "warm", 1)).toBe("mdi:weather-night");
    expect(rowStageIcon(config, "white", 1)).toBe("mdi:circle-medium");
    expect(alignedStageMaps(config, "warm", [{ entity: "light.a" }])[0]?.icon).toBe(
      "mdi:weather-night",
    );
  });
});

describe("lights roster", () => {
  it("reads each row and shows every visible entity once", () => {
    const config = {
      type: "custom:staged-lights-card",
      entity: "input_text.living_lights",
      rgb: ["light.rgb_1"],
      warm: [{ entity: "switch.sconce", hide: true }],
      white: ["", { entity: "" }, "light.ceiling"],
    };
    expect(rowRoster(config, "rgb").map((item) => item.entity)).toEqual(["light.rgb_1"]);
    expect(isEmptyLightsConfig({ type: "custom:staged-lights-card" })).toBe(true);
    expect(isEmptyLightsConfig(config)).toBe(false);
    expect(
      isEmptyLightsConfig({
        type: "custom:staged-lights-card",
        warm: ["light.only"],
      }),
    ).toBe(true);
    expect(allLightIds(config)).toEqual(["light.rgb_1", "switch.sconce", "light.ceiling"]);
    expect(visibleLights(config).map((item) => item.entity)).toEqual(["light.rgb_1"]);
    expect(relevantLightEntityIds(config)).toEqual([
      "light.rgb_1",
      "switch.sconce",
      "light.ceiling",
      "input_text.living_lights",
    ]);
  });

  it("dedupes shared entities and hides incomplete Warm/White rows", () => {
    const config = {
      type: "custom:staged-lights-card",
      rgb: ["light.shared"],
      warm: ["light.shared", "light.sconce"],
      white: ["light.only"],
    };
    expect(allLightIds(config)).toEqual(["light.shared", "light.sconce", "light.only"]);
    expect(configuredRosterItems(config).map((item) => item.entity)).toEqual([
      "light.shared",
      "light.sconce",
    ]);
    expect(configuredRows(config)).toEqual(["rgb", "warm"]);
    expect(visibleLights(config).map((item) => item.entity)).toEqual([
      "light.shared",
      "light.sconce",
    ]);
  });
});

describe("edge cases", () => {
  it("clamps NaN, overflow, and out-of-range intensity", () => {
    expect(brightnessToPercent(Number.NaN)).toBe(1);
    expect(brightnessToPercent(0)).toBe(1);
    expect(brightnessToPercent(999)).toBe(100);
    expect(percentToBrightness(Number.NaN)).toBe(3);
    expect(percentToBrightness(1)).toBe(3);
    expect(percentToBrightness(100)).toBe(255);
    expect(stageToBrightness(Number.NaN, Number.NaN)).toBe(85);
    expect(intensityName(0, 3)).toBe("Min");
    expect(intensityName(99, 3)).toBe("Max");
    expect(lightsStageCount(undefined)).toBe(3);
    expect(lightsStageCount({ type: "custom:staged-lights-card", stages: 0 })).toBe(3);
    expect(configuredRows({ type: "custom:staged-lights-card", rgb: ["light.a"] })).toEqual(["rgb"]);
    expect(
      configuredRows({
        type: "custom:staged-lights-card",
        warm: ["light.only"],
        white: ["light.a", "light.b"],
      }),
    ).toEqual(["white"]);
    expect(rowIsConfigured({ type: "custom:staged-lights-card", warm: ["light.a"] }, "warm")).toBe(
      false,
    );
    expect(
      rowIsConfigured(
        { type: "custom:staged-lights-card", warm: ["light.a", "light.b"] },
        "warm",
      ),
    ).toBe(true);
    expect(
      visibleLights({
        type: "custom:staged-lights-card",
        warm: ["light.a", "light.b"],
        white: ["light.only"],
      }).map((item) => item.entity),
    ).toEqual(["light.a", "light.b"]);
  });

  it("reads old stage-only RGB JSON and rejects junk payloads", () => {
    expect(parseLightsState('{"r":{"o":1,"s":2,"c":"#2196f3"}}').rgb.brightness).toBe(102);
    expect(parseLightsState('{"r":{"o":1,"b":3,"c":"#fff"}}').rgb.brightness).toBe(3);
    expect(parseLightsState("[]").rgb.on).toBe(true);
    expect(parseLightsState("null").rgb.hex).toBe("#ff8a1d");
    expect(parseLightsState('{"r":{"c":"not-a-color"}}').rgb.hex).toBe("#ff8a1d");
    const off = exclusiveLightsState(parseLightsState(), undefined);
    expect(activeLightRow(off)).toBeUndefined();
    expect(parseLightsState(serializeLightsState(off))).toEqual(off);
  });

  it("ignores junk YAML lists, icons, and stage maps", () => {
    const junk = {
      type: "custom:staged-lights-card",
      rgb: "light.sofa",
      warm: null,
      white: [{ entity: null }, "light.ceiling", null],
      warm_stages: { switches: { "light.a": "on" } },
      white_stages: [null, { icon: 12, switches: "light.ceiling" }, { switches: [null] }],
      rgb_icons: "mdi:palette",
      rgb_presets: [null, 12, "#00ff00", "#00ff00", "nope"],
    } as unknown as import("./types").StagedLightsCardConfig;
    expect(rowRoster(junk, "rgb")).toEqual([]);
    expect(rowRoster(junk, "white").map((item) => item.entity)).toEqual(["light.ceiling"]);
    expect(lightsStageCount(junk)).toBe(3);
    expect(lightsStageCount(junk, "white")).toBe(2);
    expect(rowPowerIcons(junk, "rgb").on).toBe("mdi:palette");
    expect(rowStageIcon(junk, "white", Number.NaN)).toBe("mdi:circle-medium");
    expect(resolveRowStageTargets(junk, "white", 1).map((item) => item.state)).toEqual(["on"]);
    expect(resolveRgbPresets(junk)).toEqual(["#00ff00", "#00ff00"]);
    expect(() => alignedStageMaps(junk, "warm")).not.toThrow();
  });

  it("parses slider percents for the RGB value next to the slider", () => {
    expect(parseRgbPercent(undefined)).toBeUndefined();
    expect(parseRgbPercent("")).toBe(1);
    expect(parseRgbPercent("nope")).toBeUndefined();
    expect(parseRgbPercent(0)).toBe(1);
    expect(parseRgbPercent(70.4)).toBe(70);
    expect(parseRgbPercent("100")).toBe(100);
    expect(parseRgbPercent(140)).toBe(100);
    expect(displayRgbPercent(180)).toBe(71);
    expect(displayRgbPercent(180, 40)).toBe(40);
    expect(displayRgbPercent(Number.NaN, Number.NaN)).toBe(1);
    expect(brightnessToPercent(percentToBrightness(1))).toBe(1);
    expect(brightnessToPercent(percentToBrightness(70))).toBe(70);
    expect(brightnessToPercent(percentToBrightness(100))).toBe(100);
  });

  it("sizes the card for empty, RGB-only, and chip layouts", () => {
    expect(lightsLayoutRows(undefined)).toBe(4);
    expect(lightsLayoutRows({ type: "custom:staged-lights-card" })).toBe(4);
    expect(
      lightsLayoutRows({ type: "custom:staged-lights-card", rgb: ["light.sofa"] }),
    ).toBe(3);
    expect(
      lightsLayoutRows({
        type: "custom:staged-lights-card",
        rgb: ["light.sofa"],
        warm: ["light.a", "light.b"],
        white: ["light.x", "light.y", "light.z"],
      }),
    ).toBe(5);
    expect(
      lightsLayoutRows({
        type: "custom:staged-lights-card",
        rgb: ["light.sofa"],
        show_switches: true,
      }),
    ).toBe(4);
    expect(
      lightsLayoutRows({
        type: "custom:staged-lights-card",
        rgb: ["light.sofa"],
        show_switches: false,
      }),
    ).toBe(3);
  });

  it("keeps the last remembered state when the helper is unavailable", () => {
    expect(isLightsHelperPayload('{"r":{"o":1}}')).toBe(true);
    expect(isLightsHelperPayload("  {\"w\":{\"o\":1,\"s\":2}}  ")).toBe(true);
    expect(isLightsHelperPayload("unavailable")).toBe(false);
    expect(isLightsHelperPayload("unknown")).toBe(false);
    expect(isLightsHelperPayload("")).toBe(false);
    expect(isLightsHelperPayload("{")).toBe(false);
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
    const key = lightsStorageKey({ type: "custom:staged-lights-card", entity: "input_text.room" });
    writeStoredLightsState(key, {
      rgb: { on: false, brightness: 90, hex: "#ffffff" },
      warm: { on: true, stage: 2 },
      white: { on: false, stage: 1 },
    });
    expect(resolveLightsState("unavailable", key).warm).toEqual({ on: true, stage: 2 });
    expect(resolveLightsState("unknown", key).rgb.on).toBe(false);
    expect(resolveLightsState("", key).warm.stage).toBe(2);
    expect(resolveLightsState('{"r":{"o":1,"b":40,"c":"#2196f3"}}', key).rgb).toEqual({
      on: true,
      brightness: 40,
      hex: "#2196f3",
    });
    expect(resolveLightsState(undefined, "missing-key").rgb.on).toBe(true);
  });

  it("reads string flags and stores helper JSON in localStorage", () => {
    expect(parseLightsState('{"r":{"o":"true","b":180,"c":"#2196f3"}}').rgb.on).toBe(true);
    expect(parseLightsState('{"r":{"o":"false","b":180},"w":{"o":"true","s":2}}').warm.on).toBe(
      true,
    );
    expect(parseLightsState('{"r":{"o":"false"},"n":{"o":"1","s":3}}').white).toEqual({
      on: true,
      stage: 3,
    });
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
    const key = lightsStorageKey({ type: "custom:staged-lights-card", entity: "input_text.room" });
    expect(key).toBe("staged-lights-card:input_text.room");
    expect(readStoredLightsState(key)).toBeUndefined();
    writeStoredLightsState(key, {
      rgb: { on: false, brightness: 90, hex: "#ffffff" },
      warm: { on: true, stage: 2 },
      white: { on: false, stage: 1 },
    });
    expect(readStoredLightsState(key)?.warm).toEqual({ on: true, stage: 2 });
    expect(readStoredLightsState(key)?.rgb.hex).toBe("#ffffff");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("quota");
        },
      },
    });
    expect(readStoredLightsState(key)).toBeUndefined();
    expect(() =>
      writeStoredLightsState(key, parseLightsState()),
    ).not.toThrow();
  });

  it("keeps serialized helper JSON under 255 characters", () => {
    const raw = serializeLightsState({
      rgb: { on: false, brightness: Number.NaN, hex: "" },
      warm: { on: true, stage: 99 },
      white: { on: true, stage: Number.NaN },
    });
    expect(raw.length).toBeLessThan(255);
    const parsed = parseLightsState(raw);
    expect(parsed.warm.on).toBe(true);
    expect(parsed.white.on).toBe(false);
    expect(parsed.warm.stage).toBe(5);
    expect(parsed.rgb.brightness).toBe(180);
    expect(parsed.rgb.hex).toBe("#ff8a1d");
  });
});

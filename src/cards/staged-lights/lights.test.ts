import { describe, expect, it } from "vitest";
import { hexToHue, hexToRgb, hueToHex, rgbToHex } from "./color";
import {
  allLightIds,
  isEmptyLightsConfig,
  relevantLightEntityIds,
  rowRoster,
  visibleLights,
} from "./roster";
import {
  brightnessToPercent,
  configuredRows,
  intensityName,
  lightsStageCount,
  percentToBrightness,
  splitRowIds,
  stageToBrightness,
} from "./stages";
import {
  activeLightRow,
  exclusiveLightsState,
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
});

describe("intensity stages", () => {
  it("clamps Warm/White to 2–4 and names the intensity", () => {
    expect(
      lightsStageCount({
        type: "custom:staged-lights-card",
        rgb: ["light.a", "light.b", "light.c", "light.d", "light.e"],
        warm: ["light.b"],
      }),
    ).toBe(3);
    expect(
      lightsStageCount({
        type: "custom:staged-lights-card",
        stages: 9,
        warm: ["light.a", "light.b", "light.c", "light.d"],
      }),
    ).toBe(4);
    expect(intensityName(1, 4)).toBe("Dim");
    expect(intensityName(2, 4)).toBe("Soft");
    expect(intensityName(3, 4)).toBe("Medium");
    expect(intensityName(4, 4)).toBe("Bright");
    expect(intensityName(2, 2)).toBe("Bright");
    expect(stageToBrightness(1, 4)).toBe(64);
    expect(stageToBrightness(4, 4)).toBe(255);
    expect(brightnessToPercent(255)).toBe(100);
    expect(percentToBrightness(70)).toBe(179);
  });

  it("splits lights from switches and ignores bad ids", () => {
    expect(splitRowIds(["light.a", "switch.b", "", "fan.c"])).toEqual({
      lights: ["light.a"],
      switches: ["switch.b", "fan.c"],
    });
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
    expect(allLightIds(config)).toEqual(["light.rgb_1", "switch.sconce", "light.ceiling"]);
    expect(visibleLights(config).map((item) => item.entity)).toEqual([
      "light.rgb_1",
      "light.ceiling",
    ]);
    expect(relevantLightEntityIds(config)).toEqual([
      "light.rgb_1",
      "switch.sconce",
      "light.ceiling",
      "input_text.living_lights",
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
    expect(intensityName(0, 3)).toBe("Dim");
    expect(intensityName(99, 3)).toBe("Bright");
    expect(lightsStageCount(undefined)).toBe(3);
    expect(lightsStageCount({ type: "custom:staged-lights-card", stages: 0 })).toBe(3);
    expect(configuredRows({ type: "custom:staged-lights-card", rgb: ["light.a"] })).toEqual(["rgb"]);
  });

  it("reads old stage-only RGB JSON and rejects junk payloads", () => {
    expect(parseLightsState('{"r":{"o":1,"s":2,"c":"#2196f3"}}').rgb.brightness).toBe(128);
    expect(parseLightsState('{"r":{"o":1,"b":3,"c":"#fff"}}').rgb.brightness).toBe(3);
    expect(parseLightsState("[]").rgb.on).toBe(true);
    expect(parseLightsState("null").rgb.hex).toBe("#ff8a1d");
    expect(parseLightsState('{"r":{"c":"not-a-color"}}').rgb.hex).toBe("#ff8a1d");
    const off = exclusiveLightsState(parseLightsState(), undefined);
    expect(activeLightRow(off)).toBeUndefined();
    expect(parseLightsState(serializeLightsState(off))).toEqual(off);
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
    expect(parsed.warm.stage).toBe(4);
    expect(parsed.rgb.brightness).toBe(180);
    expect(parsed.rgb.hex).toBe("#ff8a1d");
  });
});

import { describe, expect, it } from "vitest";
import { lightsStorageKey } from "../staged-lights/persist";
import { lightsStageCount, resolveRowStageTargets } from "../staged-lights/stages";
import { exclusiveLightsState, parseLightsState, serializeLightsState } from "../staged-lights/state";
import { CARD_NAME } from "./const";
import {
  MINI_LAYOUT_ROWS,
  configuredMiniRow,
  miniActiveRow,
  miniControlRow,
  miniModeMeta,
  miniModeOn,
  miniModes,
  miniToggleTarget,
} from "./layout";

describe("mini lights layout", () => {
  it("always uses two rows and only the configured RGB, Warm, and White modes", () => {
    expect(MINI_LAYOUT_ROWS).toBe(2);
    expect(miniModes(undefined)).toEqual([]);
    expect(miniModes(null as never)).toEqual([]);
    expect(
      miniModes({
        type: `custom:${CARD_NAME}`,
        rgb: ["light.sofa"],
        warm: ["light.a", "light.b"],
        white: ["light.only"],
      }),
    ).toEqual(["rgb", "warm"]);
  });

  it("ignores null, empty, and incomplete rosters", () => {
    expect(
      miniModes({
        type: `custom:${CARD_NAME}`,
        rgb: null as never,
        warm: [null, undefined, "", { entity: "" }] as never,
        white: "light.ceiling" as never,
      }),
    ).toEqual([]);
    expect(
      miniModes({
        type: `custom:${CARD_NAME}`,
        rgb: ["", "not-an-id", { entity: "light.sofa" }],
        white: [{ entity: "light.a" }, { entity: "light.b" }],
      }),
    ).toEqual(["rgb", "white"]);
    expect(configuredMiniRow({ type: `custom:${CARD_NAME}` }, "rgb")).toBeUndefined();
    expect(configuredMiniRow(undefined, undefined)).toBeUndefined();
    expect(configuredMiniRow(undefined, null)).toBeUndefined();
  });

  it("shows the last remembered mode after the active mode is turned off", () => {
    const config = {
      type: `custom:${CARD_NAME}`,
      rgb: ["light.sofa"],
      warm: ["light.a", "light.b"],
    };
    const rgbOn = parseLightsState();
    expect(miniControlRow(rgbOn, config)).toBe("rgb");
    const allOff = exclusiveLightsState(rgbOn, undefined);
    expect(miniActiveRow(allOff, config)).toBeUndefined();
    expect(allOff.last).toBe("rgb");
    expect(miniControlRow(allOff, config)).toBe("rgb");
    const warmOn = exclusiveLightsState(allOff, "warm");
    expect(miniControlRow(warmOn, config)).toBe("warm");
    const warmOff = exclusiveLightsState(warmOn, undefined);
    expect(warmOff.last).toBe("warm");
    expect(miniControlRow(warmOff, config)).toBe("warm");
    expect(miniControlRow(parseLightsState(serializeLightsState(warmOff)), config)).toBe("warm");
  });

  it("ignores helper and idle rows that are not on the card", () => {
    const warmOnly = {
      type: `custom:${CARD_NAME}`,
      warm: ["light.a", "light.b"],
      white: ["light.only"],
    };
    const rgbOn = parseLightsState();
    expect(miniActiveRow(rgbOn, warmOnly)).toBeUndefined();
    expect(miniControlRow(rgbOn, warmOnly)).toBe("warm");
    expect(miniControlRow(undefined, undefined)).toBeUndefined();
    expect(miniControlRow(exclusiveLightsState(rgbOn, undefined), warmOnly)).toBe("warm");
  });

  it("toggles the active mode off, then back on from the last remembered mode", () => {
    const config = {
      type: `custom:${CARD_NAME}`,
      rgb: ["light.sofa"],
      warm: ["light.a", "light.b"],
    };
    expect(miniModeMeta("rgb").label).toBe("RGB");
    const rgbOn = parseLightsState();
    expect(miniModeOn("rgb", rgbOn, config)).toBe(true);
    expect(miniModeOn("warm", rgbOn, config)).toBe(false);
    expect(miniToggleTarget("rgb", rgbOn, config)).toBeUndefined();
    expect(miniToggleTarget("warm", rgbOn, config)).toBe("warm");
    const allOff = exclusiveLightsState(rgbOn, undefined);
    expect(miniModeOn("rgb", allOff, config)).toBe(false);
    expect(miniToggleTarget("rgb", allOff, config)).toBe("rgb");
    const warmOff = exclusiveLightsState(exclusiveLightsState(allOff, "warm"), undefined);
    expect(miniToggleTarget("warm", warmOff, config)).toBe("warm");
    expect(miniToggleTarget("rgb", warmOff, config)).toBe("rgb");
    expect(serializeLightsState(warmOff)).toContain('"l":"w"');
  });

  it("keeps the guest-room RGB/Warm/White maps on a two-row card", () => {
    const config = {
      type: `custom:${CARD_NAME}`,
      title: "Room lights",
      entity: "input_text.guest_room_light_group",
      show_switches: true,
      rgb: [
        { entity: "light.guest_room_guest_room_strip_light", hide: true },
        { entity: "light.guest_room_rgb_batten" },
        { entity: "light.desk_strip_light" },
      ],
      warm: [
        { entity: "switch.guest_room_sonoff_4ch_pro_x_1_light_1" },
        { entity: "switch.guest_room_shelly_2_x1_warm_light" },
      ],
      white: [
        { entity: "switch.guest_room_sonoff_4ch_pro_x_1_center_light" },
        { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l1" },
        { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l2" },
        { entity: "light.guest_room_desk_z2ch_1_white_light" },
        { entity: "switch.desk_shelly2_desk_2_white_light" },
      ],
      warm_stages: [
        {
          name: "Dim",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_light_1", state: "off" as const },
            { entity: "switch.guest_room_shelly_2_x1_warm_light", state: "on" as const },
          ],
        },
        {
          name: "Soft",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_light_1", state: "on" as const },
            { entity: "switch.guest_room_shelly_2_x1_warm_light", state: "off" as const },
          ],
        },
        {
          name: "Medium",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_light_1", state: "on" as const },
            { entity: "switch.guest_room_shelly_2_x1_warm_light", state: "on" as const },
          ],
        },
      ],
      white_stages: [
        {
          name: "Min",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_center_light", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l1", state: "off" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l2", state: "off" as const },
            { entity: "light.guest_room_desk_z2ch_1_white_light", state: "off" as const },
            { entity: "switch.desk_shelly2_desk_2_white_light", state: "off" as const },
          ],
        },
        {
          name: "Low",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_center_light", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l1", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l2", state: "off" as const },
            { entity: "light.guest_room_desk_z2ch_1_white_light", state: "off" as const },
            { entity: "switch.desk_shelly2_desk_2_white_light", state: "off" as const },
          ],
        },
        {
          name: "Medium",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_center_light", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l1", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l2", state: "on" as const },
            { entity: "light.guest_room_desk_z2ch_1_white_light", state: "off" as const },
            { entity: "switch.desk_shelly2_desk_2_white_light", state: "off" as const },
          ],
        },
        {
          name: "High",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_center_light", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l1", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l2", state: "on" as const },
            { entity: "light.guest_room_desk_z2ch_1_white_light", state: "on" as const },
            { entity: "switch.desk_shelly2_desk_2_white_light", state: "off" as const },
          ],
        },
        {
          name: "Max",
          switches: [
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_center_light", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l1", state: "on" as const },
            { entity: "switch.guest_room_sonoff_4ch_pro_x_1_white_l2", state: "on" as const },
            { entity: "light.guest_room_desk_z2ch_1_white_light", state: "on" as const },
            { entity: "switch.desk_shelly2_desk_2_white_light", state: "off" as const },
          ],
        },
      ],
    };
    expect(miniModes(config)).toEqual(["rgb", "warm", "white"]);
    expect(MINI_LAYOUT_ROWS).toBe(2);
    expect(lightsStageCount(config, "warm")).toBe(3);
    expect(lightsStageCount(config, "white")).toBe(5);
    expect(
      resolveRowStageTargets(config, "warm", 1).map((item) => [item.entity, item.state]),
    ).toEqual([
      ["switch.guest_room_sonoff_4ch_pro_x_1_light_1", "off"],
      ["switch.guest_room_shelly_2_x1_warm_light", "on"],
    ]);
    expect(
      resolveRowStageTargets(config, "warm", 2).map((item) => [item.entity, item.state]),
    ).toEqual([
      ["switch.guest_room_sonoff_4ch_pro_x_1_light_1", "on"],
      ["switch.guest_room_shelly_2_x1_warm_light", "off"],
    ]);
    expect(
      resolveRowStageTargets(config, "white", 5).map((item) => [item.entity, item.state]),
    ).toEqual([
      ["switch.guest_room_sonoff_4ch_pro_x_1_center_light", "on"],
      ["switch.guest_room_sonoff_4ch_pro_x_1_white_l1", "on"],
      ["switch.guest_room_sonoff_4ch_pro_x_1_white_l2", "on"],
      ["light.guest_room_desk_z2ch_1_white_light", "on"],
      ["switch.desk_shelly2_desk_2_white_light", "off"],
    ]);
    expect(miniControlRow(parseLightsState(), config)).toBe("rgb");
    const whiteOff = exclusiveLightsState(
      exclusiveLightsState(parseLightsState(), "white"),
      undefined,
    );
    expect(miniControlRow(whiteOff, config)).toBe("white");
    expect(miniToggleTarget("white", whiteOff, config)).toBe("white");
  });

  it("stores mini state under a separate browser key", () => {
    expect(
      lightsStorageKey({ type: `custom:${CARD_NAME}`, entity: "input_text.room" }, CARD_NAME),
    ).toBe("staged-lights-mini-card:input_text.room");
    expect(lightsStorageKey(undefined, CARD_NAME)).toBe("staged-lights-mini-card:default");
    expect(
      lightsStorageKey({ type: `custom:${CARD_NAME}`, entity: undefined, title: undefined }, CARD_NAME),
    ).toBe("staged-lights-mini-card:default");
  });
});

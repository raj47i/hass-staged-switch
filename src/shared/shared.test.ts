import { describe, expect, it, vi } from "vitest";
import {
  applyLightLooks,
  applyToggleTargets,
  setEntityOnOff,
  setInputNumber,
  setInputText,
} from "./actions";
import {
  appendUniqueEntities,
  fireConfigChanged,
  pickedValue,
} from "./editor";
import {
  hiddenEntityIds,
  overlayHiddenEntities,
  pruneHiddenEntities,
  showsEntityButtons,
  toggleHiddenEntity,
} from "./entity-buttons";
import {
  asArray,
  entityDisplayName,
  friendlyNameFromEntity,
  generatedEntityLabel,
  isGeneratedEntityLabel,
  isRosterEntity,
  isRgbCapableLight,
  isToggleEntity,
  safeIcon,
  uniqueEntityIds,
} from "./entities";
import {
  callHassService,
  errorMessage,
  fireEvent,
  friendlyActionError,
  isInEditorPreview,
  relevantHassChanged,
  withTimeout,
} from "./hass";
import {
  cardStorageKey,
  readStoredNumber,
  readStoredOnOff,
  writeStoredNumber,
  writeStoredOnOff,
} from "./persist";
import { SerialActionQueue } from "./queue";
import { registerLovelaceCard } from "./register";
import type { HomeAssistant } from "./types";

const hassStub = (
  patch: Partial<HomeAssistant> = {},
): HomeAssistant => ({
  language: "en",
  localize: (key: string) => key,
  callService: async () => undefined,
  states: {},
  ...patch,
});

describe("entity display names", () => {
  it("pretty-prints an entity id when Home Assistant has no name", () => {
    expect(friendlyNameFromEntity("switch.demo_4ch_2_switch_2")).toBe(
      "Demo 4ch 2 Switch 2",
    );
    expect(entityDisplayName(undefined, "switch.demo_4ch_2_switch_2")).toBe(
      "Demo 4ch 2 Switch 2",
    );
  });

  it("prefers a renamed registry name over a stale friendly_name", () => {
    const hass = hassStub({
      states: {
        "switch.demo_4ch_2_switch_2": {
          entity_id: "switch.demo_4ch_2_switch_2",
          state: "off",
          attributes: { friendly_name: "Switch demo_4ch_2_switch_2" },
          last_changed: "",
          last_updated: "",
        },
      },
      entities: {
        "switch.demo_4ch_2_switch_2": {
          entity_id: "switch.demo_4ch_2_switch_2",
          name: "Stair lamp",
        },
      },
    });
    expect(entityDisplayName(hass, "switch.demo_4ch_2_switch_2")).toBe("Stair lamp");
  });

  it("does not use a device name when the entity already has a friendly_name", () => {
    const hass = hassStub({
      states: {
        "switch.demo_4ch_2_switch_2": {
          entity_id: "switch.demo_4ch_2_switch_2",
          state: "off",
          attributes: { friendly_name: "Stair lamp" },
          last_changed: "",
          last_updated: "",
        },
      },
      entities: {
        "switch.demo_4ch_2_switch_2": {
          entity_id: "switch.demo_4ch_2_switch_2",
          device_id: "box",
        },
      },
      devices: {
        box: { id: "box", name: "Relay 4ch", name_by_user: "Relay box" },
      },
    });
    expect(entityDisplayName(hass, "switch.demo_4ch_2_switch_2")).toBe("Stair lamp");
    expect(generatedEntityLabel("switch.demo_4ch_2_switch_2")).toBe(
      "Switch demo_4ch_2_switch_2",
    );
    expect(
      isGeneratedEntityLabel(
        "Switch demo_4ch_2_switch_2",
        "switch.demo_4ch_2_switch_2",
        "Stair lamp",
      ),
    ).toBe(true);
    expect(
      isGeneratedEntityLabel("Movie", "switch.demo_4ch_2_switch_2", "Stair lamp"),
    ).toBe(false);
  });
});

describe("SerialActionQueue", () => {
  it("enqueues, shifts, and clears in order", () => {
    const queue = new SerialActionQueue<string>();
    expect(queue.length).toBe(0);
    expect(queue.shift()).toBeUndefined();
    queue.enqueue("a");
    queue.enqueue("b");
    expect(queue.length).toBe(2);
    expect(queue.shift()).toBe("a");
    queue.clear();
    expect(queue.length).toBe(0);
  });
});

describe("persist helpers", () => {
  it("builds a scoped key and stores on/off and numbers", () => {
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
    const key = cardStorageKey("demo-card", "input_number.scene");
    expect(key).toBe("demo-card:input_number.scene");
    expect(cardStorageKey("demo-card")).toBe("demo-card:default");
    writeStoredOnOff(key, true);
    writeStoredNumber(key, 3);
    expect(readStoredOnOff(key)).toBe(true);
    expect(readStoredNumber(key)).toBe(3);
    expect(readStoredOnOff(key, "missing")).toBeUndefined();
    expect(readStoredNumber(key, "missing")).toBeUndefined();
  });

  it("returns undefined for junk values and storage failures", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => "maybe",
        setItem: () => {
          throw new Error("quota");
        },
      },
    });
    expect(readStoredOnOff("k")).toBeUndefined();
    expect(readStoredNumber("k")).toBeUndefined();
    expect(() => writeStoredOnOff("k", false)).not.toThrow();
    expect(() => writeStoredNumber("k", 1)).not.toThrow();

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readStoredOnOff("k")).toBeUndefined();
    expect(readStoredNumber("k")).toBeUndefined();
  });
});

describe("applyToggleTargets", () => {
  it("turns listed entities on or off and skips when disabled", async () => {
    const calls: Array<{ domain: string; service: string; data?: unknown }> = [];
    const hass = hassStub({
      callService: async (domain, service, serviceData) => {
        calls.push({ domain, service, data: serviceData });
      },
    });
    await applyToggleTargets(undefined, [{ entity: "switch.a", state: "on" }]);
    await applyToggleTargets(
      hass,
      [{ entity: "switch.a", state: "on" }],
      false,
    );
    await applyToggleTargets(hass, [
      { entity: "switch.a", state: "on" },
      { entity: "light.b", state: "off" },
      { entity: "", state: "on" },
    ]);
    await setEntityOnOff(hass, "fan.patio", true);
    await setInputNumber(hass, "input_number.scene", 2);
    await setInputText(hass, "input_text.room", "{\"r\":1}");
    await applyLightLooks(hass, ["light.sofa", "", "not-an-id"], {
      on: true,
      brightness: 180,
      rgb: [255, 152, 0],
    });
    expect(calls).toEqual([
      { domain: "homeassistant", service: "turn_on", data: { entity_id: ["switch.a"] } },
      { domain: "homeassistant", service: "turn_off", data: { entity_id: ["light.b"] } },
      { domain: "homeassistant", service: "turn_on", data: { entity_id: "fan.patio" } },
      {
        domain: "input_number",
        service: "set_value",
        data: { entity_id: "input_number.scene", value: 2 },
      },
      {
        domain: "input_text",
        service: "set_value",
        data: { entity_id: "input_text.room", value: "{\"r\":1}" },
      },
      {
        domain: "light",
        service: "turn_on",
        data: {
          entity_id: ["light.sofa"],
          brightness: 180,
          rgb_color: [255, 152, 0],
        },
      },
    ]);
  });

  it("keeps turning other lights off when one bluetooth light is unreachable", async () => {
    const calls: Array<{ data?: unknown }> = [];
    const hass = hassStub({
      callService: async (_domain, _service, serviceData) => {
        calls.push({ data: serviceData });
        const ids = (serviceData as { entity_id?: string | string[] } | undefined)?.entity_id;
        if (Array.isArray(ids) && ids.length > 1) {
          throw new Error("Failed to connect after 9 attempt(s): connection slot");
        }
        if (ids === "light.ble") {
          throw new Error("Failed to connect after 9 attempt(s): connection slot");
        }
      },
    });
    await expect(
      applyToggleTargets(hass, [
        { entity: "light.wifi", state: "off" },
        { entity: "light.ble", state: "off" },
      ]),
    ).rejects.toThrow(/Failed to connect/);
    expect(calls).toEqual([
      { data: { entity_id: ["light.wifi", "light.ble"] } },
      { data: { entity_id: "light.wifi" } },
      { data: { entity_id: "light.ble" } },
    ]);
  });
});

describe("editor helpers", () => {
  it("reads picker values from the event or the target", () => {
    expect(
      pickedValue({
        detail: { value: "area.guest" },
        target: { value: "ignored" },
      } as unknown as Event),
    ).toBe("area.guest");
    expect(
      pickedValue({
        target: { value: "device.one" },
      } as unknown as Event),
    ).toBe("device.one");
    expect(pickedValue({} as Event)).toBe("");
  });

  it("appends unique toggle entities and skips sensors or duplicates", () => {
    const hass = hassStub({
      states: {
        "light.sofa": {
          entity_id: "light.sofa",
          state: "off",
          attributes: {},
          last_changed: "",
          last_updated: "",
        },
        "sensor.temp": {
          entity_id: "sensor.temp",
          state: "21",
          attributes: {},
          last_changed: "",
          last_updated: "",
        },
      },
    });
    const first = appendUniqueEntities(
      [{ entity: "light.sofa" }, { entity: "" }],
      ["light.sofa", "sensor.temp", "light.lamp"],
      hass,
    );
    expect(first.added).toBe(true);
    expect(first.roster.map((item) => item.entity)).toEqual([
      "light.sofa",
      "light.lamp",
    ]);
    expect(appendUniqueEntities(first.roster, ["light.lamp"], hass).added).toBe(
      false,
    );
    expect(appendUniqueEntities([], ["light.lamp"]).added).toBe(false);
  });

  it("keeps empty roster rows as valid editor placeholders", () => {
    expect(isRosterEntity({ entity: "" })).toBe(true);
    expect(isRosterEntity({ entity: "switch.fan" })).toBe(true);
    expect(isRosterEntity({ entity: "switch" })).toBe(false);
  });

  it("fires a bubbled config-changed event", () => {
    const events: Event[] = [];
    const host = {
      dispatchEvent(event: Event) {
        events.push(event);
        return true;
      },
    } as unknown as HTMLElement;
    fireConfigChanged(host, { type: "custom:demo" });
    fireEvent(host, "demo", { ok: true });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "config-changed",
      detail: { config: { type: "custom:demo" } },
    });
  });
});

describe("hass helpers", () => {
  it("reports relevant state identity changes", () => {
    const light = {
      entity_id: "light.sofa",
      state: "on",
      attributes: {},
      last_changed: "",
      last_updated: "",
    };
    const oldHass = hassStub({ states: { "light.sofa": light } });
    const sameHass = hassStub({ states: { "light.sofa": light } });
    const nextHass = hassStub({
      states: { "light.sofa": { ...light, state: "off" } },
    });
    expect(relevantHassChanged(undefined, nextHass, ["light.sofa"])).toBe(true);
    expect(relevantHassChanged(oldHass, sameHass, ["light.sofa"])).toBe(false);
    expect(relevantHassChanged(oldHass, nextHass, ["light.sofa"])).toBe(true);
    expect(relevantHassChanged(oldHass, nextHass, ["switch.other"])).toBe(false);
  });

  it("reads Error messages and walks editor preview hosts", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(errorMessage("nope", "fallback")).toBe("fallback");
    const host = { localName: "hui-card-preview", parentElement: null };
    Object.defineProperty(host, "getRootNode", {
      value: () => host,
    });
    expect(isInEditorPreview(host as unknown as Node)).toBe(true);
    expect(
      isInEditorPreview({
        localName: "div",
        parentElement: null,
        getRootNode: () => ({ }),
      } as unknown as Node),
    ).toBe(false);
  });

  it("maps bluetooth and nested HA errors to a short card message", async () => {
    const ble =
      "Failed to perform the action scene/turn_on. Lamp [AA:BB:CC:11:22:33] (id=DE:AD:BE:EF:00:01) - AA:BB:CC:11:22:33: Failed to connect after 9 attempt(s): No backend with an available connection slot that can reach address AA:BB:CC:11:22:33 was found: unknown (never seen by any scanner); 1 scanner(s) registered, 1 scanning, 1 connectable: The proxy/adapter is out of connection slots or the device is no longer reachable; Add additional proxies (https://esphome.github.io/bluetooth-proxies/) near this device";
    const friendly =
      "Couldn't reach a device. Check power, range, or the Bluetooth proxy, then try again.";
    expect(friendlyActionError(new Error(ble), "Failed to update lights")).toBe(
      friendly,
    );
    expect(
      friendlyActionError({ body: { message: ble } }, "Failed to update lights"),
    ).toBe(friendly);
    expect(friendlyActionError(new Error("Entity not found"), "fallback")).toBe(
      "Entity not found",
    );
    expect(friendlyActionError({}, "Failed to update lights")).toBe(
      "Failed to update lights",
    );
    const args: unknown[] = [];
    const hass = hassStub({
      callService: async (...rest) => {
        args.push(rest);
      },
    });
    await callHassService(
      hass,
      "scene",
      "turn_on",
      { entity_id: "scene.demo" },
      { entity_id: "scene.demo" },
    );
    expect(args[0]).toEqual([
      "scene",
      "turn_on",
      { entity_id: "scene.demo" },
      { entity_id: "scene.demo" },
      false,
    ]);
    expect(
      friendlyActionError(new Error("Device connection timed out"), "fallback"),
    ).toBe(
      "Couldn't reach a device. Check power, range, or the Bluetooth proxy, then try again.",
    );
    const ws: unknown[] = [];
    const wired = hassStub({
      callService: async () => {
        throw new Error("should use callWS");
      },
      callWS: async (msg) => {
        ws.push(msg);
      },
    });
    await callHassService(wired, "scene", "turn_on", { entity_id: "scene.demo" });
    expect(ws[0]).toMatchObject({
      type: "call_service",
      domain: "scene",
      service: "turn_on",
    });
  });

  it("rejects hanging work when a timeout is reached", async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(
        new Promise<void>(() => undefined),
        40,
        "Device connection timed out",
      );
      const rejected = expect(pending).rejects.toThrow("Device connection timed out");
      await vi.advanceTimersByTimeAsync(40);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isToggleEntity extras", () => {
  it("rejects hidden, disabled, and non-toggle services", () => {
    const hass = hassStub({
      states: {
        "light.hidden": {
          entity_id: "light.hidden",
          state: "off",
          attributes: {},
          last_changed: "",
          last_updated: "",
        },
        "light.disabled": {
          entity_id: "light.disabled",
          state: "off",
          attributes: {},
          last_changed: "",
          last_updated: "",
        },
        "light.broken": {
          entity_id: "light.broken",
          state: "off",
          attributes: {},
          last_changed: "",
          last_updated: "",
        },
      },
      entities: {
        "light.hidden": { entity_id: "light.hidden", hidden: true },
        "light.disabled": { entity_id: "light.disabled", disabled_by: "user" },
      },
      services: {
        light: { toggle: {} },
      },
    });
    expect(isToggleEntity(hass, "light.hidden")).toBe(false);
    expect(isToggleEntity(hass, "light.disabled")).toBe(false);
    expect(isToggleEntity(hass, "light.broken")).toBe(false);
  });

  it("accepts RGB-capable lights and rejects color-temp only", () => {
    const hass = hassStub({
      states: {
        "light.rgb": {
          entity_id: "light.rgb",
          state: "on",
          attributes: { supported_color_modes: ["rgb"] },
          last_changed: "",
          last_updated: "",
        },
        "light.warm": {
          entity_id: "light.warm",
          state: "on",
          attributes: { supported_color_modes: ["color_temp"] },
          last_changed: "",
          last_updated: "",
        },
      },
    });
    expect(isRgbCapableLight(hass, "light.rgb")).toBe(true);
    expect(isRgbCapableLight(hass, "light.unloaded")).toBe(true);
    expect(isRgbCapableLight(hass, "light.warm")).toBe(false);
    expect(isRgbCapableLight(hass, "switch.lamp")).toBe(false);
  });
});

describe("entity button config", () => {
  it("keeps existing scene-set cards hidden until Show entity buttons is on", () => {
    expect(showsEntityButtons({ studio: "guest" })).toBe(false);
    expect(showsEntityButtons({ studio: "guest", show_switches: false })).toBe(false);
    expect(showsEntityButtons({ studio: "guest", show_switches: true })).toBe(true);
    expect(showsEntityButtons({ show_switches: true })).toBe(true);
    expect(showsEntityButtons({ show_switches: false })).toBe(false);
    expect(showsEntityButtons(undefined, true)).toBe(false);
    expect(showsEntityButtons({}, true)).toBe(true);
    expect(showsEntityButtons({ show_switches: false }, true)).toBe(false);
  });

  it("defaults every set entity to visible and prunes leftovers", () => {
    expect(hiddenEntityIds({})).toEqual([]);
    expect(hiddenEntityIds({ hidden_entities: ["light.a", "not-id", "light.a"] })).toEqual([
      "light.a",
    ]);
    expect(pruneHiddenEntities(["light.gone", "light.keep"], ["light.keep", "light.new"])).toEqual([
      "light.keep",
    ]);
    expect(toggleHiddenEntity([], "light.a", false, ["light.a", "light.b"])).toEqual(["light.a"]);
    expect(toggleHiddenEntity(["light.a"], "light.a", true, ["light.a", "light.b"])).toBeUndefined();
    expect(toggleHiddenEntity(["light.gone"], "light.gone", true, ["light.a"])).toBeUndefined();
    expect(overlayHiddenEntities(["light.a", "light.b"], ["light.b"])).toEqual([
      { entity: "light.a" },
      { entity: "light.b", hide: true },
    ]);
  });
});

describe("asArray and safeIcon", () => {
  it("treats non-lists and blank icons as empty", () => {
    expect(asArray("light.a")).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray([null, "light.a", undefined])).toEqual(["light.a"]);
    expect(safeIcon("  mdi:lamp  ")).toBe("mdi:lamp");
    expect(safeIcon("   ")).toBe("");
    expect(safeIcon(12, "mdi:fallback")).toBe("mdi:fallback");
    expect(safeIcon(undefined, "mdi:fallback")).toBe("mdi:fallback");
    expect(uniqueEntityIds(["light.a", "light.a", "", "not-id", undefined, "switch.b"])).toEqual([
      "light.a",
      "switch.b",
    ]);
  });
});

describe("registerLovelaceCard", () => {
  it("registers a card once", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    (globalThis as { window?: { customCards?: unknown[] } }).window = {
      customCards: [],
    };
    registerLovelaceCard({
      type: "demo-card",
      name: "Demo",
      description: "Test",
    });
    registerLovelaceCard({
      type: "demo-card",
      name: "Demo",
      description: "Test",
    });
    expect(window.customCards).toHaveLength(1);
    info.mockRestore();
  });
});

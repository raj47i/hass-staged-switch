import { describe, expect, it, vi } from "vitest";
import { applyToggleTargets, setEntityOnOff, setInputNumber } from "./actions";
import {
  appendUniqueEntities,
  fireConfigChanged,
  pickedValue,
} from "./editor";
import { isRosterEntity, isToggleEntity } from "./entities";
import {
  errorMessage,
  fireEvent,
  isInEditorPreview,
  relevantHassChanged,
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
    expect(calls).toEqual([
      { domain: "homeassistant", service: "turn_on", data: { entity_id: ["switch.a"] } },
      { domain: "homeassistant", service: "turn_off", data: { entity_id: ["light.b"] } },
      { domain: "homeassistant", service: "turn_on", data: { entity_id: "fan.patio" } },
      {
        domain: "input_number",
        service: "set_value",
        data: { entity_id: "input_number.scene", value: 2 },
      },
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

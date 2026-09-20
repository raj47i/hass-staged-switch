import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  entitiesFromArea,
  entitiesFromDevice,
  entityAreaId,
  entityDisplayName,
  fireEvent,
  isToggleEntity,
  isValidEntityId,
  pickedValue,
} from "../shared";
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  HomeAssistant,
} from "../shared/types";
import { STUDIO_BULK_PICK, STUDIO_PICK_DOMAINS } from "./const";
import { studioStyles } from "./styles";

export const STUDIO_PICK_RESULT_LIMIT = 25;

export const isStudioPickEntity = (
  hass: HomeAssistant | undefined,
  entityId: string,
): boolean => {
  if (!isValidEntityId(entityId)) {
    return false;
  }
  const domain = entityId.split(".", 1)[0] ?? "";
  if (!STUDIO_PICK_DOMAINS.includes(domain as (typeof STUDIO_PICK_DOMAINS)[number])) {
    return false;
  }
  if (!hass) {
    return true;
  }
  return isToggleEntity(hass, entityId);
};

export const studioEntitiesFromArea = (
  hass: HomeAssistant | undefined,
  areaId: string,
  used: Iterable<string> = [],
): string[] => {
  if (!hass || !areaId) {
    return [];
  }
  const skip = new Set(used);
  return entitiesFromArea(hass, areaId).filter(
    (entityId) => isStudioPickEntity(hass, entityId) && !skip.has(entityId),
  );
};

export const studioEntitiesFromDevice = (
  hass: HomeAssistant | undefined,
  deviceId: string,
  used: Iterable<string> = [],
): string[] => {
  if (!hass || !deviceId) {
    return [];
  }
  const skip = new Set(used);
  return entitiesFromDevice(hass, deviceId).filter(
    (entityId) => isStudioPickEntity(hass, entityId) && !skip.has(entityId),
  );
};

export const studioAreas = (
  hass: HomeAssistant | undefined,
  used: Iterable<string> = [],
): AreaRegistryEntry[] =>
  Object.values(hass?.areas ?? {})
    .filter((area) => studioEntitiesFromArea(hass, area.area_id, used).length)
    .sort((left, right) => left.name.localeCompare(right.name));

export const studioDevices = (
  hass: HomeAssistant | undefined,
  used: Iterable<string> = [],
): DeviceRegistryEntry[] =>
  Object.values(hass?.devices ?? {})
    .filter((device) => studioEntitiesFromDevice(hass, device.id, used).length)
    .sort((left, right) =>
      (left.name_by_user || left.name || left.id).localeCompare(
        right.name_by_user || right.name || right.id,
      ),
    );

export const studioDevicesInArea = (
  hass: HomeAssistant | undefined,
  areaId: string,
  used: Iterable<string> = [],
): DeviceRegistryEntry[] => {
  const devices = studioDevices(hass, used);
  if (!areaId) {
    return devices;
  }
  return devices.filter((device) => {
    if (device.area_id === areaId) {
      return true;
    }
    if (!hass) {
      return false;
    }
    return studioEntitiesFromDevice(hass, device.id, used).some(
      (entityId) => entityAreaId(hass, entityId) === areaId,
    );
  });
};

export const studioPickableEntities = (
  hass: HomeAssistant | undefined,
  used: Iterable<string> = [],
): string[] => {
  if (!hass?.states) {
    return [];
  }
  const skip = new Set(used);
  return Object.keys(hass.states)
    .filter((entityId) => isStudioPickEntity(hass, entityId) && !skip.has(entityId))
    .sort();
};

export const studioPickQuery = (value = ""): string => value.trim().toLowerCase();

export const studioEntityMatchesQuery = (
  hass: HomeAssistant | undefined,
  entityId: string,
  query: string,
): boolean => {
  const needle = studioPickQuery(query);
  if (!needle) {
    return true;
  }
  return (
    entityDisplayName(hass, entityId).toLowerCase().includes(needle) ||
    entityId.toLowerCase().includes(needle)
  );
};

export const shouldListStudioEntities = (filters: {
  areaId?: string;
  deviceId?: string;
  query?: string;
}): boolean =>
  Boolean(
    filters.areaId?.trim() ||
      filters.deviceId?.trim() ||
      studioPickQuery(filters.query ?? ""),
  );

export const studioFilteredEntities = (
  hass: HomeAssistant | undefined,
  filters: {
    used?: Iterable<string>;
    areaId?: string;
    deviceId?: string;
    query?: string;
  } = {},
): string[] => {
  const used = filters.used ?? [];
  let ids: string[];
  if (filters.deviceId) {
    ids = studioEntitiesFromDevice(hass, filters.deviceId, used);
    if (filters.areaId && hass) {
      ids = ids.filter((entityId) => entityAreaId(hass, entityId) === filters.areaId);
    }
  } else if (filters.areaId) {
    ids = studioEntitiesFromArea(hass, filters.areaId, used);
  } else {
    ids = studioPickableEntities(hass, used);
  }
  if (studioPickQuery(filters.query ?? "")) {
    ids = ids.filter((entityId) =>
      studioEntityMatchesQuery(hass, entityId, filters.query ?? ""),
    );
  }
  return ids.sort((left, right) =>
    entityDisplayName(hass, left).localeCompare(entityDisplayName(hass, right)),
  );
};

@customElement(STUDIO_BULK_PICK)
export class SceneStudioBulkPick extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public used: string[] = [];

  @state() private _area = "";
  @state() private _device = "";
  @state() private _query = "";

  static styles = studioStyles;

  private _filters() {
    return { used: this.used, areaId: this._area, deviceId: this._device, query: this._query };
  }

  private _matches(): string[] {
    if (!shouldListStudioEntities(this._filters())) {
      return [];
    }
    return studioFilteredEntities(this.hass, this._filters());
  }

  private _emit(entities: string[]): void {
    if (!entities.length) {
      return;
    }
    fireEvent(this, "studio-add-entities", { entities });
  }

  private _areaChanged(ev: Event): void {
    this._area = pickedValue(ev);
    this._device = "";
  }

  private _deviceChanged(ev: Event): void {
    this._device = pickedValue(ev);
  }

  private _queryInput(ev: Event): void {
    this._query = (ev.target as HTMLInputElement).value;
  }

  private _searchKey(ev: KeyboardEvent): void {
    if (ev.key !== "Enter") {
      return;
    }
    ev.preventDefault();
    const first = this._matches()[0];
    if (first) {
      this._emit([first]);
    }
  }

  protected render() {
    const areas = studioAreas(this.hass, this.used);
    const devices = studioDevicesInArea(this.hass, this._area, this.used);
    const listing = shouldListStudioEntities(this._filters());
    const matches = this._matches();
    const shown = matches.slice(0, STUDIO_PICK_RESULT_LIMIT);
    return html`
      <div class="pick">
        <label class="field">
          <span>Search</span>
          <input
            type="search"
            class="text-input"
            placeholder="Name or entity id"
            .value=${this._query}
            @input=${this._queryInput}
            @keydown=${this._searchKey}
          />
        </label>
        <div class="pick-filters">
          <label class="field">
            <span>Area</span>
            <select .value=${this._area} @change=${this._areaChanged}>
              <option value="">All areas</option>
              ${areas.map(
                (area) => html`<option value=${area.area_id}>${area.name}</option>`,
              )}
            </select>
          </label>
          <label class="field">
            <span>Device</span>
            <select .value=${this._device} @change=${this._deviceChanged}>
              <option value="">All devices</option>
              ${devices.map(
                (device) => html`
                  <option value=${device.id}>
                    ${device.name_by_user || device.name || device.id}
                  </option>
                `,
              )}
            </select>
          </label>
        </div>
        ${listing
          ? html`
              <div class="pick-results">
                ${shown.length
                  ? shown.map(
                      (entityId) => html`
                        <button
                          class="pick-row"
                          type="button"
                          @click=${() => this._emit([entityId])}
                        >
                          <span>${entityDisplayName(this.hass, entityId)}</span>
                          <span class="muted">${entityId}</span>
                        </button>
                      `,
                    )
                  : html`<p class="help">No unused lights or switches match that filter.</p>`}
                ${matches.length > shown.length
                  ? html`
                      <p class="help">
                        Showing ${shown.length} of ${matches.length}. Keep typing or
                        pick a device.
                      </p>
                    `
                  : nothing}
              </div>
              ${matches.length
                ? html`
                    <button
                      class="secondary"
                      type="button"
                      @click=${() => this._emit(matches)}
                    >
                      Add all ${matches.length} in this filter
                    </button>
                  `
                : nothing}
            `
          : html`
              <p class="help">
                Type a name, or pick an area and then a device, to find a specific
                light or switch.
              </p>
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [STUDIO_BULK_PICK]: SceneStudioBulkPick;
  }
}

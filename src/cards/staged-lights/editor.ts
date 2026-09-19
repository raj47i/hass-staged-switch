import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  appendUniqueEntities,
  entitiesFromArea,
  entitiesFromDevice,
  fireConfigChanged,
  isRgbCapableLight,
  isRosterEntity,
  isToggleEntity,
  isValidEntityId,
  normalizeSwitch,
  pickedValue,
} from "../../shared";
import type { HomeAssistant, SwitchEntityConfig } from "../../shared/types";
import {
  CARD_NAME,
  MAX_LIGHT_STAGES,
  MIN_LIGHT_STAGES,
  RGB_DOMAINS,
  STAGE_DOMAINS,
} from "./const";
import { intensityNames } from "./stages";
import { editorStyles } from "./styles";
import type { LightRowId, StagedLightsCardConfig } from "./types";

@customElement(`${CARD_NAME}-editor`)
export class StagedLightsCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: StagedLightsCardConfig;
  @state() private _areaPicker = "";
  @state() private _devicePicker = "";
  @state() private _focusRow: LightRowId = "rgb";

  public setConfig(config: StagedLightsCardConfig): void {
    if (!config || typeof config !== "object") {
      return;
    }
    this._config = { ...config };
  }

  private _update(patch: Partial<StagedLightsCardConfig>): void {
    if (!this._config) {
      return;
    }
    this._config = { ...this._config, ...patch };
    fireConfigChanged(this, this._config);
  }

  private _domains(row: LightRowId): string[] {
    return row === "rgb" ? RGB_DOMAINS : STAGE_DOMAINS;
  }

  private _accepts(row: LightRowId, entityId: string): boolean {
    if (!isValidEntityId(entityId)) {
      return false;
    }
    const domain = entityId.split(".", 1)[0] ?? "";
    if (!this._domains(row).includes(domain)) {
      return false;
    }
    if (this.hass && !isToggleEntity(this.hass, entityId)) {
      return false;
    }
    if (row === "rgb") {
      return isRgbCapableLight(this.hass, entityId);
    }
    return true;
  }

  private _roster(row: LightRowId): SwitchEntityConfig[] {
    return (this._config?.[row] ?? []).map(normalizeSwitch).filter(isRosterEntity);
  }

  private _writeRoster(row: LightRowId, roster: SwitchEntityConfig[]): void {
    this._update({ [row]: roster.map(normalizeSwitch).filter(isRosterEntity) });
  }

  private _addEntities(row: LightRowId, entityIds: string[]): void {
    const allowed = entityIds.filter((entityId) => this._accepts(row, entityId));
    const { roster, added } = appendUniqueEntities(
      this._roster(row),
      allowed,
      this.hass,
      this._domains(row),
    );
    if (added) {
      this._writeRoster(row, roster);
    }
  }

  private _areaPicked(row: LightRowId, ev: Event): void {
    const areaId = pickedValue(ev);
    this._areaPicker = "";
    this._focusRow = row;
    if (!areaId || !this.hass) {
      return;
    }
    this._addEntities(row, entitiesFromArea(this.hass, areaId));
  }

  private _devicePicked(row: LightRowId, ev: Event): void {
    const deviceId = pickedValue(ev);
    this._devicePicker = "";
    this._focusRow = row;
    if (!deviceId || !this.hass) {
      return;
    }
    this._addEntities(row, entitiesFromDevice(this.hass, deviceId));
  }

  private _entityChanged(row: LightRowId, index: number, ev: CustomEvent<{ value?: string }>): void {
    const value = ev.detail?.value;
    if (!this._accepts(row, value ?? "")) {
      return;
    }
    const roster = [...this._roster(row)];
    if (!roster[index]) {
      return;
    }
    roster[index] = { ...roster[index], entity: value! };
    this._writeRoster(row, roster);
  }

  private _hideChanged(row: LightRowId, index: number, ev: Event): void {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) || !this._roster(row)[index]) {
      return;
    }
    const roster = [...this._roster(row)];
    roster[index] = {
      ...roster[index],
      hide: target.checked || undefined,
    };
    this._writeRoster(row, roster);
  }

  private _remove(row: LightRowId, index: number): void {
    const roster = [...this._roster(row)];
    if (index < 0 || index >= roster.length) {
      return;
    }
    roster.splice(index, 1);
    this._writeRoster(row, roster);
  }

  private _move(row: LightRowId, index: number, direction: -1 | 1): void {
    const next = index + direction;
    const roster = [...this._roster(row)];
    if (next < 0 || next >= roster.length) {
      return;
    }
    [roster[index], roster[next]] = [roster[next], roster[index]];
    this._writeRoster(row, roster);
  }

  private _renderRoster(row: LightRowId, title: string, help: string) {
    const roster = this._roster(row);
    const domains = this._domains(row);
    const itemLabel = row === "rgb" ? "RGB light" : "Light or switch";
    return html`
      <div class="row">
        <span class="label">${title}</span>
        <span class="help">${help}</span>
        ${customElements.get("ha-area-picker")
          ? html`
              <ha-area-picker
                .hass=${this.hass}
                .value=${this._focusRow === row ? this._areaPicker : ""}
                label="Add from area"
                @value-changed=${(ev: Event) => this._areaPicked(row, ev)}
              ></ha-area-picker>
            `
          : nothing}
        ${customElements.get("ha-device-picker")
          ? html`
              <ha-device-picker
                .hass=${this.hass}
                .value=${this._focusRow === row ? this._devicePicker : ""}
                label="Add from device"
                @value-changed=${(ev: Event) => this._devicePicked(row, ev)}
              ></ha-device-picker>
            `
          : nothing}
        <div class="list">
          ${roster.map(
            (item, index) => html`
              <div class="item">
                <div class="item-head">
                  <span class="label">${itemLabel} ${index + 1}</span>
                  <div class="reorder">
                    <button type="button" ?disabled=${index === 0} @click=${() => this._move(row, index, -1)}>
                      Up
                    </button>
                    <button
                      type="button"
                      ?disabled=${index === roster.length - 1}
                      @click=${() => this._move(row, index, 1)}
                    >
                      Down
                    </button>
                    <button type="button" @click=${() => this._remove(row, index)}>Remove</button>
                  </div>
                </div>
                <ha-entity-picker
                  .hass=${this.hass}
                  .value=${item.entity}
                  label=${itemLabel}
                  .includeDomains=${domains}
                  allow-custom-entity
                  @value-changed=${(ev: CustomEvent<{ value?: string }>) =>
                    this._entityChanged(row, index, ev)}
                ></ha-entity-picker>
                ${isValidEntityId(item.entity)
                  ? html`
                      <div class="inline">
                        <span class="label">Hide from card</span>
                        <input
                          type="checkbox"
                          .checked=${Boolean(item.hide)}
                          @change=${(ev: Event) => this._hideChanged(row, index, ev)}
                        />
                      </div>
                    `
                  : nothing}
              </div>
            `,
          )}
        </div>
        <div class="actions">
          <button type="button" @click=${() => this._writeRoster(row, [...roster, { entity: "" }])}>
            Add ${row === "rgb" ? "RGB light" : "entity"}
          </button>
        </div>
      </div>
    `;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const config = this._config;
    const names = intensityNames(Number(config.stages) || 3);
    return html`
      <div class="form">
        <ha-textfield
          label="Title"
          .value=${config.title ?? ""}
          placeholder="Room lights"
          @input=${(ev: Event) => {
            const target = ev.target;
            if (!(target instanceof HTMLInputElement)) {
              return;
            }
            this._update({ title: target.value || undefined });
          }}
        ></ha-textfield>

        <ha-entity-picker
          .hass=${this.hass}
          .value=${config.entity ?? ""}
          label="State helper (input_text)"
          .includeDomains=${["input_text"]}
          allow-custom-entity
          @value-changed=${(ev: CustomEvent<{ value?: string }>) =>
            this._update({ entity: ev.detail?.value || undefined })}
        ></ha-entity-picker>
        <span class="help">
          One Text helper is enough. Create it under Helpers → Text, set max
          length to 255. The card stores the active row, RGB brightness and
          color, and the last Warm/White intensity.
        </span>

        <ha-textfield
          type="number"
          label="Warm / White stages (2–4)"
          min=${MIN_LIGHT_STAGES}
          max=${MAX_LIGHT_STAGES}
          .value=${config.stages != null ? String(config.stages) : ""}
          placeholder="Auto (min 2)"
          @input=${(ev: Event) => {
            const target = ev.target;
            if (!(target instanceof HTMLInputElement)) {
              return;
            }
            const raw = target.value;
            if (!raw.trim()) {
              this._update({ stages: undefined });
              return;
            }
            const value = Number(raw);
            this._update({
              stages: Number.isFinite(value)
                ? Math.min(MAX_LIGHT_STAGES, Math.max(MIN_LIGHT_STAGES, Math.round(value)))
                : undefined,
            });
          }}
        ></ha-textfield>
        <span class="help">
          Intensity labels: ${names.join(", ")}. Only RGB, Warm, or White can
          be on at once. Entity chips stay off until you enable them.
        </span>

        <div class="inline">
          <span class="label">Directly control lights</span>
          <input
            type="checkbox"
            .checked=${config.direct_control !== false}
            @change=${(ev: Event) => {
              const target = ev.target;
              if (target instanceof HTMLInputElement) {
                this._update({ direct_control: target.checked });
              }
            }}
          />
        </div>
        <div class="inline">
          <span class="label">Show entity buttons</span>
          <input
            type="checkbox"
            .checked=${Boolean(config.show_switches)}
            @change=${(ev: Event) => {
              const target = ev.target;
              if (target instanceof HTMLInputElement) {
                this._update({ show_switches: target.checked });
              }
            }}
          />
        </div>

        ${this._renderRoster(
          "rgb",
          "RGB lights",
          "Color lights only. Brightness slider plus quick color presets.",
        )}
        ${this._renderRoster(
          "warm",
          "Warm lights",
          "Lights or switches. Intensity stages Dim → Bright.",
        )}
        ${this._renderRoster(
          "white",
          "White / sun lights",
          "Lights or switches. Same intensity stages as Warm.",
        )}
      </div>
    `;
  }

  static styles = editorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "staged-lights-card-editor": StagedLightsCardEditor;
  }
}

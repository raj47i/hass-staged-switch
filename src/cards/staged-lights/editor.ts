import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  appendUniqueEntities,
  entitiesFromArea,
  entitiesFromDevice,
  entityDisplayName,
  fireConfigChanged,
  isRgbCapableLight,
  isRosterEntity,
  isToggleEntity,
  isValidEntityId,
  normalizeState,
  normalizeSwitch,
  pickedValue,
  safeIcon,
} from "../../shared";
import type { HomeAssistant, SwitchEntityConfig, SwitchState } from "../../shared/types";
import { normalizeHex } from "./color";
import {
  CARD_NAME,
  MAX_RGB_PRESETS,
  MIN_LIGHT_STAGES,
  MIN_WARM_WHITE_ENTITIES,
  RGB_DOMAINS,
  RGB_PRESETS,
  ROW_META,
  STAGE_DOMAINS,
} from "./const";
import { lightsDirectControl, resolveRgbPresets, rowPowerIcons } from "./look";
import {
  alignedStageMaps,
  intensityNames,
  lightsStageCount,
  maxRowStages,
  rowStageMaps,
  type StageRowId,
} from "./stages";
import { editorStyles } from "./styles";
import type { LightRowId, RowIcons, StagedLightsCardConfig } from "./types";

type EditorPage =
  | "rgb-entities"
  | "warm-entities"
  | "white-entities"
  | "rgb-setup"
  | "warm-setup"
  | "white-setup";

const PAGES: Array<{ id: EditorPage; group: "entities" | "setup"; label: string }> = [
  { id: "rgb-entities", group: "entities", label: "RGB" },
  { id: "warm-entities", group: "entities", label: "Warm" },
  { id: "white-entities", group: "entities", label: "White" },
  { id: "rgb-setup", group: "setup", label: "RGB" },
  { id: "warm-setup", group: "setup", label: "Warm" },
  { id: "white-setup", group: "setup", label: "White" },
];

@customElement(`${CARD_NAME}-editor`)
export class StagedLightsCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: StagedLightsCardConfig;
  @state() private _page: EditorPage = "rgb-entities";
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
    const raw = this._config?.[row];
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map(normalizeSwitch).filter(isRosterEntity);
  }

  private _stagesKey(row: StageRowId): "warm_stages" | "white_stages" {
    return row === "warm" ? "warm_stages" : "white_stages";
  }

  private _iconsKey(row: LightRowId): "rgb_icons" | "warm_icons" | "white_icons" {
    return row === "rgb" ? "rgb_icons" : row === "warm" ? "warm_icons" : "white_icons";
  }

  private _writeRoster(row: LightRowId, roster: SwitchEntityConfig[]): void {
    if (!this._config) {
      return;
    }
    const clean = roster.map(normalizeSwitch).filter(isRosterEntity);
    if (row === "rgb") {
      this._update({ rgb: clean });
      return;
    }
    const next = { ...this._config, [row]: clean };
    this._config = {
      ...next,
      [this._stagesKey(row)]: clean.some((item) => isValidEntityId(item.entity))
        ? alignedStageMaps(next, row, clean)
        : undefined,
    };
    fireConfigChanged(this, this._config);
  }

  private _setRowStageCount(row: StageRowId, value?: number): void {
    if (!this._config) {
      return;
    }
    const roster = this._roster(row);
    if (roster.filter((item) => isValidEntityId(item.entity)).length < MIN_WARM_WHITE_ENTITIES) {
      return;
    }
    const next = { ...this._config };
    const cap = maxRowStages(next, row);
    const count =
      value == null || !Number.isFinite(value)
        ? cap
        : Math.min(cap, Math.max(MIN_LIGHT_STAGES, Math.round(value)));
    this._config = {
      ...next,
      [this._stagesKey(row)]: alignedStageMaps(next, row, roster, count),
    };
    fireConfigChanged(this, this._config);
  }

  private _setRowIcons(row: LightRowId, patch: RowIcons): void {
    const key = this._iconsKey(row);
    const raw = this._config?.[key];
    const current =
      raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const next = {
      on: patch.on !== undefined ? safeIcon(patch.on) || undefined : current.on,
      off: patch.off !== undefined ? safeIcon(patch.off) || undefined : current.off,
    };
    this._update({
      [key]: next.on || next.off ? next : undefined,
    });
  }

  private _stageState(
    row: StageRowId,
    stageIndex: number,
    entityId: string,
  ): SwitchState {
    const maps = alignedStageMaps(this._config, row, this._roster(row));
    const switches = maps[stageIndex]?.switches;
    if (!Array.isArray(switches)) {
      return "off";
    }
    const match = switches.find(
      (item) => typeof item !== "string" && item.entity === entityId,
    );
    return match && typeof match !== "string" ? match.state : "off";
  }

  private _setStageEntityState(
    row: StageRowId,
    stageIndex: number,
    entityId: string,
    state: SwitchState,
  ): void {
    const maps = alignedStageMaps(this._config, row, this._roster(row));
    const current = maps[stageIndex];
    if (!current) {
      return;
    }
    maps[stageIndex] = {
      ...current,
      switches: this._roster(row)
        .filter((item) => isValidEntityId(item.entity))
        .map((item) => ({
          entity: item.entity,
          state:
            item.entity === entityId
              ? normalizeState(state)
              : this._stageState(row, stageIndex, item.entity),
        })),
    };
    this._update({ [this._stagesKey(row)]: maps });
  }

  private _setStageIcon(row: StageRowId, stageIndex: number, icon?: string): void {
    const maps = alignedStageMaps(this._config, row, this._roster(row));
    if (!maps[stageIndex]) {
      return;
    }
    maps[stageIndex] = { ...maps[stageIndex], icon: safeIcon(icon) || undefined };
    this._update({ [this._stagesKey(row)]: maps });
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

  private _setEntityIcon(row: LightRowId, index: number, icon?: string): void {
    const roster = [...this._roster(row)];
    if (!roster[index]) {
      return;
    }
    roster[index] = { ...roster[index], icon: safeIcon(icon) || undefined };
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

  private _setPreset(index: number, hex: string): void {
    const presets = [...resolveRgbPresets(this._config)];
    if (!presets[index]) {
      return;
    }
    presets[index] = normalizeHex(hex, RGB_PRESETS[0] ?? "#ff8a1d");
    this._update({ rgb_presets: presets });
  }

  private _addPreset(): void {
    const presets = [...resolveRgbPresets(this._config)];
    if (presets.length >= MAX_RGB_PRESETS) {
      return;
    }
    presets.push("#ffffff");
    this._update({ rgb_presets: presets });
  }

  private _removePreset(index: number): void {
    const presets = resolveRgbPresets(this._config).filter((_, itemIndex) => itemIndex !== index);
    this._update({ rgb_presets: presets.length ? presets : undefined });
  }

  private _go(page: EditorPage): void {
    this._page = page;
    this._areaPicker = "";
    this._devicePicker = "";
  }

  private _renderIconPicker(label: string, value: string | undefined, onChange: (value?: string) => void) {
    const current = value ?? "";
    if (customElements.get("ha-icon-picker")) {
      return html`
        <ha-icon-picker
          .hass=${this.hass}
          .value=${current}
          label=${label}
          @value-changed=${(ev: CustomEvent<{ value?: string }>) =>
            onChange(ev.detail?.value?.trim() || undefined)}
        ></ha-icon-picker>
      `;
    }
    return html`
      <ha-textfield
        label=${label}
        .value=${current}
        placeholder="mdi:lightbulb"
        @input=${(ev: Event) => {
          const target = ev.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value.trim() || undefined);
          }
        }}
      ></ha-textfield>
    `;
  }

  private _renderRowIcons(row: LightRowId) {
    const icons = rowPowerIcons(this._config, row);
    const configured = this._config?.[this._iconsKey(row)];
    return html`
      <div class="row">
        <span class="label">${ROW_META[row].label} button icons</span>
        <span class="help">Used on the power button when this row is on or off.</span>
        ${this._renderIconPicker("On icon", configured?.on ?? icons.on, (value) =>
          this._setRowIcons(row, { on: value }),
        )}
        ${this._renderIconPicker("Off icon", configured?.off ?? icons.off, (value) =>
          this._setRowIcons(row, { off: value }),
        )}
      </div>
    `;
  }

  private _renderRoster(row: LightRowId, title: string, help: string) {
    const roster = this._roster(row);
    const domains = this._domains(row);
    const itemLabel = row === "rgb" ? "RGB light" : "Light or switch";
    return html`
      <div class="row">
        <span class="label">${title}</span>
        <span class="help">${help}</span>
        ${row !== "rgb" &&
        roster.filter((item) => isValidEntityId(item.entity)).length < MIN_WARM_WHITE_ENTITIES
          ? html`
              <span class="help">
                Add at least ${MIN_WARM_WHITE_ENTITIES} lights or switches. With
                fewer, this row stays hidden on the card.
              </span>
            `
          : nothing}
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
                      ${this._renderIconPicker("Icon", item.icon, (icon) =>
                        this._setEntityIcon(row, index, icon),
                      )}
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

  private _renderStageMaps(row: StageRowId) {
    const roster = this._roster(row).filter((item) => isValidEntityId(item.entity));
    if (roster.length < MIN_WARM_WHITE_ENTITIES) {
      return html`
        <span class="help">
          Add at least ${MIN_WARM_WHITE_ENTITIES} ${ROW_META[row].label} entities
          first. Min and Max then stay as stages; Low / Mid / High are
          optional.
        </span>
      `;
    }
    const cap = maxRowStages(this._config, row);
    const count = lightsStageCount(this._config, row);
    const names = intensityNames(count);
    const maps = rowStageMaps(this._config, row);
    return html`
      <div class="row">
        <span class="label">${ROW_META[row].label} stages</span>
        <span class="help">
          Min and Max always stay. Two lights allow up to 3 stages (Min /
          Mid / Max). Three or more lights allow up to 5: Min / Low /
          Mid / High / Max.
        </span>
        <ha-textfield
          type="number"
          label="Stages (${MIN_LIGHT_STAGES}–${cap})"
          min=${MIN_LIGHT_STAGES}
          max=${cap}
          .value=${String(count)}
          @input=${(ev: Event) => {
            const target = ev.target;
            if (!(target instanceof HTMLInputElement)) {
              return;
            }
            const value = Number(target.value);
            this._setRowStageCount(row, Number.isFinite(value) ? value : cap);
          }}
        ></ha-textfield>
        <span class="help">
          Each intensity is one combination. Mark every light on or off, and
          pick a stage icon. Current labels: ${names.join(", ")}.
        </span>
        <div class="list">
          ${names.map(
            (label, stageIndex) => html`
              <div class="item">
                <span class="label">${maps[stageIndex]?.name?.trim() || label}</span>
                ${this._renderIconPicker(`${label} icon`, maps[stageIndex]?.icon, (icon) =>
                  this._setStageIcon(row, stageIndex, icon),
                )}
                ${roster.map(
                  (item) => html`
                    <label class="inline">
                      <span class="label">${entityDisplayName(this.hass, item.entity, item.name)}</span>
                      <select
                        .value=${this._stageState(row, stageIndex, item.entity)}
                        @change=${(ev: Event) => {
                          const target = ev.target;
                          if (!(target instanceof HTMLSelectElement)) {
                            return;
                          }
                          this._setStageEntityState(
                            row,
                            stageIndex,
                            item.entity,
                            target.value as SwitchState,
                          );
                        }}
                      >
                        <option value="off">Off</option>
                        <option value="on">On</option>
                      </select>
                    </label>
                  `,
                )}
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  private _renderRgbSetup() {
    const presets = resolveRgbPresets(this._config);
    return html`
      ${this._renderRowIcons("rgb")}
      <div class="row">
        <span class="label">Default colors</span>
        <span class="help">
          These swatches appear on the RGB row. The last control on the card is
          still a custom color picker.
        </span>
        <div class="list">
          ${presets.map(
            (hex, index) => html`
              <div class="item preset-row">
                <input
                  type="color"
                  .value=${hex}
                  aria-label="Preset ${index + 1}"
                  @input=${(ev: Event) => {
                    const target = ev.target;
                    if (target instanceof HTMLInputElement) {
                      this._setPreset(index, target.value);
                    }
                  }}
                />
                <span class="hex">${hex}</span>
                <button type="button" @click=${() => this._removePreset(index)}>Remove</button>
              </div>
            `,
          )}
        </div>
        <div class="actions">
          <button
            type="button"
            ?disabled=${presets.length >= MAX_RGB_PRESETS}
            @click=${() => this._addPreset()}
          >
            Add color
          </button>
        </div>
      </div>
    `;
  }

  private _renderSharedFields() {
    const config = this._config!;
    return html`
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
        length to 255.
      </span>

      <div class="inline">
        <span class="label">Directly control lights</span>
        <input
          type="checkbox"
            .checked=${lightsDirectControl(config)}
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
    `;
  }

  private _renderSteps() {
    return html`
      <div class="step-groups">
        <div class="step-group">
          <span class="label">1. Entities</span>
          <div class="steps">
            ${PAGES.filter((page) => page.group === "entities").map(
              (page) => html`
                <button
                  type="button"
                  class="${this._page === page.id ? "active" : ""}"
                  @click=${() => this._go(page.id)}
                >
                  ${page.label}
                </button>
              `,
            )}
          </div>
        </div>
        <div class="step-group">
          <span class="label">2. Setup</span>
          <div class="steps">
            ${PAGES.filter((page) => page.group === "setup").map(
              (page) => html`
                <button
                  type="button"
                  class="${this._page === page.id ? "active" : ""}"
                  @click=${() => this._go(page.id)}
                >
                  ${page.label}
                </button>
              `,
            )}
          </div>
        </div>
      </div>
    `;
  }

  private _renderPage() {
    switch (this._page) {
      case "rgb-entities":
        return this._renderRoster(
          "rgb",
          "RGB lights",
          "Color lights only. Brightness slider plus the colors you pick on Setup.",
        );
      case "warm-entities":
        return this._renderRoster(
          "warm",
          "Warm lights",
          "Lights or switches. Need two or more or this row stays hidden. Set on/off mixes on Warm setup.",
        );
      case "white-entities":
        return this._renderRoster(
          "white",
          "White / sun lights",
          "Lights or switches. Need two or more or this row stays hidden. Set on/off mixes on White setup.",
        );
      case "rgb-setup":
        return this._renderRgbSetup();
      case "warm-setup":
        return html`${this._renderRowIcons("warm")}${this._renderStageMaps("warm")}`;
      case "white-setup":
        return html`${this._renderRowIcons("white")}${this._renderStageMaps("white")}`;
      default:
        return nothing;
    }
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    return html`
      <div class="form">
        ${this._renderSharedFields()}
        ${this._renderSteps()}
        ${this._renderPage()}
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

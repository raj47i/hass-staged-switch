import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  applyLightLooks,
  applyToggleTargets,
  chunkEvenly,
  clamp,
  DOCUMENTATION_URL,
  domainOf,
  entityDisplayName,
  entityIcon,
  entityStateLabel,
  errorMessage,
  isValidEntityId,
  registerLovelaceCard,
  relevantHassChanged,
  rowFillPercent,
  SerialActionQueue,
  setEntityOnOff,
  setInputText,
} from "../../shared";
import type { HomeAssistant, LovelaceCard, SwitchTarget } from "../../shared/types";
import { hexToRgb, normalizeHex } from "./color";
import { lightsRowMuted, resolveRgbPresets, rowPowerIcons, rowStageIcon } from "./look";
import {
  CARD_NAME,
  CARD_TITLE,
  DEFAULT_RGB_HEX,
  ROW_META,
  ROW_ORDER,
} from "./const";
import "./editor";
import { lightsStorageKey, resolveLightsState, writeStoredLightsState } from "./persist";
import {
  isEmptyLightsConfig,
  relevantLightEntityIds,
  rowRoster,
  visibleLights,
} from "./roster";
import {
  configuredRows,
  displayRgbPercent,
  intensityNames,
  lightsLayoutRows,
  lightsStageCount,
  parseRgbPercent,
  percentToBrightness,
  resolveRowStageTargets,
  splitStageTargets,
  stageToBrightness,
} from "./stages";
import { exclusiveLightsState, serializeLightsState } from "./state";
import { cardStyles } from "./styles";
import type {
  LightRowId,
  LightsCardState,
  StagedLightsCardConfig,
} from "./types";

@customElement(CARD_NAME)
export class StagedLightsCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: StagedLightsCardConfig;
  @state() private _state?: LightsCardState;
  @state() private _pending = false;
  @state() private _error?: string;
  @state() private _rgbDragPercent?: number;
  private _queue = new SerialActionQueue<() => Promise<void>>();

  public static async getConfigElement() {
    return document.createElement(`${CARD_NAME}-editor`);
  }

  public static getStubConfig(): StagedLightsCardConfig {
    return {
      type: `custom:${CARD_NAME}`,
      rgb: [],
      warm: [],
      white: [],
      show_switches: false,
    };
  }

  public setConfig(config: StagedLightsCardConfig): void {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
    this._state = undefined;
    this._rgbDragPercent = undefined;
    this._queue.clear();
    this._error = undefined;
  }

  public getCardSize(): number {
    return lightsLayoutRows(this._config);
  }

  public getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      max_columns: 12,
      min_rows: lightsLayoutRows(this._config),
    };
  }

  private get _storageKey() {
    return lightsStorageKey(this._config);
  }

  private get _helper() {
    const entityId = this._config?.entity;
    if (!entityId || !this.hass?.states) {
      return undefined;
    }
    return this.hass.states[entityId];
  }

  private get _current(): LightsCardState {
    if (this._state) {
      return this._state;
    }
    return resolveLightsState(this._helper?.state, this._storageKey);
  }

  private _stageCount(row: "warm" | "white") {
    return lightsStageCount(this._config, row);
  }

  private get _rows(): LightRowId[] {
    return configuredRows(this._config);
  }

  private get _visibleEntities() {
    if (!this._config?.show_switches) {
      return [];
    }
    return visibleLights(this._config);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (
      changed.has("_config") ||
      changed.has("_state") ||
      changed.has("_pending") ||
      changed.has("_error") ||
      changed.has("_rgbDragPercent")
    ) {
      return true;
    }
    if (changed.has("hass")) {
      return relevantHassChanged(
        changed.get("hass") as HomeAssistant | undefined,
        this.hass,
        relevantLightEntityIds(this._config),
      );
    }
    return true;
  }

  protected updated(changed: PropertyValues): void {
    if (!changed.has("hass") || !this._state || !this._helper) {
      return;
    }
    if (this._helper.state === serializeLightsState(this._state)) {
      this._state = undefined;
    }
  }

  private _rowIds(row: LightRowId): string[] {
    return rowRoster(this._config, row)
      .map((item) => item.entity)
      .filter(isValidEntityId);
  }

  private async _writeState(next: LightsCardState): Promise<void> {
    this._state = next;
    writeStoredLightsState(this._storageKey, next);
    const helperId = this._config?.entity;
    if (!this.hass || !isValidEntityId(helperId)) {
      return;
    }
    await setInputText(this.hass, helperId, serializeLightsState(next));
  }

  private async _run(task: () => Promise<void>): Promise<void> {
    if (this._pending) {
      this._queue.enqueue(task);
      return;
    }
    this._pending = true;
    this._error = undefined;
    try {
      await task();
    } catch (error) {
      this._error = errorMessage(error, "Failed to update lights");
    } finally {
      this._pending = false;
    }
    const queued = this._queue.shift();
    if (queued) {
      await this._run(queued);
    }
  }

  private async _turnOff(entityIds: string[]): Promise<void> {
    await applyToggleTargets(
      this.hass,
      entityIds.filter(isValidEntityId).map((entity) => ({ entity, state: "off" as const })),
    );
  }

  private async _turnOnRow(row: "warm" | "white", state: LightsCardState): Promise<void> {
    const stage = state[row]?.stage ?? 1;
    const targets = resolveRowStageTargets(this._config, row, stage);
    const { onLights, rest } = splitStageTargets(targets);
    await applyLightLooks(this.hass, onLights, {
      on: true,
      brightness: stageToBrightness(stage, this._stageCount(row)),
    });
    await applyToggleTargets(this.hass, rest);
  }

  private async _applyMode(state: LightsCardState): Promise<void> {
    const rgb = this._rowIds("rgb");
    const warm = this._rowIds("warm");
    const white = this._rowIds("white");
    const off: string[] = [];
    if (!state.rgb?.on) {
      off.push(...rgb);
    }
    if (!state.warm?.on) {
      off.push(...warm);
    }
    if (!state.white?.on) {
      off.push(...white);
    }
    await this._turnOff([...new Set(off)]);
    if (state.rgb?.on) {
      await applyLightLooks(this.hass, rgb, {
        on: true,
        brightness: clamp(Number(state.rgb.brightness) || 1, 1, 255),
        rgb: hexToRgb(state.rgb.hex || DEFAULT_RGB_HEX),
      });
      return;
    }
    if (state.warm?.on) {
      await this._turnOnRow("warm", state);
      return;
    }
    if (state.white?.on) {
      await this._turnOnRow("white", state);
    }
  }

  private _commit(next: LightsCardState): void {
    void this._run(async () => {
      try {
        await this._writeState(next);
      } catch (error) {
        this._error = errorMessage(error, "Failed to update helper");
      }
      await this._applyMode(next);
    });
  }

  private _toggleRow(row: LightRowId): void {
    const current = this._current;
    this._commit(exclusiveLightsState(current, current[row]?.on ? undefined : row));
  }

  private _selectStage(row: "warm" | "white", stage: number): void {
    if (!Number.isFinite(stage)) {
      return;
    }
    this._commit(
      exclusiveLightsState(this._current, row, {
        stage: clamp(Math.round(stage), 1, this._stageCount(row)),
      }),
    );
  }

  private _setRgb(patch: Partial<LightsCardState["rgb"]>): void {
    this._commit(exclusiveLightsState(this._current, "rgb", patch));
  }

  private _rgbPercentValue(event: Event): number | undefined {
    if (!(event.target instanceof HTMLInputElement)) {
      return undefined;
    }
    return parseRgbPercent(event.target.value);
  }

  private _onBrightnessInput(ev: Event): void {
    const percent = this._rgbPercentValue(ev);
    if (percent === undefined) {
      return;
    }
    this._rgbDragPercent = percent;
  }

  private _onBrightness(ev: Event): void {
    const percent = this._rgbPercentValue(ev);
    if (percent === undefined) {
      return;
    }
    this._rgbDragPercent = undefined;
    this._setRgb({ on: true, brightness: percentToBrightness(percent) });
  }

  private _onPreset(hex: string): void {
    const color = normalizeHex(hex, DEFAULT_RGB_HEX);
    this._setRgb({ on: true, hex: color });
  }

  private _onCustomColor(ev: Event): void {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) || !target.value) {
      return;
    }
    this._onPreset(target.value);
  }

  private _entityActual(entityId: string): string {
    return entityStateLabel(this.hass?.states?.[entityId]?.state);
  }

  private _onChip(entityId: string, actual: string): void {
    if (!isValidEntityId(entityId) || (actual !== "on" && actual !== "off")) {
      return;
    }
    void this._run(async () => {
      if (!this.hass) {
        return;
      }
      await setEntityOnOff(this.hass, entityId, actual !== "on");
    });
  }

  private _renderChip(target: SwitchTarget) {
    const stateObj = this.hass?.states?.[target.entity];
    const actual = this._entityActual(target.entity);
    const name = entityDisplayName(this.hass, target.entity, target.name);
    const disabled = actual === "missing" || actual === "unavailable" || actual === "unknown";
    return html`
      <button
        class="switch-status ${actual}"
        style="--state-domain-active-color: var(--state-${domainOf(target.entity)}-active-color)"
        type="button"
        title=${`${name}: ${actual}`}
        aria-label=${`${name}: ${actual}`}
        ?disabled=${disabled}
        @click=${() => this._onChip(target.entity, actual)}
      >
        ${stateObj
          ? html`<ha-state-icon .hass=${this.hass} .stateObj=${stateObj} .icon=${target.icon}></ha-state-icon>`
          : html`<ha-icon .icon=${entityIcon(target)}></ha-icon>`}
      </button>
    `;
  }

  private _renderChips() {
    const rows = chunkEvenly(this._visibleEntities);
    if (!rows.length) {
      return nothing;
    }
    return html`
      <div class="switches">
        ${rows.map(
          (line) => html`<div class="switch-row">${line.map((item) => this._renderChip(item))}</div>`,
        )}
      </div>
    `;
  }

  private _renderStageDot(
    row: "warm" | "white",
    stage: number,
    current: number,
    on: boolean,
    label: string,
  ) {
    const meta = ROW_META[row];
    return html`
      <div class="slider-dot-slot" @click=${() => this._selectStage(row, stage)}>
        <button
          class="slider-dot ${stage < current
            ? "done"
            : stage === current
              ? "current"
              : "todo"}"
          type="button"
          aria-label="${meta.label} ${label}"
          aria-pressed=${on && stage === current}
        >
          <ha-icon .icon=${rowStageIcon(this._config, row, stage)}></ha-icon>
        </button>
        <span class="tick ${on && stage === current ? "active" : ""}">${label}</span>
      </div>
    `;
  }

  private _rowIsOn(row: LightRowId): boolean {
    return Boolean(this._current[row]?.on);
  }

  private _renderPower(row: LightRowId) {
    const meta = ROW_META[row];
    const on = this._rowIsOn(row);
    const icons = rowPowerIcons(this._config, row);
    return html`
      <button
        class="power-icon ${on ? "on" : "off"}"
        type="button"
        aria-label="${meta.label} power"
        aria-pressed=${on}
        @click=${() => this._toggleRow(row)}
      >
        <span class="icon">
          <ha-icon .icon=${on ? icons.on : icons.off}></ha-icon>
        </span>
        <span class="tick ${on ? "active" : ""}">${meta.label}</span>
      </button>
    `;
  }

  private _renderRgbControls(showcase = false, rowIndex = 1) {
    const rgb = this._current.rgb;
    const color = rgb?.hex || DEFAULT_RGB_HEX;
    const percent = displayRgbPercent(rgb?.brightness ?? 1, this._rgbDragPercent);
    const presets = resolveRgbPresets(this._config);
    const selectedPreset = presets.find(
      (preset) => normalizeHex(preset, "") === normalizeHex(color, ""),
    );
    return html`
      <div
        class="mode-controls rgb-controls ${lightsRowMuted(rgb?.on) ? "power-off" : ""}"
        style="--current-color: ${color}; grid-row: ${rowIndex}"
        aria-label="RGB brightness and color"
      >
        <input
          class="brightness"
          type="range"
          min="1"
          max="100"
          .value=${String(percent)}
          aria-label="RGB brightness"
          @input=${showcase ? undefined : this._onBrightnessInput}
          @change=${showcase ? undefined : this._onBrightness}
        />
        <span class="brightness-value" aria-hidden="true">${percent}%</span>
        <div class="presets">
          ${presets.map(
            (hex) => html`
              <button
                class="swatch ${selectedPreset === hex ? "selected" : ""}"
                type="button"
                style="background: ${hex}"
                aria-label="RGB color ${hex}"
                aria-pressed=${selectedPreset === hex}
                @click=${() => this._onPreset(hex)}
              ></button>
            `,
          )}
        </div>
        <label class="picker-wrap ${selectedPreset ? "" : "selected"}" title="Custom color">
          <button class="picker-button" type="button" tabindex="-1" aria-hidden="true"></button>
          <input
            type="color"
            .value=${color}
            aria-label="Custom RGB color"
            ?disabled=${showcase}
            @input=${showcase ? undefined : this._onCustomColor}
          />
        </label>
      </div>
    `;
  }

  private _renderStageControls(row: "warm" | "white", rowIndex = 1) {
    const meta = ROW_META[row];
    const count = this._stageCount(row);
    const names = intensityNames(count);
    const rowState = this._current[row];
    const current = clamp(Math.round(rowState?.stage ?? 1), 1, count);
    const fill = rowFillPercent(
      Array.from({ length: count }, (_, index) => index + 1),
      current,
    );
    return html`
      <div
        class="mode-controls stage-controls ${lightsRowMuted(rowState?.on) ? "power-off" : ""}"
        style="--slider-progress: ${fill}%; --stage-count: ${count}; grid-row: ${rowIndex}"
        aria-label="${meta.label} intensity"
      >
        <div class="stage-track">
          <div class="slider-visual" aria-hidden="true">
            <div class="slider-line"></div>
            <div class="slider-fill"></div>
          </div>
          ${names.map((label, index) =>
            this._renderStageDot(row, index + 1, current, Boolean(rowState?.on), label),
          )}
        </div>
      </div>
    `;
  }

  private _renderModeGroup(showcase = false) {
    const rows = showcase ? ROW_ORDER : this._rows;
    return html`
      <div class="mode-group" style="--mode-rows: ${rows.length}">
        <div class="power-bar">
          ${rows.map((row) => this._renderPower(row))}
        </div>
        ${rows.map((row, index) =>
          row === "rgb"
            ? this._renderRgbControls(showcase, index + 1)
            : this._renderStageControls(row, index + 1),
        )}
        ${rows.slice(0, -1).map(
          (_row, index) => html`
            <div class="mode-rule" style="grid-row: ${index + 1}" aria-hidden="true"></div>
          `,
        )}
      </div>
    `;
  }

  private _renderShowcase() {
    return html`
      <ha-card class="showcase">
        <div class="slider-section">
          ${this._renderModeGroup(true)}
        </div>
      </ha-card>
    `;
  }

  protected render() {
    if (!this._config) {
      return html`<ha-card><div class="warning">Invalid configuration</div></ha-card>`;
    }
    if (isEmptyLightsConfig(this._config)) {
      return this._renderShowcase();
    }
    if (!this.hass) {
      return html`<ha-card><div class="warning">Waiting for Home Assistant</div></ha-card>`;
    }
    if (this._config.entity && !isValidEntityId(this._config.entity)) {
      return html`<ha-card><div class="warning">Invalid helper: ${this._config.entity}</div></ha-card>`;
    }

    return html`
      <ha-card>
        ${this._error ? html`<div class="warning">${this._error}</div>` : nothing}
        ${this._config.entity && !this._helper
          ? html`<div class="notice">
              Helper not found: ${this._config.entity}. This browser will still
              remember the last colors and stages.
            </div>`
          : nothing}
        <div class="slider-section">
          ${this._renderModeGroup()}
          ${this._renderChips()}
        </div>
      </ha-card>
    `;
  }

  static styles = cardStyles;
}

registerLovelaceCard({
  type: CARD_NAME,
  name: CARD_TITLE,
  description:
    "Room lights as exclusive rows: RGB brightness and color presets, plus Warm and White stages (Min to Max) when each has at least two lights. One text helper stores the whole card.",
  preview: true,
  documentationURL: DOCUMENTATION_URL,
});

declare global {
  interface HTMLElementTagNameMap {
    "staged-lights-card": StagedLightsCard;
  }
}

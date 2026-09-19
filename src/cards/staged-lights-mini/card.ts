import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  clamp,
  DOCUMENTATION_URL,
  errorMessage,
  isValidEntityId,
  registerLovelaceCard,
  relevantHassChanged,
  rowFillPercent,
  SerialActionQueue,
  setInputText,
} from "../../shared";
import type { HomeAssistant, LovelaceCard } from "../../shared/types";
import { normalizeHex } from "../staged-lights/color";
import { DEFAULT_RGB_HEX } from "../staged-lights/const";
import { applyLightsMode } from "../staged-lights/apply";
import { lightsRowMuted, resolveRgbPresets, rowPowerIcons, rowStageIcon } from "../staged-lights/look";
import { lightsStorageKey, resolveLightsState, writeStoredLightsState } from "../staged-lights/persist";
import {
  isEmptyLightsConfig,
  isLightsCardConfig,
  relevantLightEntityIds,
} from "../staged-lights/roster";
import {
  displayRgbPercent,
  intensityNames,
  lightsStageCount,
  parseRgbPercent,
  percentToBrightness,
} from "../staged-lights/stages";
import { exclusiveLightsState, serializeLightsState } from "../staged-lights/state";
import type { LightRowId, LightsCardState, StagedLightsCardConfig } from "../staged-lights/types";
import { CARD_NAME, CARD_TITLE } from "./const";
import "./editor";
import {
  MINI_LAYOUT_ROWS,
  miniControlRow,
  miniModeMeta,
  miniModeOn,
  miniModes,
  miniShowcaseModes,
  miniToggleTarget,
} from "./layout";
import { cardStyles } from "./styles";

@customElement(CARD_NAME)
export class StagedLightsMiniCard extends LitElement implements LovelaceCard {
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
    };
  }

  public setConfig(config: StagedLightsCardConfig): void {
    if (!isLightsCardConfig(config)) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config, show_switches: false };
    this._state = undefined;
    this._rgbDragPercent = undefined;
    this._queue.clear();
    this._error = undefined;
  }

  public getCardSize(): number {
    return MINI_LAYOUT_ROWS;
  }

  public getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      max_columns: 12,
      min_rows: MINI_LAYOUT_ROWS,
    };
  }

  private get _storageKey() {
    return lightsStorageKey(this._config, CARD_NAME);
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

  private get _modes(): LightRowId[] {
    return miniModes(this._config);
  }

  private get _controlRow(): LightRowId | undefined {
    return miniControlRow(this._current, this._config);
  }

  private _stageCount(row: "warm" | "white") {
    return lightsStageCount(this._config, row);
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

  private _commit(next: LightsCardState): void {
    void this._run(async () => {
      try {
        await this._writeState(next);
      } catch (error) {
        this._error = errorMessage(error, "Failed to update helper");
      }
      await applyLightsMode(this.hass, this._config, next);
    });
  }

  private _selectMode(mode: LightRowId): void {
    if (!this._modes.includes(mode)) {
      return;
    }
    this._commit(
      exclusiveLightsState(this._current, miniToggleTarget(mode, this._current, this._config)),
    );
  }

  private _selectStage(row: "warm" | "white", stage: number): void {
    if (!Number.isFinite(stage) || !this._modes.includes(row)) {
      return;
    }
    this._commit(
      exclusiveLightsState(this._current, row, {
        stage: clamp(Math.round(stage), 1, this._stageCount(row)),
      }),
    );
  }

  private _setRgb(patch: Partial<LightsCardState["rgb"]>): void {
    if (!this._modes.includes("rgb")) {
      return;
    }
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
    this._setRgb({ on: true, hex: normalizeHex(hex, DEFAULT_RGB_HEX) });
  }

  private _onCustomColor(ev: Event): void {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) || !target.value) {
      return;
    }
    this._onPreset(target.value);
  }

  private _renderModeButton(mode: LightRowId, showcase = false) {
    const on = miniModeOn(mode, this._current, this._config);
    const meta = miniModeMeta(mode);
    const state = on ? "On" : "Off";
    const icons = rowPowerIcons(this._config, mode);
    return html`
      <button
        class="power-icon ${on ? "on" : "off"}"
        type="button"
        aria-label="${meta.label} ${state}"
        aria-pressed=${on}
        @click=${showcase ? undefined : () => this._selectMode(mode)}
      >
        <span class="icon">
          <ha-icon .icon=${on ? icons.on : icons.off}></ha-icon>
        </span>
        <span class="copy">
          <span class="tick ${on ? "active" : ""}">${meta.label}</span>
          <span class="state">${state}</span>
        </span>
      </button>
    `;
  }

  private _renderStageDot(
    row: "warm" | "white",
    stage: number,
    current: number,
    on: boolean,
    label: string,
    showcase: boolean,
  ) {
    const meta = miniModeMeta(row);
    return html`
      <div
        class="slider-dot-slot"
        @click=${showcase ? undefined : () => this._selectStage(row, stage)}
      >
        <button
          class="slider-dot ${stage < current ? "done" : stage === current ? "current" : "todo"}"
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

  private _renderRgbControls(showcase: boolean, muted: boolean) {
    const rgb = this._current.rgb;
    const color = rgb?.hex || DEFAULT_RGB_HEX;
    const percent = displayRgbPercent(rgb?.brightness ?? 1, this._rgbDragPercent);
    const presets = resolveRgbPresets(this._config);
    const selectedPreset = presets.find(
      (preset) => normalizeHex(preset, "") === normalizeHex(color, ""),
    );
    return html`
      <div
        class="mode-controls rgb-controls ${muted ? "power-off" : ""}"
        style="--current-color: ${color}"
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
                @click=${showcase ? undefined : () => this._onPreset(hex)}
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

  private _renderStageControls(row: "warm" | "white", showcase: boolean, muted: boolean) {
    const meta = miniModeMeta(row);
    const count = this._stageCount(row);
    const names = intensityNames(count);
    const rowState = this._current[row];
    const current = clamp(Math.round(Number(rowState?.stage) || 1), 1, count);
    const fill = rowFillPercent(
      Array.from({ length: count }, (_, index) => index + 1),
      current,
    );
    return html`
      <div
        class="mode-controls stage-controls ${muted ? "power-off" : ""}"
        style="--slider-progress: ${fill}%; --stage-count: ${count}"
        aria-label="${meta.label} intensity"
      >
        <div class="stage-track">
          <div class="slider-visual" aria-hidden="true">
            <div class="slider-line"></div>
            <div class="slider-fill"></div>
          </div>
          ${names.map((label, index) =>
            this._renderStageDot(
              row,
              index + 1,
              current,
              Boolean(rowState?.on),
              label,
              showcase,
            ),
          )}
        </div>
      </div>
    `;
  }

  private _renderControls(showcase = false) {
    const row = showcase ? "rgb" : this._controlRow;
    if (!row) {
      return nothing;
    }
    const muted = showcase ? false : lightsRowMuted(this._current[row]?.on);
    if (row === "rgb") {
      return this._renderRgbControls(showcase, muted);
    }
    return this._renderStageControls(row, showcase, muted);
  }

  private _renderCard(showcase = false) {
    const modes = showcase ? miniShowcaseModes() : this._modes;
    return html`
      <div class="slider-section">
        <div class="mode-bar" role="group" aria-label="Light mode" style="--mode-count: ${modes.length}">
          ${modes.map((mode) => this._renderModeButton(mode, showcase))}
        </div>
        <div class="control-row">${this._renderControls(showcase)}</div>
      </div>
    `;
  }

  protected render() {
    if (!this._config) {
      return html`<ha-card><div class="warning">Invalid configuration</div></ha-card>`;
    }
    if (isEmptyLightsConfig(this._config)) {
      return html`<ha-card class="showcase">${this._renderCard(true)}</ha-card>`;
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
        ${this._renderCard()}
      </ha-card>
    `;
  }

  static styles = cardStyles;
}

registerLovelaceCard({
  type: CARD_NAME,
  name: CARD_TITLE,
  description:
    "A compact lights card: RGB, Warm, and White on one row, with stages or color presets on the second.",
  preview: true,
  documentationURL: DOCUMENTATION_URL,
});

declare global {
  interface HTMLElementTagNameMap {
    "staged-lights-mini-card": StagedLightsMiniCard;
  }
}

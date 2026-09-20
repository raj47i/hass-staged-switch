import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  chunkEvenly,
  clamp,
  DOCUMENTATION_URL,
  domainOf,
  entityDisplayName,
  entityIcon,
  entityStateLabel,
  errorMessage,
  friendlyActionError,
  isValidEntityId,
  registerCardAliases,
  registerLovelaceCard,
  relevantHassChanged,
  rowFillPercent,
  SerialActionQueue,
  setEntityOnOff,
  setInputText,
} from "../../shared";
import type { HomeAssistant, LovelaceCard, SwitchTarget } from "../../shared/types";
import {
  adjustKindForIds,
  DEFAULT_KELVIN,
  kelvinRangeForIds,
  kelvinToHex,
  renderAdjustControls,
} from "./adjust";
import { hueToHex, normalizeHex } from "./color";
import { rowEntityIds } from "./apply";
import { lightsRowMuted, resolveRgbPresets, rowPowerIcons, rowStageIcon } from "./look";
import {
  CARD_LEGACY_NAME,
  CARD_NAME,
  CARD_TITLE,
  DEFAULT_RGB_HEX,
  ROW_META,
  ROW_ORDER,
} from "./const";
import "./editor";
import {
  isRgbLiveTweak,
  hydrateStudioCard,
  mergeLightsStudioConfig,
  peekStudioScenes,
  resolveStudioLightsState,
  studioLooksMatch,
} from "../../studio/bind";
import { showsEntityButtons } from "../../shared/entity-buttons";
import { applyLightsMode } from "./apply";
import { lightsStorageKey, writeStoredLightsState } from "./persist";
import {
  isEmptyLightsConfig,
  isLightsCardConfig,
  relevantLightEntityIds,
  visibleLights,
} from "./roster";
import {
  configuredRows,
  configuredStageNames,
  displayRgbPercent,
  lightsLayoutRows,
  lightsStageCount,
  parseRgbPercent,
  percentToBrightness,
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
  @state() private _studioTick = 0;
  private _queue = new SerialActionQueue<() => Promise<void>>();
  private _studioSlug?: string;
  private _studioCacheVersion = 0;

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
    if (!isLightsCardConfig(config)) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
    this._state = undefined;
    this._rgbDragPercent = undefined;
    this._studioSlug = undefined;
    this._studioCacheVersion = 0;
    this._pending = false;
    this._queue.clear();
    this._error = undefined;
  }

  public getCardSize(): number {
    return lightsLayoutRows(this._resolved);
  }

  public getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      max_columns: 12,
      min_rows: lightsLayoutRows(this._resolved),
    };
  }

  private get _resolved(): StagedLightsCardConfig | undefined {
    if (!this._config) {
      return undefined;
    }
    return mergeLightsStudioConfig(this._config, peekStudioScenes(this.hass));
  }

  private get _storageKey() {
    return lightsStorageKey(this._resolved);
  }

  private get _helper() {
    const entityId = this._resolved?.entity;
    if (!entityId || !this.hass?.states) {
      return undefined;
    }
    return this.hass.states[entityId];
  }

  private get _current(): LightsCardState {
    if (this._state) {
      return this._state;
    }
    return resolveStudioLightsState(
      this.hass,
      this._resolved,
      this._helper?.state,
      this._storageKey,
    );
  }

  private _stageCount(row: "warm" | "white") {
    return lightsStageCount(this._resolved, row);
  }

  private get _rows(): LightRowId[] {
    return configuredRows(this._resolved);
  }

  private get _visibleEntities() {
    if (!showsEntityButtons(this._resolved)) {
      return [];
    }
    return visibleLights(this._resolved);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (
      changed.has("_config") ||
      changed.has("_state") ||
      changed.has("_pending") ||
      changed.has("_error") ||
      changed.has("_rgbDragPercent") ||
      changed.has("_studioTick")
    ) {
      return true;
    }
    if (changed.has("hass")) {
      return relevantHassChanged(
        changed.get("hass") as HomeAssistant | undefined,
        this.hass,
        relevantLightEntityIds(this._resolved),
      );
    }
    return true;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadStudio();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("hass") || changed.has("_config")) {
      void this._loadStudio();
    }
    if (!changed.has("hass") || !this._state || this._pending) {
      return;
    }
    if (this._resolved?.studio) {
      if (
        studioLooksMatch(
          this._state,
          resolveStudioLightsState(
            this.hass,
            this._resolved,
            this._helper?.state,
            this._storageKey,
          ),
        )
      ) {
        this._state = undefined;
      }
      return;
    }
    if (this._helper && this._helper.state === serializeLightsState(this._state)) {
      this._state = undefined;
    }
  }

  private async _loadStudio(): Promise<void> {
    const next = await hydrateStudioCard(this.hass, this._config?.studio, {
      slug: this._studioSlug,
      version: this._studioCacheVersion,
    });
    if (!next?.changed) {
      return;
    }
    this._studioSlug = next.slug;
    this._studioCacheVersion = next.version;
    this._studioTick += 1;
  }

  private async _writeState(next: LightsCardState): Promise<void> {
    this._state = next;
    writeStoredLightsState(this._storageKey, next);
    const helperId = this._resolved?.entity;
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
      this._error = friendlyActionError(error, "Failed to update lights");
    } finally {
      this._pending = false;
    }
    const queued = this._queue.shift();
    if (queued) {
      await this._run(queued);
    }
  }

  private _commit(next: LightsCardState): void {
    const previous = this._current;
    void this._run(async () => {
      try {
        await this._writeState(next);
      } catch (error) {
        this._error = errorMessage(error, "Failed to update helper");
      }
      await applyLightsMode(this.hass, this._resolved, next, {
        liveRgb: Boolean(this._resolved?.studio && isRgbLiveTweak(previous, next)),
      });
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
          @click=${(ev: Event) => {
            ev.stopPropagation();
            this._selectStage(row, stage);
          }}
        >
          <ha-icon .icon=${rowStageIcon(this._resolved, row, stage)}></ha-icon>
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
    const icons = rowPowerIcons(this._resolved, row);
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
    const ids = rowEntityIds(this._resolved, "rgb");
    const kelvinRange = kelvinRangeForIds(this.hass, ids);
    return html`
      <div style="grid-row: ${rowIndex}">
        ${renderAdjustControls({
          kind: showcase ? "rgb" : adjustKindForIds(this.hass, ids),
          label: "RGB",
          muted: lightsRowMuted(rgb?.on),
          percent: displayRgbPercent(rgb?.brightness ?? 1, this._rgbDragPercent),
          hex: rgb?.hex || DEFAULT_RGB_HEX,
          kelvin: rgb?.kelvin ?? DEFAULT_KELVIN,
          minKelvin: kelvinRange.min,
          maxKelvin: kelvinRange.max,
          presets: resolveRgbPresets(this._resolved),
          showcase,
          onBrightnessInput: (ev) => this._onBrightnessInput(ev),
          onBrightness: (ev) => this._onBrightness(ev),
          onHue: (hue) => this._setRgb({ on: true, hex: hueToHex(hue) }),
          onKelvin: (kelvin) =>
            this._setRgb({ on: true, kelvin, hex: kelvinToHex(kelvin) }),
          onPreset: (hex) => this._onPreset(hex),
          onCustomColor: (ev) => this._onCustomColor(ev),
        })}
      </div>
    `;
  }

  private _renderStageControls(row: "warm" | "white", rowIndex = 1) {
    const meta = ROW_META[row];
    const count = this._stageCount(row);
    const names = configuredStageNames(this._resolved, row);
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
    if (isEmptyLightsConfig(this._resolved)) {
      return this._renderShowcase();
    }
    if (!this.hass) {
      return html`<ha-card><div class="warning">Waiting for Home Assistant</div></ha-card>`;
    }
    if (this._resolved?.entity && !isValidEntityId(this._resolved.entity)) {
      return html`<ha-card><div class="warning">Invalid helper: ${this._resolved.entity}</div></ha-card>`;
    }

    return html`
      <ha-card>
        ${this._error ? html`<div class="warning" role="alert">${this._error}</div>` : nothing}
        ${this._resolved?.entity && !this._helper
          ? html`<div class="notice">
              Helper not found: ${this._resolved.entity}. This browser will still
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
    "Full RGB, Warm, and White rows. Bind a scene-set or configure by hand.",
  preview: true,
  documentationURL: DOCUMENTATION_URL,
});
registerCardAliases(CARD_NAME, [CARD_LEGACY_NAME]);

declare global {
  interface HTMLElementTagNameMap {
    [CARD_NAME]: StagedLightsCard;
    [CARD_LEGACY_NAME]: StagedLightsCard;
  }
}

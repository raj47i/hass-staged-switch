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
  safeIcon,
  errorMessage,
  friendlyActionError,
  isValidEntityId,
  registerCardAliases,
  registerLovelaceCard,
  relevantHassChanged,
  rowFillPercent,
  SerialActionQueue,
  setEntityOnOff,
  titleAlignStyle,
  setInputText,
} from "../../shared";
import type { HomeAssistant, LovelaceCard, SwitchTarget } from "../../shared/types";
import { normalizeHex } from "../staged-lights/color";
import { hueToHex } from "../staged-lights/color";
import {
  adjustKindForIds,
  DEFAULT_KELVIN,
  kelvinRangeForIds,
  kelvinToHex,
  renderAdjustControls,
} from "../staged-lights/adjust";
import { DEFAULT_RGB_BRIGHTNESS, DEFAULT_RGB_HEX } from "../staged-lights/const";
import { rowEntityIds } from "../staged-lights/apply";
import {
  isRgbLiveTweak,
  hydrateStudioCard,
  mergeLightsStudioConfig,
  peekStudioScenes,
  resolveStudioLightsState,
  studioLooksMatch,
} from "../../studio/bind";
import { applyLightsMode } from "../staged-lights/apply";
import { lightsRowMuted, resolveRgbPresets, rowPowerIcons, rowStageIcon } from "../staged-lights/look";
import { lightsStorageKey, writeStoredLightsState } from "../staged-lights/persist";
import {
  isEmptyLightsConfig,
  isLightsCardConfig,
  relevantLightEntityIds,
  visibleLights,
} from "../staged-lights/roster";
import { showsEntityButtons } from "../../shared/entity-buttons";
import {
  configuredStageNames,
  displayRgbPercent,
  lightsStageCount,
  parseRgbPercent,
  percentToBrightness,
} from "../staged-lights/stages";
import { exclusiveGroupState, exclusiveLightsState, serializeLightsState } from "../staged-lights/state";
import { DEFAULT_STAGE_ICON } from "../staged-lights/const";
import {
  hasLightsGroups,
  isLightsRgbGroup,
  lightsGroupStageCount,
  lightsGroupStageNames,
} from "../staged-lights/groups";
import type {
  LightRowId,
  LightsCardState,
  LightsGroupMode,
  StagedLightsCardConfig,
} from "../staged-lights/types";
import { CARD_LEGACY_NAME, CARD_NAME, CARD_TITLE } from "./const";
import "./editor";
import {
  miniControlGroup,
  miniControlRow,
  miniGroupOn,
  miniGroupRows,
  miniGroupToggleTarget,
  miniLayoutRows,
  miniModeMeta,
  miniModeOn,
  miniModes,
  miniShowcaseModes,
  miniShowsGroupControls,
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
    return miniLayoutRows(this._resolved);
  }

  public getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      max_columns: 12,
      min_rows: miniLayoutRows(this._resolved),
    };
  }

  private get _visibleEntities() {
    if (!showsEntityButtons(this._resolved)) {
      return [];
    }
    return visibleLights(this._resolved);
  }

  private get _resolved(): StagedLightsCardConfig | undefined {
    if (!this._config) {
      return undefined;
    }
    return mergeLightsStudioConfig(this._config, peekStudioScenes(this.hass));
  }

  private get _storageKey() {
    return lightsStorageKey(this._resolved, CARD_NAME);
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

  private get _modes(): LightRowId[] {
    return miniModes(this._resolved);
  }

  private get _usesGroups(): boolean {
    return hasLightsGroups(this._resolved);
  }

  private get _controlRow(): LightRowId | undefined {
    return miniControlRow(this._current, this._resolved);
  }

  private _stageCount(row: "warm" | "white") {
    return lightsStageCount(this._resolved, row);
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

  private _selectMode(mode: LightRowId): void {
    if (!this._modes.includes(mode)) {
      return;
    }
    this._commit(
      exclusiveLightsState(this._current, miniToggleTarget(mode, this._current, this._resolved)),
    );
  }

  private _selectGroup(mode: LightsGroupMode): void {
    if (!this._usesGroups) {
      return;
    }
    const target = miniGroupToggleTarget(mode, this._current);
    this._commit(
      exclusiveGroupState(
        this._current,
        target,
        miniGroupOn(mode, this._current) ? this._current.group?.stage : 1,
        isLightsRgbGroup(mode)
          ? {
              hex: this._current.group?.id === mode.id
                ? this._current.group?.hex ?? mode.hex ?? DEFAULT_RGB_HEX
                : mode.hex ?? DEFAULT_RGB_HEX,
              brightness:
                this._current.group?.id === mode.id
                  ? this._current.group?.brightness ?? DEFAULT_RGB_BRIGHTNESS
                  : DEFAULT_RGB_BRIGHTNESS,
            }
          : undefined,
      ),
    );
  }

  private _setGroupRgb(
    mode: LightsGroupMode,
    patch: { hex?: string; brightness?: number; kelvin?: number },
  ): void {
    if (!this._usesGroups || !isLightsRgbGroup(mode)) {
      return;
    }
    this._commit(
      exclusiveGroupState(this._current, mode.id, 1, {
        hex: patch.hex ?? this._current.group?.hex ?? mode.hex ?? DEFAULT_RGB_HEX,
        brightness:
          patch.brightness ??
          this._current.group?.brightness ??
          DEFAULT_RGB_BRIGHTNESS,
        kelvin: patch.kelvin ?? this._current.group?.kelvin,
      }),
    );
  }

  private _selectGroupStage(mode: LightsGroupMode, stage: number): void {
    if (!this._usesGroups) {
      return;
    }
    const count = lightsGroupStageCount(mode);
    if (!count) {
      return;
    }
    this._commit(
      exclusiveGroupState(this._current, mode.id, clamp(Math.round(stage), 1, count)),
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

  private _renderGroupButton(mode: LightsGroupMode, showcase = false) {
    const on = miniGroupOn(mode, this._current);
    const names = lightsGroupStageNames(mode);
    const stage = clamp(
      Math.round(Number(this._current.group?.stage) || 1),
      1,
      Math.max(1, names.length),
    );
    const state = on ? (names[stage - 1] || "On") : "Off";
    const icon = safeIcon(
      mode.icon,
      mode.kind === "rgb" || mode.kind === "look" ? "mdi:palette" : "mdi:lightbulb-group",
    );
    return html`
      <button
        class="power-icon ${on ? "on" : "off"}"
        type="button"
        aria-label="${mode.name} ${state}"
        aria-pressed=${on}
        @click=${showcase ? undefined : () => this._selectGroup(mode)}
      >
        <span class="icon">
          <ha-icon .icon=${icon}></ha-icon>
        </span>
        <span class="copy">
          <span class="tick ${on ? "active" : ""}">${mode.name}</span>
          <span class="state">${state}</span>
        </span>
      </button>
    `;
  }

  private _renderGroupStageDot(
    mode: LightsGroupMode,
    stage: number,
    current: number,
    on: boolean,
    label: string,
    showcase: boolean,
  ) {
    return html`
      <div
        class="slider-dot-slot"
        @click=${showcase ? undefined : () => this._selectGroupStage(mode, stage)}
      >
        <button
          class="slider-dot ${stage < current ? "done" : stage === current ? "current" : "todo"}"
          type="button"
          aria-label="${mode.name} ${label}"
          aria-pressed=${on && stage === current}
          @click=${showcase
            ? undefined
            : (ev: Event) => {
                ev.stopPropagation();
                this._selectGroupStage(mode, stage);
              }}
        >
          <ha-icon .icon=${DEFAULT_STAGE_ICON}></ha-icon>
        </button>
        <span class="tick ${on && stage === current ? "active" : ""}">${label}</span>
      </div>
    `;
  }

  private _renderGroupRgbControls(mode: LightsGroupMode, showcase: boolean, muted: boolean) {
    const ids = mode.entities ?? [];
    const kelvinRange = kelvinRangeForIds(this.hass, ids);
    return renderAdjustControls({
      kind: adjustKindForIds(this.hass, ids),
      label: mode.name,
      muted,
      percent: displayRgbPercent(
        this._current.group?.brightness ?? DEFAULT_RGB_BRIGHTNESS,
        this._rgbDragPercent,
      ),
      hex: this._current.group?.hex || mode.hex || DEFAULT_RGB_HEX,
      kelvin: this._current.group?.kelvin ?? DEFAULT_KELVIN,
      minKelvin: kelvinRange.min,
      maxKelvin: kelvinRange.max,
      presets: resolveRgbPresets(this._resolved),
      showcase,
      onBrightnessInput: (ev) => this._onBrightnessInput(ev),
      onBrightness: (ev) => {
        const value = this._rgbPercentValue(ev);
        if (value === undefined) {
          return;
        }
        this._rgbDragPercent = undefined;
        this._setGroupRgb(mode, { brightness: percentToBrightness(value) });
      },
      onHue: (hue) => this._setGroupRgb(mode, { hex: hueToHex(hue) }),
      onKelvin: (kelvin) =>
        this._setGroupRgb(mode, { kelvin, hex: kelvinToHex(kelvin) }),
      onPreset: (hex) =>
        this._setGroupRgb(mode, { hex: normalizeHex(hex, DEFAULT_RGB_HEX) }),
      onCustomColor: (ev) => {
        const target = ev.target;
        if (!(target instanceof HTMLInputElement) || !target.value) {
          return;
        }
        this._setGroupRgb(mode, { hex: normalizeHex(target.value, DEFAULT_RGB_HEX) });
      },
    });
  }

  private _renderGroupControls(showcase: boolean) {
    const mode = miniControlGroup(this._current, this._resolved);
    if (!mode || !miniShowsGroupControls(this._current, this._resolved)) {
      return nothing;
    }
    if (isLightsRgbGroup(mode)) {
      return this._renderGroupRgbControls(
        mode,
        showcase,
        !miniGroupOn(mode, this._current),
      );
    }
    const names = lightsGroupStageNames(mode);
    const count = names.length;
    const on = miniGroupOn(mode, this._current);
    const current = clamp(Math.round(Number(this._current.group?.stage) || 1), 1, count);
    const fill = rowFillPercent(
      Array.from({ length: count }, (_, index) => index + 1),
      current,
    );
    return html`
      <div
        class="mode-controls stage-controls ${on ? "" : "power-off"}"
        style="--slider-progress: ${fill}%; --stage-count: ${count}"
        aria-label="${mode.name} intensity"
      >
        <div class="stage-track">
          <div class="slider-visual" aria-hidden="true">
            <div class="slider-line"></div>
            <div class="slider-fill"></div>
          </div>
          ${names.map((label, index) =>
            this._renderGroupStageDot(
              mode,
              index + 1,
              current,
              on,
              label,
              showcase,
            ),
          )}
        </div>
      </div>
    `;
  }

  private _renderModeButton(mode: LightRowId, showcase = false) {
    const on = miniModeOn(mode, this._current, this._resolved);
    const meta = miniModeMeta(mode);
    const state = on ? "On" : "Off";
    const icons = rowPowerIcons(this._resolved, mode);
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
          @click=${showcase
            ? undefined
            : (ev: Event) => {
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

  private _renderRgbControls(showcase: boolean, muted: boolean) {
    const rgb = this._current.rgb;
    const ids = rowEntityIds(this._resolved, "rgb");
    const kelvinRange = kelvinRangeForIds(this.hass, ids);
    return renderAdjustControls({
      kind: showcase ? "rgb" : adjustKindForIds(this.hass, ids),
      label: "RGB",
      muted,
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
    });
  }

  private _renderStageControls(row: "warm" | "white", showcase: boolean, muted: boolean) {
    const meta = miniModeMeta(row);
    const count = this._stageCount(row);
    const names = configuredStageNames(this._resolved, row);
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

  private _renderGroupCard() {
    const rows = miniGroupRows(this._resolved);
    return html`
      <div class="slider-section">
        <div class="mode-stack">
          ${rows.map(
            (row) => html`
              <div
                class="mode-bar"
                role="group"
                aria-label="Light groups"
                style="--mode-count: ${row.length}"
              >
                ${row.map((mode) => this._renderGroupButton(mode))}
              </div>
            `,
          )}
        </div>
        ${miniShowsGroupControls(this._current, this._resolved)
          ? html`<div class="control-row">${this._renderGroupControls(false)}</div>`
          : nothing}
        ${this._renderChips()}
      </div>
    `;
  }

  private _renderCard(showcase = false) {
    if (!showcase && this._usesGroups) {
      return this._renderGroupCard();
    }
    const modes = showcase ? miniShowcaseModes() : this._modes;
    return html`
      <div class="slider-section">
        <div class="mode-bar" role="group" aria-label="Light mode" style="--mode-count: ${modes.length}">
          ${modes.map((mode) => this._renderModeButton(mode, showcase))}
        </div>
        <div class="control-row">${this._renderControls(showcase)}</div>
        ${showcase ? nothing : this._renderChips()}
      </div>
    `;
  }

  protected render() {
    if (!this._config) {
      return html`<ha-card><div class="warning">Invalid configuration</div></ha-card>`;
    }
    if (isEmptyLightsConfig(this._resolved)) {
      return html`<ha-card class="showcase">${this._renderCard(true)}</ha-card>`;
    }
    if (!this.hass) {
      return html`<ha-card><div class="warning">Waiting for Home Assistant</div></ha-card>`;
    }
    if (this._resolved?.entity && !isValidEntityId(this._resolved.entity)) {
      return html`<ha-card><div class="warning">Invalid helper: ${this._resolved.entity}</div></ha-card>`;
    }

    const title = this._resolved?.title?.trim();
    return html`
      ${title
        ? html`<h2 class="title" style=${titleAlignStyle(this._resolved?.title_align)}>${title}</h2>`
        : nothing}
      <ha-card>
        ${this._error ? html`<div class="warning" role="alert">${this._error}</div>` : nothing}
        ${this._resolved?.entity && !this._helper
          ? html`<div class="notice">
              Helper not found: ${this._resolved.entity}. This browser will still
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
    "Compact RGB, Warm, and White. Bind a scene-set or configure by hand.",
  preview: true,
  documentationURL: DOCUMENTATION_URL,
});
registerCardAliases(CARD_NAME, [CARD_LEGACY_NAME]);

declare global {
  interface HTMLElementTagNameMap {
    [CARD_NAME]: StagedLightsMiniCard;
    [CARD_LEGACY_NAME]: StagedLightsMiniCard;
  }
}

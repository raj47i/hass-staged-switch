import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { CARD_NAME, CARD_TITLE, CARD_VERSION, DEFAULT_TITLE } from "./const";
import "./editor";
import { cardStyles } from "./styles";
import type {
  HomeAssistant,
  LovelaceCard,
  ResolvedStage,
  StagedSwitchCardConfig,
  SwitchTarget,
} from "./types";
import {
  allOffTargets,
  cardStorageKey,
  clamp,
  domainOf,
  entityIcon,
  entityStateLabel,
  isValidEntityId,
  matchingStageIndex,
  parseStageIndex,
  partitionTargets,
  readStoredPower,
  readStoredStage,
  relevantEntityIds,
  relevantHassChanged,
  resolveStages,
  uniqueEntities,
  writeStoredPower,
  writeStoredStage,
} from "./utils";

@customElement(CARD_NAME)
export class StagedSwitchCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StagedSwitchCardConfig;
  @state() private _localValue?: number;
  @state() private _localPower?: boolean;
  @state() private _localEntities: Record<string, "on" | "off"> = {};
  @state() private _pending = false;
  @state() private _error?: string;
  private _cachedStages: ResolvedStage[] = [];
  private _queue: Array<
    | { kind: "stage"; index: number }
    | { kind: "power"; on: boolean }
    | { kind: "entity"; entity: string; on: boolean }
  > = [];

  public static async getConfigElement() {
    return document.createElement(`${CARD_NAME}-editor`);
  }

  public static getStubConfig(): StagedSwitchCardConfig {
    return {
      type: `custom:${CARD_NAME}`,
      title: DEFAULT_TITLE,
      switches: [],
      direct_control: true,
      show_switches: true,
      show_stage_labels: true,
    };
  }

  public setConfig(config: StagedSwitchCardConfig): void {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
    this._localValue = undefined;
    this._localPower = undefined;
    this._localEntities = {};
    this._queue = [];
    this._cachedStages = [];
    this._error = undefined;
  }

  public getCardSize(): number {
    const switches = this._config
      ? uniqueEntities(resolveStages(this._config, this._sliderEntity))
      : [];
    const iconRow =
      this._config?.show_switches === false || !switches.length ? 0 : 1;
    return 2 + iconRow;
  }

  public getGridOptions() {
    const switches = this._config
      ? uniqueEntities(resolveStages(this._config, this._sliderEntity))
      : [];
    const iconRow =
      this._config?.show_switches === false || !switches.length ? 0 : 1;
    return {
      columns: 12,
      min_rows: 2 + iconRow,
    };
  }

  private get _sliderEntity() {
    const entityId = this._config?.entity;
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  private get _powerEntity() {
    const entityId = this._config?.power_entity;
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  private get _storageKey() {
    return cardStorageKey(this._config);
  }

  private get _sliderMin(): number {
    const min = Number(this._sliderEntity?.attributes.min);
    return Number.isFinite(min) ? min : 0;
  }

  private get _stages(): ResolvedStage[] {
    return this._cachedStages;
  }

  private get _maxIndex(): number {
    return Math.max(this._stages.length - 1, 0);
  }

  private get _currentIndex(): number {
    if (this._localValue !== undefined) {
      return clamp(this._localValue, 0, this._maxIndex);
    }
    if (this._sliderEntity) {
      const raw = Number.parseFloat(
        String(this._sliderEntity.state ?? this._sliderMin),
      );
      return parseStageIndex(raw - this._sliderMin, this._maxIndex);
    }
    return parseStageIndex(readStoredStage(this._storageKey), this._maxIndex);
  }

  private get _currentStage(): ResolvedStage | undefined {
    return this._stages[this._currentIndex];
  }

  private get _remotePower(): boolean | undefined {
    if (this._powerEntity) {
      return this._powerEntity.state === "on";
    }
    if (this._config?.power_entity) {
      return undefined;
    }
    return readStoredPower(this._storageKey);
  }

  private get _isOn(): boolean {
    return this._localPower ?? this._remotePower ?? true;
  }

  private get _displayValue(): number {
    return this._config?.entity
      ? this._sliderMin + this._currentIndex
      : this._currentIndex;
  }

  private get _displayMax(): number {
    return this._config?.entity
      ? this._sliderMin + this._maxIndex
      : this._maxIndex;
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (
      changed.has("_config") ||
      changed.has("_localValue") ||
      changed.has("_localPower") ||
      changed.has("_localEntities") ||
      changed.has("_pending") ||
      changed.has("_error")
    ) {
      return true;
    }
    if (changed.has("hass")) {
      return relevantHassChanged(
        changed.get("hass") as HomeAssistant | undefined,
        this.hass,
        relevantEntityIds(this._config),
      );
    }
    return true;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass")) {
      this._cachedStages = this._config
        ? resolveStages(this._config, this._sliderEntity)
        : [];
    }
  }

  protected updated(changed: PropertyValues): void {
    if (!changed.has("hass")) {
      return;
    }
    if (this._localValue !== undefined && this._sliderEntity) {
      const remote = parseStageIndex(
        Number.parseFloat(String(this._sliderEntity.state ?? this._sliderMin)) -
          this._sliderMin,
        this._maxIndex,
      );
      if (remote === this._localValue) {
        this._localValue = undefined;
      }
    }
    if (
      this._localPower !== undefined &&
      this._remotePower !== undefined &&
      this._remotePower === this._localPower
    ) {
      this._localPower = undefined;
    }

    const localEntities = { ...this._localEntities };
    let entityChanged = false;
    Object.entries(localEntities).forEach(([entityId, state]) => {
      const actual = entityStateLabel(this.hass?.states[entityId]?.state);
      if (actual === state) {
        delete localEntities[entityId];
        entityChanged = true;
      }
    });
    if (entityChanged) {
      this._localEntities = localEntities;
    }
  }

  private _sliderProgress(): string {
    if (this._maxIndex === 0) {
      return "0%";
    }
    return `${(this._currentIndex / this._maxIndex) * 100}%`;
  }

  private async _selectStage(index: number): Promise<void> {
    this._localValue = index;
    await this._applyStage(index);
  }

  private _togglePower(): void {
    void this._applyPower(!this._isOn);
  }

  private _onBarClick(): void {
    this._togglePower();
  }

  private _onPowerButtonClick(ev: Event): void {
    ev.stopPropagation();
    this._togglePower();
  }

  private _onStageButtonClick(ev: Event, index: number): void {
    ev.stopPropagation();
    void this._selectStage(index);
  }

  private _entityActualState(entityId: string): string {
    const local = this._localEntities[entityId];
    if (local) {
      return local;
    }
    return entityStateLabel(this.hass?.states[entityId]?.state);
  }

  private _predictedEntityStates(): Record<string, "on" | "off"> {
    const states: Record<string, "on" | "off"> = {};
    uniqueEntities(this._stages).forEach((target) => {
      states[target.entity] =
        this._entityActualState(target.entity) === "on" ? "on" : "off";
    });
    return states;
  }

  private _onEntityButtonClick(entityId: string, actual: string): void {
    if (actual !== "on" && actual !== "off") {
      return;
    }
    void this._applyEntity(entityId, actual !== "on");
  }

  private async _syncProgressFromEntities(): Promise<void> {
    const known = uniqueEntities(this._stages);
    if (
      known.some((target) => {
        const actual = this._entityActualState(target.entity);
        return actual !== "on" && actual !== "off";
      })
    ) {
      return;
    }

    const match = matchingStageIndex(this._stages, this._predictedEntityStates());
    if (match === undefined) {
      return;
    }
    if (match === 0) {
      if (this._isOn) {
        await this._writePower(false);
      }
      return;
    }
    if (!this._isOn || this._currentIndex !== match) {
      await this._writeStage(match);
      await this._writePower(true);
    }
  }

  private _enqueue(
    action:
      | { kind: "stage"; index: number }
      | { kind: "power"; on: boolean }
      | { kind: "entity"; entity: string; on: boolean },
  ): void {
    this._queue.push(action);
  }

  private async _writePower(on: boolean): Promise<void> {
    this._localPower = on;
    writeStoredPower(this._storageKey, on);
    if (!this.hass || !this._config?.power_entity) {
      return;
    }
    await this.hass.callService("homeassistant", on ? "turn_on" : "turn_off", {
      entity_id: this._config.power_entity,
    });
  }

  private async _writeStage(stageIndex: number): Promise<void> {
    this._localValue = stageIndex;
    writeStoredStage(this._storageKey, stageIndex);
    if (!this.hass || !this._config?.entity) {
      return;
    }
    await this.hass.callService("input_number", "set_value", {
      entity_id: this._config.entity,
      value: this._sliderMin + stageIndex,
    });
  }

  private async _applyTargets(targets: SwitchTarget[]): Promise<void> {
    if (!this.hass || this._config?.direct_control === false) {
      return;
    }
    const { on, off } = partitionTargets(targets);
    if (on.length) {
      await this.hass.callService("homeassistant", "turn_on", {
        entity_id: on,
      });
    }
    if (off.length) {
      await this.hass.callService("homeassistant", "turn_off", {
        entity_id: off,
      });
    }
  }

  private async _flushQueue(): Promise<void> {
    const queued = this._queue.shift();
    if (!queued) {
      return;
    }
    if (queued.kind === "stage") {
      await this._applyStage(queued.index);
      return;
    }
    if (queued.kind === "entity") {
      await this._applyEntity(queued.entity, queued.on);
      return;
    }
    await this._applyPower(queued.on);
  }

  private async _applyEntity(entity: string, on: boolean): Promise<void> {
    if (!this.hass || !this._config || this._config.direct_control === false) {
      return;
    }

    this._localEntities = { ...this._localEntities, [entity]: on ? "on" : "off" };

    if (this._pending) {
      this._enqueue({ kind: "entity", entity, on });
      return;
    }

    this._pending = true;
    this._error = undefined;

    try {
      await this.hass.callService("homeassistant", on ? "turn_on" : "turn_off", {
        entity_id: entity,
      });
      if (!this._queue.length) {
        await this._syncProgressFromEntities();
      }
    } catch (error) {
      this._error =
        error instanceof Error ? error.message : "Failed to toggle switch";
    } finally {
      this._pending = false;
    }

    await this._flushQueue();
  }

  private async _applyStage(index: number): Promise<void> {
    if (!this.hass || !this._config) {
      return;
    }

    const stageIndex = clamp(Math.round(index), 0, this._maxIndex);
    if (stageIndex === 0) {
      await this._applyPower(false);
      return;
    }

    this._localValue = stageIndex;
    this._localPower = true;

    if (this._pending) {
      this._enqueue({ kind: "stage", index: stageIndex });
      return;
    }

    this._pending = true;
    this._error = undefined;

    try {
      await this._writePower(true);
      await this._writeStage(stageIndex);
      await this._applyTargets(this._stages[stageIndex]?.targets ?? []);
    } catch (error) {
      this._error =
        error instanceof Error ? error.message : "Failed to apply stage";
    } finally {
      this._pending = false;
    }

    await this._flushQueue();
  }

  private async _applyPower(on: boolean): Promise<void> {
    if (!this.hass || !this._config) {
      return;
    }

    this._localPower = on;

    if (this._pending) {
      this._enqueue({ kind: "power", on });
      return;
    }

    this._pending = true;
    this._error = undefined;

    try {
      await this._writePower(on);
      await this._applyTargets(
        on ? this._currentStage?.targets ?? [] : allOffTargets(this._stages),
      );
    } catch (error) {
      this._error =
        error instanceof Error ? error.message : "Failed to toggle power";
    } finally {
      this._pending = false;
    }

    await this._flushQueue();
  }

  private _entityName(target: SwitchTarget): string {
    const stateObj = this.hass?.states[target.entity];
    return target.name || stateObj?.attributes.friendly_name || target.entity;
  }

  private _renderWarning() {
    if (!this._config) {
      return html`<ha-card><div class="warning">Invalid configuration</div></ha-card>`;
    }
    if (!this.hass) {
      return html`<ha-card><div class="warning">Waiting for Home Assistant</div></ha-card>`;
    }
    if (this._config.entity && !isValidEntityId(this._config.entity)) {
      return html`
        <ha-card>
          <div class="warning">Invalid slider entity: ${this._config.entity}</div>
        </ha-card>
      `;
    }
    if (this._config.entity && !this._sliderEntity) {
      return html`
        <ha-card>
          <div class="warning">Entity not found: ${this._config.entity}</div>
        </ha-card>
      `;
    }
    if (this._config.power_entity && !isValidEntityId(this._config.power_entity)) {
      return html`
        <ha-card>
          <div class="warning">
            Invalid power entity: ${this._config.power_entity}
          </div>
        </ha-card>
      `;
    }
    if (
      !this._config.entity &&
      !this._config.stages?.length &&
      !uniqueEntities(this._stages).length
    ) {
      return html`
        <ha-card>
          <div class="warning">
            Configure an input_number entity or at least one switch to get started.
          </div>
        </ha-card>
      `;
    }
    if (!this._stages.length) {
      return html`<ha-card><div class="warning">No stages configured</div></ha-card>`;
    }
    return null;
  }

  private _renderSwitchChip(target: SwitchTarget) {
    const stateObj = this.hass?.states[target.entity];
    const actual = this._entityActualState(target.entity);
    const name = this._entityName(target);
    const title = `${name}: ${actual}`;
    const disabled =
      actual === "missing" ||
      actual === "unavailable" ||
      actual === "unknown";

    return html`
      <button
        class="switch-status ${actual}"
        style="--state-domain-active-color: var(--state-${domainOf(target.entity)}-active-color)"
        type="button"
        title=${title}
        aria-label=${title}
        aria-pressed=${actual === "on"}
        ?disabled=${disabled}
        @click=${() => this._onEntityButtonClick(target.entity, actual)}
      >
        ${stateObj
          ? html`
              <ha-state-icon
                .hass=${this.hass}
                .stateObj=${stateObj}
                .icon=${target.icon}
              ></ha-state-icon>
            `
          : html`<ha-icon .icon=${entityIcon(target)}></ha-icon>`}
      </button>
    `;
  }

  protected render() {
    const warning = this._renderWarning();
    if (warning) {
      return warning;
    }

    const config = this._config!;
    const stages = this._stages;
    const current = this._currentStage;
    const entities = uniqueEntities(stages);
    const showLabels = config.show_stage_labels !== false;
    const showSwitches = config.show_switches !== false;
    const wrongDomain =
      config.entity && domainOf(config.entity) !== "input_number";

    return html`
      <ha-card>
        <div class="header">
          <div class="titles">
            <h2 class="title">${config.title ?? DEFAULT_TITLE}</h2>
            <div class="stage-name">
              ${this._isOn ? (current?.name ?? "Unknown stage") : "Off"}
            </div>
          </div>
          <div class="stage-value">${this._displayValue} / ${this._displayMax}</div>
        </div>

        ${wrongDomain
          ? html`<div class="notice">
              ${config.entity} is not an input_number. The card will still try
              to write a numeric value to it.
            </div>`
          : nothing}

        ${this._error ? html`<div class="warning">${this._error}</div>` : nothing}

        ${config.power_entity && !this._powerEntity
          ? html`<div class="notice">
              Power entity not found: ${config.power_entity}. On/off will
              still be remembered in this browser.
            </div>`
          : nothing}

        <div class="slider-section">
          <div
            class="slider-wrap ${this._maxIndex === 0 ? "single" : ""} ${this._isOn ? "" : "power-off"} ${showLabels ? "has-labels" : ""}"
            style="--slider-progress: ${this._sliderProgress()}; --max-index: ${this._maxIndex}"
            @click=${this._onBarClick}
          >
            <div class="slider-main">
              <button
                class="power-icon ${this._isOn ? "on" : "off"}"
                type="button"
                aria-label="Power"
                aria-pressed=${this._isOn}
                @click=${this._onPowerButtonClick}
              >
                <ha-icon .icon=${"mdi:power"}></ha-icon>
              </button>
              <div class="slider-track">
                <div class="slider-visual" aria-hidden="true">
                  <div class="slider-line"></div>
                  <div class="slider-fill"></div>
                </div>
                <div class="slider-dots">
                  ${stages
                    .filter((stage) => stage.index > 0)
                    .map(
                      (stage) => html`
                        <button
                          class="slider-dot ${stage.index < this._currentIndex
                            ? "done"
                            : stage.index === this._currentIndex
                              ? "current"
                              : "todo"} ${showLabels ? "has-label" : ""}"
                          style="--dot-index: ${stage.index}"
                          type="button"
                          aria-label=${stage.name}
                          aria-pressed=${stage.index === this._currentIndex}
                          @click=${(ev: Event) => this._onStageButtonClick(ev, stage.index)}
                        >
                          <ha-icon .icon=${stage.icon || "mdi:circle-medium"}></ha-icon>
                          ${showLabels
                            ? html`<span class="tick ${stage.index === this._currentIndex && this._isOn ? "active" : ""}">${stage.name}</span>`
                            : nothing}
                        </button>
                      `,
                    )}
                </div>
              </div>
            </div>
            ${showLabels
              ? html`
                  <div class="ticks-row">
                    <span
                      class="tick power-tick ${this._isOn ? "" : "active"}"
                    >
                      ${stages[0]?.name ?? "Off"}
                    </span>
                    <div class="ticks"></div>
                  </div>
                `
              : nothing}
          </div>
          ${showSwitches && entities.length
            ? html`
                <div class="switches">
                  ${entities.map((entity) => this._renderSwitchChip(entity))}
                </div>
              `
            : nothing}
        </div>
      </ha-card>
    `;
  }

  static styles = cardStyles;
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: CARD_NAME,
  name: CARD_TITLE,
  description:
    "A Lovelace card that combines several switches, lights, or fans into one staged control.",
  preview: true,
  documentationURL: "https://github.com/raj47i/hass-staged-switch",
});

console.info(
  `%c ${CARD_TITLE.toUpperCase()} %c ${CARD_VERSION} `,
  "color: white; background: #03a9f4; font-weight: 700;",
  "color: #03a9f4; background: white; font-weight: 700;",
);

declare global {
  interface HTMLElementTagNameMap {
    "staged-switch-card": StagedSwitchCard;
  }
}

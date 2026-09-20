import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  applyToggleTargets,
  chunkEvenly,
  clamp,
  domainOf,
  entityDisplayName,
  entityIcon,
  entityStateLabel,
  friendlyActionError,
  fireEvent,
  isInEditorPreview,
  isValidEntityId,
  relevantHassChanged,
  rowFillPercent,
  SerialActionQueue,
  setEntityOnOff,
  setInputNumber,
  visibleCardEntities,
} from "../../shared";
import type { HomeAssistant, LovelaceCard, SwitchTarget } from "../../shared/types";
import { DOCUMENTATION_URL } from "../../shared/const";
import { registerLovelaceCard } from "../../shared/register";
import {
  CARD_NAME,
  CARD_TITLE,
  DEFAULT_POWER_LABEL,
  DEFAULT_TITLE,
  EDITOR_SELECT_EVENT,
  SHOWCASE_CHIPS,
  SHOWCASE_CURRENT_INDEX,
  SHOWCASE_STAGE_COUNT,
  SHOWCASE_STAGE_NAME,
  SHOWCASE_TITLE,
} from "./const";
import "./editor";
import {
  cardStorageKey,
  readStoredPower,
  readStoredStage,
  writeStoredPower,
  writeStoredStage,
} from "./persist";
import {
  activateStudioScene,
  hydrateStudioCard,
  mergeSwitchStudioConfig,
  peekStudioScenes,
  sceneIdForSwitchIndex,
} from "../../studio/bind";
import { showsEntityButtons } from "../../shared/entity-buttons";
import {
  allOffTargets,
  cardEntities,
  extraStagesHidden,
  isEmptyStagedSwitchConfig,
  matchingStageIndex,
  parseStageIndex,
  relevantEntityIds,
  resolveStages,
  stageDesiredStates,
  uniqueEntities,
} from "./stages";
import { cardStyles } from "./styles";
import type { ResolvedStage, StagedSwitchCardConfig } from "./types";

@customElement(CARD_NAME)
export class StagedSwitchCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StagedSwitchCardConfig;
  @state() private _localValue?: number;
  @state() private _localPower?: boolean;
  @state() private _localEntities: Record<string, "on" | "off"> = {};
  @state() private _pending = false;
  @state() private _error?: string;
  @state() private _studioTick = 0;
  private _cachedStages: ResolvedStage[] = [];
  private _studioSlug?: string;
  private _studioCacheVersion = 0;
  private _queue = new SerialActionQueue<
    | { kind: "stage"; index: number }
    | { kind: "power"; on: boolean }
    | { kind: "entity"; entity: string; on: boolean }
  >();

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
    this._queue.clear();
    this._cachedStages = [];
    this._studioSlug = undefined;
    this._studioCacheVersion = 0;
    this._pending = false;
    this._error = undefined;
  }

  private get _resolved(): StagedSwitchCardConfig | undefined {
    if (!this._config) {
      return undefined;
    }
    return mergeSwitchStudioConfig(this._config, peekStudioScenes(this.hass));
  }

  public getCardSize(): number {
    if (isEmptyStagedSwitchConfig(this._resolved)) {
      return 4;
    }
    return 2 + this._entityButtonRows;
  }

  public getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      max_columns: 12,
      min_rows: isEmptyStagedSwitchConfig(this._resolved)
        ? 4
        : 2 + this._entityButtonRows,
    };
  }

  private get _visibleEntities() {
    if (!showsEntityButtons(this._resolved, true)) {
      return [];
    }
    return visibleCardEntities(
      this._resolved,
      cardEntities(this._resolved, this._stages),
    );
  }

  private get _entityButtonRows(): number {
    return chunkEvenly(this._visibleEntities).length;
  }

  private get _stageButtons() {
    return this._stages.filter((stage) => stage.index > 0);
  }

  private get _sliderEntity() {
    const entityId = this._resolved?.entity;
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  private get _powerEntity() {
    const entityId = this._resolved?.power_entity;
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  private get _storageKey() {
    return cardStorageKey(this._resolved);
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
    if (this._resolved?.power_entity) {
      return undefined;
    }
    return readStoredPower(this._storageKey);
  }

  private get _isOn(): boolean {
    return this._localPower ?? this._remotePower ?? true;
  }

  private get _displayValue(): number {
    return this._resolved?.entity
      ? this._sliderMin + this._currentIndex
      : this._currentIndex;
  }

  private get _displayMax(): number {
    return this._resolved?.entity
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
      changed.has("_error") ||
      changed.has("_studioTick")
    ) {
      return true;
    }
    if (changed.has("hass")) {
      return relevantHassChanged(
        changed.get("hass") as HomeAssistant | undefined,
        this.hass,
        relevantEntityIds(this._resolved),
      );
    }
    return true;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass") || changed.has("_studioTick")) {
      this._cachedStages = this._resolved
        ? resolveStages(this._resolved, this._sliderEntity)
        : [];
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadStudio();
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

  protected updated(changed: PropertyValues): void {
    if (changed.has("hass") || changed.has("_config")) {
      void this._loadStudio();
    }
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

  private _rowProgress(row: ResolvedStage[]): string {
    return `${rowFillPercent(
      row.map((stage) => stage.index),
      this._currentIndex,
    )}%`;
  }

  private _selectInEditor(
    detail: { page: "entities" | "stages"; stageIndex?: number; entity?: string },
  ): boolean {
    if (!isInEditorPreview(this)) {
      return false;
    }
    fireEvent(this, EDITOR_SELECT_EVENT, detail);
    return true;
  }

  private async _selectStage(index: number): Promise<void> {
    if (index <= 0) {
      if (this._selectInEditor({ page: "stages", stageIndex: 0 })) {
        this._localPower = false;
        return;
      }
      await this._applyPower(false);
      return;
    }
    this._localValue = index;
    if (this._selectInEditor({ page: "stages", stageIndex: index })) {
      this._localPower = true;
      return;
    }
    await this._applyStage(index);
  }

  private _togglePower(): void {
    if (this._selectInEditor({ page: "stages", stageIndex: 0 })) {
      this._localPower = !this._isOn;
      return;
    }
    void this._applyPower(!this._isOn);
  }

  private _onPowerButtonClick(): void {
    this._togglePower();
  }

  private _onStageButtonClick(index: number): void {
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
    if (this._selectInEditor({ page: "entities", entity: entityId })) {
      return;
    }
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
    this._queue.enqueue(action);
  }

  private async _writePower(on: boolean): Promise<void> {
    this._localPower = on;
    writeStoredPower(this._storageKey, on);
    if (!this.hass || !this._config?.power_entity) {
      return;
    }
    await setEntityOnOff(this.hass, this._config.power_entity, on);
  }

  private get _cardEntities(): SwitchTarget[] {
    return cardEntities(this._resolved, this._stages);
  }

  private get _rememberedStageIndex(): number {
    if (this._currentIndex > 0) {
      return this._currentIndex;
    }
    const stored = readStoredStage(this._storageKey);
    if (stored !== undefined && stored > 0) {
      return clamp(stored, 1, this._maxIndex);
    }
    return Math.min(1, this._maxIndex);
  }

  private _targetsForStage(stage?: ResolvedStage): SwitchTarget[] {
    const entities = this._cardEntities;
    const desired = stageDesiredStates(
      stage ?? { index: 0, name: "Off", targets: [] },
      entities,
    );
    return entities.map((entity) => ({
      ...entity,
      state: desired[entity.entity] ?? "off",
    }));
  }

  private _setLocalEntitiesFromTargets(targets: SwitchTarget[]): void {
    const next: Record<string, "on" | "off"> = {};
    targets.forEach((target) => {
      if (isValidEntityId(target.entity)) {
        next[target.entity] = target.state;
      }
    });
    this._localEntities = next;
  }

  private async _writeStage(stageIndex: number): Promise<void> {
    this._localValue = stageIndex;
    writeStoredStage(this._storageKey, stageIndex);
    if (!this.hass || !this._config?.entity) {
      return;
    }
    await setInputNumber(
      this.hass,
      this._config.entity,
      this._sliderMin + stageIndex,
    );
  }

  private async _applyTargets(targets: SwitchTarget[]): Promise<void> {
    await applyToggleTargets(
      this.hass,
      targets,
      this._config?.direct_control !== false,
    );
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
      await setEntityOnOff(this.hass, entity, on);
      if (!this._queue.length) {
        await this._syncProgressFromEntities();
      }
    } catch (error) {
      this._error = friendlyActionError(error, "Failed to toggle switch");
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
      const targets = this._targetsForStage(this._stages[stageIndex]);
      this._setLocalEntitiesFromTargets(targets);
      await this._writePower(true);
      await this._writeStage(stageIndex);
      if (this._resolved?.studio) {
        const usedScene = await activateStudioScene(
          this.hass,
          sceneIdForSwitchIndex(
            this._resolved.studio,
            stageIndex,
            peekStudioScenes(this.hass),
          ),
        );
        if (usedScene) {
          return;
        }
      }
      await this._applyTargets(targets);
    } catch (error) {
      this._error = friendlyActionError(error, "Failed to apply stage");
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
      const stageIndex = this._rememberedStageIndex;
      const targets = on
        ? this._targetsForStage(this._stages[stageIndex])
        : allOffTargets(this._stages, this._resolved);
      this._setLocalEntitiesFromTargets(targets);
      await this._writePower(on);
      if (on && stageIndex > 0 && this._currentIndex === 0) {
        await this._writeStage(stageIndex);
      }
      if (this._resolved?.studio) {
        const usedScene = await activateStudioScene(
          this.hass,
          sceneIdForSwitchIndex(
            this._resolved.studio,
            on ? stageIndex : 0,
            peekStudioScenes(this.hass),
          ),
        );
        if (usedScene) {
          return;
        }
      }
      await this._applyTargets(targets);
    } catch (error) {
      this._error = friendlyActionError(error, "Failed to toggle power");
    } finally {
      this._pending = false;
    }

    await this._flushQueue();
  }

  private _entityName(target: SwitchTarget): string {
    return entityDisplayName(this.hass, target.entity, target.name);
  }

  private _renderWarning() {
    if (!this._config) {
      return html`<ha-card><div class="warning">Invalid configuration</div></ha-card>`;
    }
    if (isEmptyStagedSwitchConfig(this._resolved)) {
      return this._renderShowcase();
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

  private _renderShowcase() {
    const current = SHOWCASE_CURRENT_INDEX;
    const chips = chunkEvenly(SHOWCASE_CHIPS, 3);
    const fill = rowFillPercent(
      Array.from({ length: SHOWCASE_STAGE_COUNT }, (_, index) => index + 1),
      current,
    );
    return html`
      <ha-card class="showcase">
        <div class="header">
          <div class="titles">
            <h2 class="title">${SHOWCASE_TITLE}</h2>
            <div class="stage-name">${SHOWCASE_STAGE_NAME}</div>
          </div>
          <div class="stage-value">${current} / ${SHOWCASE_STAGE_COUNT}</div>
        </div>
        <div class="slider-section">
          <div class="showcase-bar">
            <button class="power-icon on" type="button" tabindex="-1" aria-hidden="true">
              <ha-icon .icon=${"mdi:power"}></ha-icon>
              <span class="tick active">${DEFAULT_POWER_LABEL}</span>
            </button>
            <div
              class="showcase-track"
              style="--slider-progress: ${fill}%"
              aria-hidden="true"
            >
              <div class="slider-line"></div>
              <div class="slider-fill"></div>
              <div class="showcase-dots">
                ${Array.from({ length: SHOWCASE_STAGE_COUNT }, (_, index) => {
                  const stageIndex = index + 1;
                  return html`
                    <button
                      class="slider-dot ${stageIndex < current
                        ? "done"
                        : stageIndex === current
                          ? "current"
                          : "todo"}"
                      type="button"
                      tabindex="-1"
                    >
                      <ha-icon .icon=${"mdi:circle-medium"}></ha-icon>
                    </button>
                  `;
                })}
              </div>
            </div>
          </div>
          <div class="switches">
            ${chips.map(
              (row) => html`
                <div class="switch-row">
                  ${row.map(
                    (item) => html`
                      <button
                        class="switch-status ${item.state}"
                        type="button"
                        tabindex="-1"
                        aria-hidden="true"
                      >
                        <ha-icon .icon=${item.icon}></ha-icon>
                      </button>
                    `,
                  )}
                </div>
              `,
            )}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _renderStageDot(stage: ResolvedStage, showLabels: boolean) {
    return html`
      <div
        class="slider-dot-slot"
        @click=${() => this._onStageButtonClick(stage.index)}
      >
        <button
          class="slider-dot ${stage.index < this._currentIndex
            ? "done"
            : stage.index === this._currentIndex
              ? "current"
              : "todo"} ${showLabels ? "has-label" : ""}"
          type="button"
          aria-label=${stage.name}
          aria-pressed=${stage.index === this._currentIndex}
        >
          <ha-icon .icon=${stage.icon || "mdi:circle-medium"}></ha-icon>
        </button>
        ${showLabels
          ? html`<span class="tick ${stage.index === this._currentIndex && this._isOn ? "active" : ""}">${stage.name}</span>`
          : nothing}
      </div>
    `;
  }

  protected render() {
    const warning = this._renderWarning();
    if (warning) {
      return warning;
    }

    const config = this._resolved ?? this._config!;
    const stages = this._stages;
    const current = this._currentStage;
    const visibleRows = chunkEvenly(this._visibleEntities);
    const stageButtons = this._stageButtons;
    const showLabels = config.show_stage_labels !== false;
    const showSwitches = visibleRows.length > 0;
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

        ${this._error ? html`<div class="warning" role="alert">${this._error}</div>` : nothing}

        ${config.power_entity && !this._powerEntity
          ? html`<div class="notice">
              Power entity not found: ${config.power_entity}. On/off will
              still be remembered in this browser.
            </div>`
          : nothing}

        ${extraStagesHidden(config)
          ? html`<div class="notice">
              This card shows at most 5 stages. Extra stages stay in the
              config but are not used.
            </div>`
          : nothing}

        <div class="slider-section">
          <div
            class="slider-wrap ${this._maxIndex === 0 ? "single" : ""} ${this._isOn ? "" : "power-off"} ${showLabels ? "has-labels" : ""}"
            style="--slider-progress: ${this._rowProgress(stageButtons)}; --stage-count: ${stageButtons.length}"
          >
            <div class="slider-main">
              <div class="slider-visual" aria-hidden="true">
                <div class="slider-line"></div>
                <div class="slider-fill"></div>
              </div>
              <button
                class="power-icon ${this._isOn ? "on" : "off"}"
                type="button"
                aria-label="Power"
                aria-pressed=${this._isOn}
                @click=${() => this._onPowerButtonClick()}
              >
                <ha-icon .icon=${"mdi:power"}></ha-icon>
                <span class="tick ${this._isOn ? "active" : ""}">${DEFAULT_POWER_LABEL}</span>
              </button>
              ${stageButtons.map((stage) => this._renderStageDot(stage, showLabels))}
            </div>
          </div>
          ${showSwitches && visibleRows.length
            ? html`
                <div class="switches">
                  ${visibleRows.map(
                    (row) => html`
                      <div class="switch-row">
                        ${row.map((entity) => this._renderSwitchChip(entity))}
                      </div>
                    `,
                  )}
                </div>
              `
            : nothing}
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
    "A Lovelace card that combines several switches, lights, or fans into one staged control.",
  preview: true,
  documentationURL: DOCUMENTATION_URL,
});

declare global {
  interface HTMLElementTagNameMap {
    "staged-switch-card": StagedSwitchCard;
  }
}

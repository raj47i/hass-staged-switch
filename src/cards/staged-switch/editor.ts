import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  appendUniqueEntities,
  CONTROL_DOMAINS,
  entitiesFromArea,
  entitiesFromDevice,
  entityDisplayName,
  fireConfigChanged,
  isRosterEntity,
  isToggleEntity,
  isValidEntityId,
  normalizeSwitch,
  normalizeTitleAlign,
  pickedValue,
  registerCardAliases,
  storedTitleAlign,
  TITLE_ALIGN_OPTIONS,
} from "../../shared";
import type { HomeAssistant, SwitchEntityConfig, SwitchState } from "../../shared/types";
import { peekStudioScenes, refreshStudioScenes, studioSetOptions } from "../../studio/bind";
import {
  hiddenEntityIds,
  renderEntityButtonsEditor,
  studioSetEntityIds,
  toggleHiddenEntity,
} from "../../studio/entity-buttons";
import { CARD_LEGACY_NAME, CARD_NAME, EDITOR_SELECT_EVENT, MAX_RESOLVED_STAGES, MAX_STAGES } from "./const";
import { resolveStages } from "./stages";
import { editorStyles } from "./styles";
import type { StageConfig, StagedSwitchCardConfig } from "./types";

type StageSwitchRow = { entity: string; state: SwitchState };
type EditorMode = "cumulative" | "explicit";
type EditorPage = "entities" | "stages";

const cloneStages = (stages: StageConfig[]): StageConfig[] =>
  stages.map((stage) => ({
    ...stage,
    switches: Array.isArray(stage.switches)
      ? stage.switches.map((item) =>
          typeof item === "string" ? item : { ...item },
        )
      : { ...(stage.switches ?? {}) },
  }));

@customElement(`${CARD_NAME}-editor`)
export class StagedSwitchCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: StagedSwitchCardConfig;
  @state() private _page: EditorPage = "entities";
  @state() private _focusStage?: number;
  @state() private _focusEntity?: string;
  @state() private _areaPicker = "";
  @state() private _devicePicker = "";

  public setConfig(config: StagedSwitchCardConfig): void {
    this._config = { ...config };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(EDITOR_SELECT_EVENT, this._onPreviewSelect);
    void refreshStudioScenes(this.hass).then(() => this.requestUpdate());
  }

  private _studioChanged(ev: Event): void {
    const slug = pickedValue(ev);
    if (!this._config) {
      return;
    }
    if (!slug) {
      this._config = { ...this._config, studio: undefined };
      fireConfigChanged(this, this._config);
      return;
    }
    this._config = {
      type: this._config.type,
      studio: slug,
      title: this._config.title,
      title_align: this._config.title_align,
      show_switches: this._config.show_switches,
      show_stage_labels: this._config.show_stage_labels,
    };
    fireConfigChanged(this, this._config);
  }

  public disconnectedCallback(): void {
    window.removeEventListener(EDITOR_SELECT_EVENT, this._onPreviewSelect);
    super.disconnectedCallback();
  }

  private _onPreviewSelect = (ev: Event): void => {
    const detail = (ev as CustomEvent<{
      page?: EditorPage;
      stageIndex?: number;
      entity?: string;
    }>).detail;
    if (!detail?.page) {
      return;
    }
    this._page = detail.page;
    this._focusStage = detail.stageIndex;
    this._focusEntity = detail.entity;
  };

  private get _mode(): EditorMode {
    return this._config?.stages?.length ? "explicit" : "cumulative";
  }

  private get _sliderEntity() {
    const entityId = this._config?.entity;
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  private get _resolvedStages() {
    return this._config ? resolveStages(this._config, this._sliderEntity) : [];
  }

  private get _roster(): SwitchEntityConfig[] {
    if (this._config?.switches) {
      return this._config.switches
        .map(normalizeSwitch)
        .filter(isRosterEntity);
    }
    const seen = new Map<string, SwitchEntityConfig>();
    (this._config?.stages ?? []).forEach((stage) => {
      this._stageSwitchRows(stage).forEach((row) => {
        if (isValidEntityId(row.entity) && !seen.has(row.entity)) {
          seen.set(row.entity, normalizeSwitch(row.entity));
        }
      });
    });
    return Array.from(seen.values());
  }

  private _entityName(entityId: string): string {
    return entityDisplayName(this.hass, entityId);
  }

  private _updateConfig(patch: Partial<StagedSwitchCardConfig>): void {
    if (!this._config) {
      return;
    }
    this._config = { ...this._config, ...patch };
    fireConfigChanged(this, this._config);
  }

  private _titleChanged(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this._updateConfig({ title: value || undefined });
  }

  private _alignChanged(ev: Event): void {
    this._updateConfig({ title_align: storedTitleAlign(pickedValue(ev)) });
  }

  private _entityChanged(ev: CustomEvent<{ value?: string }>): void {
    this._updateConfig({ entity: ev.detail.value || undefined });
  }

  private _powerEntityChanged(ev: CustomEvent<{ value?: string }>): void {
    this._updateConfig({ power_entity: ev.detail.value || undefined });
  }

  private _directControlChanged(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this._updateConfig({ direct_control: checked });
  }

  private _showSwitchesChanged(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this._updateConfig({ show_switches: checked });
  }

  private _showLabelsChanged(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this._updateConfig({ show_stage_labels: checked });
  }

  private _alignedStages(roster: SwitchEntityConfig[]): StageConfig[] {
    const stages = cloneStages(this._config?.stages ?? []);
    return stages.map((stage) => ({
      ...stage,
      switches: roster
        .filter((item) => isValidEntityId(item.entity))
        .map((item) => ({
          entity: item.entity,
          state: this._stageState(stage, item.entity),
        })),
    }));
  }

  private _writeRoster(roster: SwitchEntityConfig[]): void {
    const clean = roster.map(normalizeSwitch).filter(isRosterEntity);
    if (this._mode === "explicit") {
      this._updateConfig({
        switches: clean,
        stages: this._alignedStages(clean),
      });
      return;
    }
    this._updateConfig({ switches: clean });
  }

  private _modeChanged(ev: Event): void {
    const mode = (ev.target as HTMLSelectElement).value as EditorMode;
    if (mode === this._mode || !this._config) {
      return;
    }
    const roster = this._roster.filter((item) => isValidEntityId(item.entity));

    if (mode === "explicit") {
      const resolved = this._resolvedStages;
      const stages: StageConfig[] = [
        {
          name: resolved[0]?.name ?? "Off",
          switches: Object.fromEntries(
            roster.map((item) => [item.entity, "off" as const]),
          ),
        },
        ...roster.slice(0, MAX_STAGES).map((_item, index) => ({
          name: resolved[index + 1]?.name ?? `Stage ${index + 1}`,
          switches: Object.fromEntries(
            roster.map((switchItem, switchIndex) => [
              switchItem.entity,
              switchIndex <= index ? ("on" as const) : ("off" as const),
            ]),
          ),
        })),
      ];
      this._updateConfig({
        stages: stages.slice(0, MAX_RESOLVED_STAGES),
        switches: roster,
      });
      return;
    }

    this._updateConfig({
      switches: roster,
      stages: undefined,
      stage_names: (this._config.stages ?? []).map(
        (stage, index) => stage.name?.trim() || `Stage ${index}`,
      ),
    });
  }

  private _stageLabelChanged(index: number, ev: Event): void {
    if (!this._config) {
      return;
    }
    const value = (ev.target as HTMLInputElement).value;
    const names = this._resolvedStages.map((stage, stageIndex) =>
      stageIndex === index ? value : this._config!.stage_names?.[stageIndex] ?? stage.name,
    );
    this._updateConfig({
      stage_names: names.some((name) => name.trim()) ? names : undefined,
    });
  }

  private _switchHideChanged(index: number, ev: Event): void {
    const roster = [...this._roster];
    const hide = (ev.target as HTMLInputElement).checked;
    roster[index] = {
      ...roster[index],
      hide: hide || undefined,
    };
    this._writeRoster(roster);
  }

  private _switchEntityChanged(index: number, ev: CustomEvent<{ value?: string }>): void {
    const value = ev.detail?.value;
    if (!isValidEntityId(value) || (this.hass && !isToggleEntity(this.hass, value))) {
      return;
    }
    const roster = [...this._roster];
    roster[index] = {
      ...roster[index],
      entity: value,
    };
    this._focusEntity = value;
    this._writeRoster(roster);
  }

  private _addSwitch(): void {
    this._writeRoster([...this._roster, { entity: "" }]);
  }

  private _addEntities(entityIds: string[]): void {
    const { roster, added } = appendUniqueEntities(
      this._roster,
      entityIds,
      this.hass,
    );
    if (added) {
      this._writeRoster(roster);
    }
  }

  private _areaPicked(ev: Event): void {
    const areaId = pickedValue(ev);
    this._areaPicker = "";
    if (!areaId || !this.hass) {
      return;
    }
    this._addEntities(entitiesFromArea(this.hass, areaId));
  }

  private _devicePicked(ev: Event): void {
    const deviceId = pickedValue(ev);
    this._devicePicker = "";
    if (!deviceId || !this.hass) {
      return;
    }
    this._addEntities(entitiesFromDevice(this.hass, deviceId));
  }

  private _removeSwitch(index: number): void {
    const roster = [...this._roster];
    const removed = roster.splice(index, 1)[0];
    if (this._focusEntity && removed?.entity === this._focusEntity) {
      this._focusEntity = undefined;
    }
    const names = [...(this._config?.stage_names ?? [])];
    if (this._mode === "cumulative" && names.length) {
      names.splice(index + 1, 1);
      this._updateConfig({
        switches: roster,
        stage_names: names.length ? names : undefined,
      });
      return;
    }
    this._writeRoster(roster);
  }

  private _moveSwitch(index: number, direction: -1 | 1): void {
    const next = index + direction;
    const roster = [...this._roster];
    if (next < 0 || next >= roster.length) {
      return;
    }
    [roster[index], roster[next]] = [roster[next], roster[index]];
    if (this._mode === "cumulative") {
      const names = [...(this._config?.stage_names ?? [])];
      const from = index + 1;
      const to = next + 1;
      if (from < names.length && to < names.length) {
        [names[from], names[to]] = [names[to], names[from]];
        this._updateConfig({
          switches: roster.map(normalizeSwitch).filter(isRosterEntity),
          stage_names: names.some((name) => name.trim()) ? names : undefined,
        });
        return;
      }
    }
    this._writeRoster(roster);
  }

  private _stageNameChanged(index: number, ev: Event): void {
    const stages = cloneStages(this._config?.stages ?? []);
    stages[index] = {
      ...stages[index],
      name: (ev.target as HTMLInputElement).value || undefined,
    };
    this._updateConfig({ stages });
  }

  private _setStageEntityState(
    stageIndex: number,
    entityId: string,
    state: SwitchState,
  ): void {
    const stages = this._alignedStages(this._roster);
    const rows = this._stageSwitchRows(stages[stageIndex]).map((row) =>
      row.entity === entityId ? { ...row, state } : row,
    );
    stages[stageIndex] = { ...stages[stageIndex], switches: rows };
    this._updateConfig({ stages, switches: this._roster });
  }

  private _addStage(): void {
    const roster = this._roster.filter((item) => isValidEntityId(item.entity));
    const stages = this._alignedStages(roster);
    if (stages.length >= MAX_RESOLVED_STAGES) {
      return;
    }
    stages.push({
      name: `Stage ${stages.length}`,
      switches: roster.map((item) => ({ entity: item.entity, state: "off" as const })),
    });
    this._focusStage = stages.length - 1;
    this._updateConfig({ stages, switches: this._roster });
  }

  private _removeStage(index: number): void {
    const stages = cloneStages(this._config?.stages ?? []);
    stages.splice(index, 1);
    if (this._focusStage === index) {
      this._focusStage = undefined;
    }
    this._updateConfig({
      stages: stages.length ? stages : undefined,
      switches: this._roster,
    });
  }

  private _stageSwitchRows(stage?: StageConfig): StageSwitchRow[] {
    const switches = stage?.switches;
    if (!switches) {
      return [];
    }
    if (Array.isArray(switches)) {
      return switches.map((item) =>
        typeof item === "string"
          ? { entity: item, state: "on" }
          : { entity: item.entity, state: item.state ?? "on" },
      );
    }
    return Object.entries(switches).map(([entity, state]) => ({
      entity,
      state,
    }));
  }

  private _stageState(stage: StageConfig | undefined, entityId: string): SwitchState {
    return this._stageSwitchRows(stage).find((row) => row.entity === entityId)?.state ?? "off";
  }

  private _renderSharedFields() {
    const config = this._config!;
    const sets = studioSetOptions(this.hass, ["switch", "advanced"]);
    return html`
      <label class="row">
        <span class="label">Scene-set</span>
        <select
          class="text-input"
          .value=${config.studio ?? ""}
          @change=${this._studioChanged}
        >
          <option value="">Configure this card manually</option>
          ${sets.map(
            (set) => html`<option value=${set.slug}>${set.name}</option>`,
          )}
        </select>
      </label>
      ${config.studio
        ? html`
            <span class="help">
              Stages come from the
              ${sets.find((set) => set.slug === config.studio)?.name ?? config.studio}
              scene-set. Edit it in Scene Studio.
            </span>
          `
        : nothing}

      <label class="row">
        <span class="label">Title</span>
        <div class="split">
          <input
            class="text-input"
            .value=${config.title ?? ""}
            placeholder="Room Switches"
            @input=${this._titleChanged}
          />
          <select
            class="text-input"
            .value=${normalizeTitleAlign(config.title_align)}
            ?disabled=${!((config.title ?? "").trim())}
            @change=${this._alignChanged}
          >
            ${TITLE_ALIGN_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </div>
      </label>

      ${config.studio
        ? nothing
        : html`
      <ha-entity-picker
        .hass=${this.hass}
        .value=${config.entity ?? ""}
        label="Stage helper (input_number)"
        .includeDomains=${["input_number"]}
        allow-custom-entity
        @value-changed=${this._entityChanged}
      ></ha-entity-picker>
      <span class="help">
        Create a Number helper first under Settings → Devices &amp; services →
        Helpers. Use min 0, step 1, and max equal to the last stage.
      </span>

      <ha-entity-picker
        .hass=${this.hass}
        .value=${config.power_entity ?? ""}
        label="Power entity (input_boolean)"
        .includeDomains=${["input_boolean"]}
        allow-custom-entity
        @value-changed=${this._powerEntityChanged}
      ></ha-entity-picker>

      <div class="inline">
        <span class="label">Directly control switches</span>
        <input
          type="checkbox"
          .checked=${config.direct_control !== false}
          @change=${this._directControlChanged}
        />
      </div>
      `}
      ${config.studio
        ? renderEntityButtonsEditor({
            hass: this.hass,
            enabled: config.show_switches === true,
            entities: studioSetEntityIds(config.studio, peekStudioScenes(this.hass)),
            hidden: hiddenEntityIds(config),
            onEnabled: (enabled) =>
              this._updateConfig({
                show_switches: enabled || undefined,
                hidden_entities: enabled ? config.hidden_entities : undefined,
              }),
            onVisible: (entityId, visible) =>
              this._updateConfig({
                hidden_entities: toggleHiddenEntity(
                  config.hidden_entities ?? [],
                  entityId,
                  visible,
                  studioSetEntityIds(config.studio, peekStudioScenes(this.hass)),
                ),
              }),
          })
        : html`
            <div class="inline">
              <span class="label">Show entity buttons</span>
              <input
                type="checkbox"
                .checked=${config.show_switches !== false}
                @change=${this._showSwitchesChanged}
              />
            </div>
          `}
      <div class="inline">
        <span class="label">Show stage labels</span>
        <input
          type="checkbox"
          .checked=${config.show_stage_labels !== false}
          @change=${this._showLabelsChanged}
        />
      </div>
    `;
  }

  private _renderEntitiesPage() {
    const roster = this._roster;
    return html`
      <div class="row">
        <span class="label">Entities</span>
        <span class="help">
          Add lights, fans, and switches that have On/Off. Sensors and other
          read-only entities are skipped. Pick an area or device to add every
          matching toggle under it. Use the arrows to reorder.
        </span>
        ${customElements.get("ha-area-picker")
          ? html`
              <ha-area-picker
                .hass=${this.hass}
                .value=${this._areaPicker}
                label="Add all entities from area"
                @value-changed=${this._areaPicked}
              ></ha-area-picker>
            `
          : html`
              <select .value=${this._areaPicker} @change=${this._areaPicked}>
                <option value="">Add all entities from area</option>
                ${Object.values(this.hass?.areas ?? {}).map(
                  (area) => html`
                    <option value=${area.area_id}>${area.name}</option>
                  `,
                )}
              </select>
            `}
        ${customElements.get("ha-device-picker")
          ? html`
              <ha-device-picker
                .hass=${this.hass}
                .value=${this._devicePicker}
                label="Add all entities from device"
                @value-changed=${this._devicePicked}
              ></ha-device-picker>
            `
          : html`
              <select .value=${this._devicePicker} @change=${this._devicePicked}>
                <option value="">Add all entities from device</option>
                ${Object.values(this.hass?.devices ?? {}).map(
                  (device) => html`
                    <option value=${device.id}>
                      ${device.name_by_user || device.name || device.id}
                    </option>
                  `,
                )}
              </select>
            `}
        <div class="list">
          ${roster.map(
            (item, index) => html`
              <div
                class="item ${this._focusEntity === item.entity ? "focused" : ""}"
              >
                <div class="item-head">
                  <span class="label">Entity ${index + 1}</span>
                  <div class="reorder">
                    <button
                      type="button"
                      ?disabled=${index === 0}
                      @click=${() => this._moveSwitch(index, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      ?disabled=${index === roster.length - 1}
                      @click=${() => this._moveSwitch(index, 1)}
                    >
                      Down
                    </button>
                    <button type="button" @click=${() => this._removeSwitch(index)}>
                      Remove
                    </button>
                  </div>
                </div>
                <ha-entity-picker
                  .hass=${this.hass}
                  .value=${item.entity}
                  label="Entity"
                  .includeDomains=${CONTROL_DOMAINS}
                  allow-custom-entity
                  @value-changed=${(ev: CustomEvent<{ value?: string }>) =>
                    this._switchEntityChanged(index, ev)}
                ></ha-entity-picker>
                ${isValidEntityId(item.entity)
                  ? html`
                      <div class="inline">
                        <span class="label">Hide from card</span>
                        <input
                          type="checkbox"
                          .checked=${Boolean(item.hide)}
                          @change=${(ev: Event) =>
                            this._switchHideChanged(index, ev)}
                        />
                      </div>
                      <span class="help">
                        Still controlled by the stage buttons, just not shown
                        as an icon.
                      </span>
                    `
                  : nothing}
              </div>
            `,
          )}
        </div>
        <div class="actions">
          <button type="button" @click=${() => this._addSwitch()}>Add entity</button>
        </div>
      </div>
    `;
  }

  private _renderStagesPage() {
    const roster = this._roster.filter((item) => isValidEntityId(item.entity));
    const stages = this._config?.stages ?? [];

    return html`
      <label class="row">
        <span class="label">Stage configuration</span>
        <select @change=${this._modeChanged}>
          <option value="cumulative" ?selected=${this._mode === "cumulative"}>
            Cumulative switches
          </option>
          <option value="explicit" ?selected=${this._mode === "explicit"}>
            Explicit stage map
          </option>
        </select>
        <span class="help">
          This card has at most 5 stages besides Power. Extra entities can
          still be on or off in those stages, but they do not add more buttons.
        </span>
      </label>

      ${!roster.length
        ? html`<span class="help">Add entities on page 1 first.</span>`
        : this._mode === "cumulative"
          ? html`
              <div class="row">
                <span class="label">Stage names</span>
                <div class="list">
                  ${this._resolvedStages
                    .filter((stage) => stage.index > 0)
                    .map(
                      (stage) => html`
                        <ha-textfield
                          class="${this._focusStage === stage.index ? "focused" : ""}"
                          label="Stage ${stage.index}"
                          .value=${this._config?.stage_names?.[stage.index] ?? stage.name}
                          placeholder=${stage.name}
                          @input=${(ev: Event) =>
                            this._stageLabelChanged(stage.index, ev)}
                        ></ha-textfield>
                      `,
                    )}
                </div>
              </div>
            `
          : html`
              <div class="row">
                <span class="label">Stages</span>
                <span class="help">
                  Each stage is one combination. Mark every entity on or off.
                </span>
                <div class="list">
                  ${stages.map(
                    (stage, stageIndex) => html`
                      <div
                        class="item ${this._focusStage === stageIndex ? "focused" : ""}"
                      >
                        <div class="item-head">
                          <span class="label">Stage ${stageIndex}</span>
                          <button
                            type="button"
                            @click=${() => this._removeStage(stageIndex)}
                          >
                            Remove
                          </button>
                        </div>
                        <ha-textfield
                          label="Stage name"
                          .value=${stage.name ?? ""}
                          placeholder="Label for this combination"
                          @input=${(ev: Event) =>
                            this._stageNameChanged(stageIndex, ev)}
                        ></ha-textfield>
                        ${roster.map(
                          (item) => html`
                            <label class="inline">
                              <span class="label">${this._entityName(item.entity)}</span>
                              <select
                                .value=${this._stageState(stage, item.entity)}
                                @change=${(ev: Event) =>
                                  this._setStageEntityState(
                                    stageIndex,
                                    item.entity,
                                    (ev.target as HTMLSelectElement)
                                      .value as SwitchState,
                                  )}
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
                <div class="actions">
                  <button
                    type="button"
                    ?disabled=${stages.length >= MAX_RESOLVED_STAGES}
                    @click=${() => this._addStage()}
                  >
                    Add stage
                  </button>
                </div>
              </div>
            `}
    `;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    return html`
      <div class="form">
        ${this._renderSharedFields()}

        ${this._config.studio
          ? nothing
          : html`
        <div class="steps">
          <button
            type="button"
            class="${this._page === "entities" ? "active" : ""}"
            @click=${() => {
              this._page = "entities";
            }}
          >
            1. Entities
          </button>
          <button
            type="button"
            class="${this._page === "stages" ? "active" : ""}"
            @click=${() => {
              this._page = "stages";
            }}
          >
            2. Stages
          </button>
        </div>

        ${this._page === "entities"
          ? this._renderEntitiesPage()
          : this._renderStagesPage()}
        `}
      </div>
    `;
  }

  static styles = editorStyles;
}

registerCardAliases(`${CARD_NAME}-editor`, [`${CARD_LEGACY_NAME}-editor`]);

declare global {
  interface HTMLElementTagNameMap {
    [CARD_NAME + "-editor"]: StagedSwitchCardEditor;
    [CARD_LEGACY_NAME + "-editor"]: StagedSwitchCardEditor;
  }
}

import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { CARD_NAME } from "./const";
import { editorStyles } from "./styles";
import type {
  HomeAssistant,
  StageConfig,
  StagedSwitchCardConfig,
  SwitchEntityConfig,
  SwitchState,
} from "./types";
import { fireEvent, isValidEntityId, normalizeSwitch, resolveStages } from "./utils";

type StageSwitchRow = { entity: string; state: SwitchState };

type EditorMode = "cumulative" | "explicit";

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

  public setConfig(config: StagedSwitchCardConfig): void {
    this._config = { ...config };
  }

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

  private _updateConfig(patch: Partial<StagedSwitchCardConfig>): void {
    if (!this._config) {
      return;
    }
    this._config = { ...this._config, ...patch };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _titleChanged(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this._updateConfig({ title: value || undefined });
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

  private _modeChanged(ev: Event): void {
    const mode = (ev.target as HTMLSelectElement).value as EditorMode;
    if (mode === this._mode || !this._config) {
      return;
    }

    if (mode === "explicit") {
      const switches = (this._config.switches ?? []).map(normalizeSwitch);
      const resolved = this._resolvedStages;
      const stages: StageConfig[] = [
        {
          name: resolved[0]?.name ?? "Off",
          switches: Object.fromEntries(
            switches
              .filter((item) => isValidEntityId(item.entity))
              .map((item) => [item.entity, "off" as const]),
          ),
        },
        ...switches.filter((item) => isValidEntityId(item.entity)).map((_item, index) => ({
          name: resolved[index + 1]?.name ?? `Stage ${index + 1}`,
          switches: Object.fromEntries(
            switches
              .filter((switchItem) => isValidEntityId(switchItem.entity))
              .map((switchItem, switchIndex) => [
                switchItem.entity,
                switchIndex <= index ? ("on" as const) : ("off" as const),
              ]),
          ),
        })),
      ];
      this._updateConfig({ stages, switches: undefined });
      return;
    }

    const entities = new Map<string, SwitchEntityConfig>();
    (this._config.stages ?? []).forEach((stage) => {
      const switches = stage.switches;
      if (!switches) {
        return;
      }
      if (Array.isArray(switches)) {
        switches.forEach((item) => {
          const normalized = normalizeSwitch(
            typeof item === "string" ? item : item.entity,
          );
          if (isValidEntityId(normalized.entity)) {
            entities.set(normalized.entity, normalized);
          }
        });
        return;
      }
      Object.keys(switches).forEach((entity) => {
        if (isValidEntityId(entity)) {
          entities.set(entity, normalizeSwitch(entity));
        }
      });
    });
    this._updateConfig({
      switches: Array.from(entities.values()),
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

  private _switchEntityChanged(index: number, ev: CustomEvent<{ value?: string }>): void {
    const switches = [...(this._config?.switches ?? [])].map(normalizeSwitch);
    switches[index] = {
      ...switches[index],
      entity: ev.detail.value ?? "",
    };
    this._updateConfig({ switches });
  }

  private _addSwitch(): void {
    const switches = [...(this._config?.switches ?? [])].map(normalizeSwitch);
    switches.push({ entity: "" });
    this._updateConfig({ switches });
  }

  private _removeSwitch(index: number): void {
    const switches = [...(this._config?.switches ?? [])].map(normalizeSwitch);
    switches.splice(index, 1);
    const names = [...(this._config?.stage_names ?? [])];
    if (names.length) {
      names.splice(index + 1, 1);
    }
    this._updateConfig({
      switches,
      stage_names: names.length ? names : undefined,
    });
  }

  private _stageNameChanged(index: number, ev: Event): void {
    const stages = [...(this._config?.stages ?? [])];
    stages[index] = {
      ...stages[index],
      name: (ev.target as HTMLInputElement).value || undefined,
    };
    this._updateConfig({ stages });
  }

  private _stageSwitchEntityChanged(
    stageIndex: number,
    entityIndex: number,
    ev: CustomEvent<{ value?: string }>,
  ): void {
    const rows = this._stageSwitchRows(this._config?.stages?.[stageIndex]);
    const current = rows[entityIndex];
    rows[entityIndex] = {
      entity: ev.detail.value ?? "",
      state: current?.state ?? "off",
    };
    this._setStageSwitchRows(stageIndex, rows);
  }

  private _stageSwitchStateChanged(
    stageIndex: number,
    entityIndex: number,
    ev: Event,
  ): void {
    const rows = this._stageSwitchRows(this._config?.stages?.[stageIndex]);
    const current = rows[entityIndex];
    if (!current) {
      return;
    }
    rows[entityIndex] = {
      ...current,
      state: (ev.target as HTMLSelectElement).value as SwitchState,
    };
    this._setStageSwitchRows(stageIndex, rows);
  }

  private _addStageSwitch(stageIndex: number): void {
    const rows = this._stageSwitchRows(this._config?.stages?.[stageIndex]);
    rows.push({ entity: "", state: "off" });
    this._setStageSwitchRows(stageIndex, rows);
  }

  private _removeStageSwitch(stageIndex: number, entityIndex: number): void {
    const rows = this._stageSwitchRows(this._config?.stages?.[stageIndex]);
    rows.splice(entityIndex, 1);
    this._setStageSwitchRows(stageIndex, rows);
  }

  private _addStage(): void {
    const stages = [...(this._config?.stages ?? [])];
    stages.push({ name: `Stage ${stages.length}`, switches: {} });
    this._updateConfig({ stages });
  }

  private _removeStage(index: number): void {
    const stages = [...(this._config?.stages ?? [])];
    stages.splice(index, 1);
    this._updateConfig({ stages });
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

  private _setStageSwitchRows(stageIndex: number, rows: StageSwitchRow[]): void {
    const stages = cloneStages(this._config?.stages ?? []);
    stages[stageIndex] = {
      ...stages[stageIndex],
      switches: rows,
    };
    this._updateConfig({ stages });
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const switches = (this._config.switches ?? []).map(normalizeSwitch);
    const stages = this._config.stages ?? [];

    return html`
      <div class="form">
        <ha-textfield
          label="Title"
          .value=${this._config.title ?? ""}
          placeholder="Staged Switch Control"
          @input=${this._titleChanged}
        ></ha-textfield>

        <ha-entity-picker
          .hass=${this.hass}
          .value=${this._config.entity ?? ""}
          label="Stage helper (input_number)"
          .includeDomains=${["input_number"]}
          allow-custom-entity
          @value-changed=${this._entityChanged}
        ></ha-entity-picker>

        <ha-entity-picker
          .hass=${this.hass}
          .value=${this._config.power_entity ?? ""}
          label="Power entity (input_boolean)"
          .includeDomains=${["input_boolean"]}
          allow-custom-entity
          @value-changed=${this._powerEntityChanged}
        ></ha-entity-picker>
        <span class="help">
          Optional. Remembers on/off in Home Assistant. The stage helper keeps
          the last stage when you turn the group off.
        </span>

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
            Each stage is a named combination. Entities can be on in one stage
            and off in another. Cumulative mode starts with all-off and turns
            on one more entity per stage. Explicit mode sets on/off for every
            entity in every stage.
          </span>
        </label>

        <div class="inline">
          <span class="label">Directly control switches</span>
          <input
            type="checkbox"
            .checked=${this._config.direct_control !== false}
            @change=${this._directControlChanged}
          />
        </div>
        <div class="inline">
          <span class="label">Show entity buttons</span>
          <input
            type="checkbox"
            .checked=${this._config.show_switches !== false}
            @change=${this._showSwitchesChanged}
          />
        </div>
        <div class="inline">
          <span class="label">Show stage labels</span>
          <input
            type="checkbox"
            .checked=${this._config.show_stage_labels !== false}
            @change=${this._showLabelsChanged}
          />
        </div>

        ${this._mode === "cumulative"
          ? html`
              ${this._resolvedStages.length
                ? html`
                    <div class="row">
                      <span class="label">Stage names</span>
                      <span class="help">
                        These labels appear under the stage buttons. They name
                        the combination, not a single entity.
                      </span>
                      <div class="list">
                        ${this._resolvedStages.map(
                          (stage, index) => html`
                            <ha-textfield
                              label="Stage ${index}"
                              .value=${this._config?.stage_names?.[index] ?? stage.name}
                              placeholder=${stage.name}
                              @input=${(ev: Event) => this._stageLabelChanged(index, ev)}
                            ></ha-textfield>
                          `,
                        )}
                      </div>
                    </div>
                  `
                : nothing}
              <div class="row">
                <span class="label">Switches</span>
                <div class="list">
                  ${switches.map(
                    (item, index) => html`
                      <div class="item">
                        <div class="item-head">
                          <span class="label">Switch ${index + 1}</span>
                          <button type="button" @click=${() => this._removeSwitch(index)}>
                            Remove
                          </button>
                        </div>
                        <ha-entity-picker
                          .hass=${this.hass}
                          .value=${item.entity}
                          label="Entity"
                          .includeDomains=${["switch", "light", "fan", "input_boolean"]}
                          allow-custom-entity
                          @value-changed=${(ev: CustomEvent<{ value?: string }>) =>
                            this._switchEntityChanged(index, ev)}
                        ></ha-entity-picker>
                      </div>
                    `,
                  )}
                </div>
                <div class="actions">
                  <button type="button" @click=${this._addSwitch}>Add switch</button>
                </div>
              </div>
            `
          : html`
              <div class="row">
                <span class="label">Stages</span>
                <div class="list">
                  ${stages.map((stage, stageIndex) => {
                    const rows = this._stageSwitchRows(stage);
                    return html`
                      <div class="item">
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
                          @input=${(ev: Event) => this._stageNameChanged(stageIndex, ev)}
                        ></ha-textfield>
                        ${rows.map(
                          (row, entityIndex) => html`
                            <ha-entity-picker
                              .hass=${this.hass}
                              .value=${row.entity}
                              label="Switch"
                              .includeDomains=${["switch", "light", "fan", "input_boolean"]}
                              allow-custom-entity
                              @value-changed=${(ev: CustomEvent<{ value?: string }>) =>
                                this._stageSwitchEntityChanged(
                                  stageIndex,
                                  entityIndex,
                                  ev,
                                )}
                            ></ha-entity-picker>
                            <div class="inline">
                              <select
                                .value=${row.state}
                                @change=${(ev: Event) =>
                                  this._stageSwitchStateChanged(
                                    stageIndex,
                                    entityIndex,
                                    ev,
                                  )}
                              >
                                <option value="off">Off</option>
                                <option value="on">On</option>
                              </select>
                              <button
                                type="button"
                                @click=${() =>
                                  this._removeStageSwitch(stageIndex, entityIndex)}
                              >
                                Remove switch
                              </button>
                            </div>
                          `,
                        )}
                        <div class="actions">
                          <button
                            type="button"
                            @click=${() => this._addStageSwitch(stageIndex)}
                          >
                            Add switch to stage
                          </button>
                        </div>
                      </div>
                    `;
                  })}
                </div>
                <div class="actions">
                  <button type="button" @click=${this._addStage}>Add stage</button>
                </div>
              </div>
            `}
      </div>
    `;
  }

  static styles = editorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "staged-switch-card-editor": StagedSwitchCardEditor;
  }
}

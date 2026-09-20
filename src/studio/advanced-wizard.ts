import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  callHassService,
  entityDisplayName,
  fireEvent,
  friendlyActionError,
  isLightEntity,
  isRgbCapableLight,
  isValidEntityId,
} from "../shared";
import type { HomeAssistant } from "../shared/types";
import { normalizeHex } from "../cards/staged-lights/color";
import "./assign";
import "./bulk";
import { STUDIO_ADVANCED_WIZARD, STUDIO_RGB_PRESETS } from "./const";
import { studioEffectOptions } from "./effects";
import { persistStudioScenes } from "./bind";
import { slugify } from "./ids";
import {
  advancedLightToScenes,
  advancedLookForStage,
  emptyLookState,
  newAdvancedGroup,
  newAdvancedLightDraft,
  newAdvancedLook,
} from "./advanced";
import {
  asRgbPercent,
  DEFAULT_RGB_PERCENT,
  studioIntensityNames,
  studioStageCount,
} from "./lights";
import { studioStyles } from "./styles";
import type {
  AdvancedGroup,
  AdvancedLightDraft,
  AdvancedLookState,
  LightSceneLook,
  SceneConfig,
  StudioWizardStep,
} from "./types";

const STEPS: StudioWizardStep[] = ["entities", "name", "groups", "stages", "review"];
const STEP_LABEL: Record<StudioWizardStep, string> = {
  entities: "Entities",
  name: "Name",
  groups: "Groups",
  stages: "Looks / States",
  edit: "Live edit",
  review: "Finish",
};

const cloneLooks = (
  looks?: Record<string, Record<string, LightSceneLook>>,
): Record<string, Record<string, LightSceneLook>> =>
  Object.fromEntries(
    Object.entries(looks ?? {}).map(([slot, entities]) => [
      slot,
      Object.fromEntries(
        Object.entries(entities).map(([entityId, look]) => [entityId, { ...look }]),
      ),
    ]),
  );

const cloneGroup = (group: AdvancedGroup): AdvancedGroup => ({
  ...group,
  entities: [...group.entities],
  sceneLooks: cloneLooks(group.sceneLooks),
});

const cloneDraft = (draft: AdvancedLightDraft): AdvancedLightDraft => ({
  ...draft,
  entities: [...draft.entities],
  groups: (draft.groups ?? []).map(cloneGroup),
  looks: (draft.looks ?? []).map((look) => ({
    name: look.name,
    entities: Object.fromEntries(
      Object.entries(look.entities).map(([entityId, state]) => [
        entityId,
        { ...state },
      ]),
    ),
  })),
});

@customElement(STUDIO_ADVANCED_WIZARD)
export class SceneStudioAdvancedWizard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public draft: AdvancedLightDraft =
    newAdvancedLightDraft();
  @property({ type: Boolean }) public slugLocked = false;
  @property({ attribute: false }) public previousIds: string[] = [];
  @property({ type: Number }) public session = 0;

  @state() private _draft: AdvancedLightDraft = newAdvancedLightDraft();
  @state() private _step: StudioWizardStep = "entities";
  @state() private _error?: string;
  @state() private _busy = false;
  @state() private _slugTouched = false;
  private _clonedSession?: number;

  static styles = studioStyles;

  protected willUpdate(_changed: PropertyValues): void {
    if (this._clonedSession !== this.session) {
      this._clonedSession = this.session;
      this._draft = cloneDraft(this.draft);
      this._step = "entities";
      this._error = undefined;
      this._slugTouched = false;
    }
  }

  private get _scenes(): SceneConfig[] {
    return advancedLightToScenes(this._draft, this.hass);
  }

  private get _stepIndex(): number {
    return STEPS.indexOf(this._step);
  }

  private _patch(patch: Partial<AdvancedLightDraft>): void {
    this._draft = { ...this._draft, ...patch };
    this._error = undefined;
  }

  private _entityName(entityId: string): string {
    return entityDisplayName(this.hass, entityId);
  }

  private _syncLooks(entities: string[]): AdvancedLightDraft["looks"] {
    return this._draft.looks.map((look) => ({
      name: look.name,
      entities: Object.fromEntries(
        entities.map((entityId) => [
          entityId,
          look.entities[entityId] ?? emptyLookState(entityId),
        ]),
      ),
    }));
  }

  private _ensureRgbGroup(rgbIds: string[]): AdvancedGroup[] {
    const groups = this._draft.groups.map(cloneGroup);
    let rgb = groups.find((group) => group.name.trim().toLowerCase() === "rgb");
    if (!rgb) {
      groups.unshift(newAdvancedGroup("RGB", rgbIds));
      return groups;
    }
    const rgbGroup = rgb;
    rgbIds.forEach((entityId) => {
      if (!rgbGroup.entities.includes(entityId)) {
        rgbGroup.entities.push(entityId);
      }
    });
    return groups;
  }

  private _addEntities(entityIds: string[]): void {
    const entities = [...this._draft.entities];
    const addedRgb: string[] = [];
    entityIds.forEach((entityId) => {
      if (!isValidEntityId(entityId) || entities.includes(entityId)) {
        return;
      }
      entities.push(entityId);
      if (isRgbCapableLight(this.hass, entityId)) {
        addedRgb.push(entityId);
      }
    });
    if (entities.length === this._draft.entities.length) {
      return;
    }
    this._patch({
      entities,
      looks: this._syncLooks(entities),
      groups: addedRgb.length ? this._ensureRgbGroup(addedRgb) : this._draft.groups,
    });
  }

  private _bulkAdd(ev: Event): void {
    const entities = (ev as CustomEvent<{ entities?: string[] }>).detail?.entities;
    this._addEntities(entities ?? []);
  }

  private _removeEntity(index: number): void {
    const entityId = this._draft.entities[index];
    const entities = this._draft.entities.filter((_, item) => item !== index);
    this._patch({
      entities,
      looks: this._syncLooks(entities),
      groups: this._draft.groups.map((group) => ({
        ...group,
        entities: group.entities.filter((id) => id !== entityId),
      })),
    });
  }

  private _addGroup(): void {
    this._patch({
      groups: [
        ...this._draft.groups,
        newAdvancedGroup(`Group ${this._draft.groups.length + 1}`),
      ],
    });
  }

  private _groupPatch(index: number, patch: Partial<AdvancedGroup>): void {
    const groups = this._draft.groups.map(cloneGroup);
    const current = groups[index];
    if (!current) {
      return;
    }
    groups[index] = { ...current, ...patch };
    this._patch({ groups });
  }

  private _setGroupSceneLook(
    index: number,
    stage: number,
    entityId: string,
    patch: Partial<LightSceneLook>,
  ): void {
    const group = this._draft.groups[index];
    if (!group) {
      return;
    }
    const count = studioStageCount(group.entities, group.stages);
    const current = advancedLookForStage(group, stage, count, entityId);
    const sceneLooks = cloneLooks(group.sceneLooks);
    const key = String(stage);
    sceneLooks[key] = {
      ...(sceneLooks[key] ?? {}),
      [entityId]: { ...current, ...patch },
    };
    this._groupPatch(index, { sceneLooks });
  }

  private _toggleGroupEntity(index: number, entityId: string): void {
    const group = this._draft.groups[index];
    if (!group) {
      return;
    }
    const entities = group.entities.includes(entityId)
      ? group.entities.filter((id) => id !== entityId)
      : [...group.entities, entityId];
    this._groupPatch(index, { entities });
  }

  private _nameInput(ev: Event): void {
    const name = (ev.target as HTMLInputElement).value;
    const slug =
      this.slugLocked || this._slugTouched ? this._draft.slug : slugify(name);
    this._patch({ name, slug });
  }

  private _slugInput(ev: Event): void {
    this._slugTouched = true;
    this._patch({ slug: slugify((ev.target as HTMLInputElement).value) });
  }

  private _addLook(): void {
    const index = this._draft.looks.length + 1;
    this._patch({
      looks: [...this._draft.looks, newAdvancedLook(this._draft.entities, `Look ${index}`)],
    });
  }

  private _removeLook(index: number): void {
    this._patch({
      looks: this._draft.looks.filter((_, item) => item !== index),
    });
  }

  private _lookName(index: number, ev: Event): void {
    const looks = [...this._draft.looks];
    const current = looks[index];
    if (!current) {
      return;
    }
    looks[index] = { ...current, name: (ev.target as HTMLInputElement).value };
    this._patch({ looks });
  }

  private _lookState(
    index: number,
    entityId: string,
    patch: Partial<AdvancedLookState>,
  ): void {
    const looks = [...this._draft.looks];
    const current = looks[index];
    if (!current) {
      return;
    }
    const prev = current.entities[entityId] ?? emptyLookState(entityId);
    looks[index] = {
      ...current,
      entities: {
        ...current.entities,
        [entityId]: { ...prev, ...patch },
      },
    };
    this._patch({ looks });
  }

  private _canNext(): boolean {
    if (this._step === "entities") {
      return this._draft.entities.some(isValidEntityId);
    }
    if (this._step === "name") {
      return Boolean(this._draft.name.trim() && this._draft.slug.trim());
    }
    if (this._step === "groups") {
      return this._draft.groups.some((group) => group.entities.length > 0);
    }
    return this._scenes.length > 0;
  }

  private _assignEntity(ev: Event): void {
    const { groupId, entityId } = (ev as CustomEvent<{
      groupId?: string;
      entityId?: string;
    }>).detail ?? {};
    const index = this._draft.groups.findIndex((group) => group.id === groupId);
    const group = this._draft.groups[index];
    if (!group || !entityId || group.entities.includes(entityId)) {
      return;
    }
    this._groupPatch(index, { entities: [...group.entities, entityId] });
  }

  private _unassignEntity(ev: Event): void {
    const { groupId, entityId } = (ev as CustomEvent<{
      groupId?: string;
      entityId?: string;
    }>).detail ?? {};
    const index = this._draft.groups.findIndex((group) => group.id === groupId);
    if (index < 0 || !entityId) {
      return;
    }
    if (this._draft.groups[index]?.entities.includes(entityId)) {
      this._toggleGroupEntity(index, entityId);
    }
  }

  private _groupNamed(ev: Event): void {
    const { groupId, name } = (ev as CustomEvent<{
      groupId?: string;
      name?: string;
    }>).detail ?? {};
    const index = this._draft.groups.findIndex((group) => group.id === groupId);
    if (index < 0) {
      return;
    }
    this._groupPatch(index, { name: name ?? "" });
  }

  private _groupRemoved(ev: Event): void {
    const groupId = (ev as CustomEvent<{ groupId?: string }>).detail?.groupId;
    this._patch({
      groups: this._draft.groups.filter((group) => group.id !== groupId),
    });
  }

  private _go(step: StudioWizardStep): void {
    this._step = step;
    this._error = undefined;
  }

  private async _persist(): Promise<boolean> {
    const scenes = this._scenes;
    if (!scenes.length || !this._draft.slug.trim()) {
      return true;
    }
    if (this._busy) {
      return false;
    }
    this._busy = true;
    this._error = undefined;
    try {
      await persistStudioScenes(this.hass, scenes, this.previousIds);
      fireEvent(this, "studio-look-saved", {
        draft: this._draft,
        scenes,
      });
      return true;
    } catch (error) {
      this._error = friendlyActionError(error, "Could not save scenes");
      return false;
    } finally {
      this._busy = false;
    }
  }

  private async _leaveTo(step: StudioWizardStep): Promise<void> {
    if (this._busy || step === this._step) {
      return;
    }
    if (!(await this._persist())) {
      return;
    }
    this._go(step);
  }

  private _next(): void {
    const index = this._stepIndex;
    if (index < STEPS.length - 1 && this._canNext()) {
      void this._leaveTo(STEPS[index + 1] ?? "review");
    }
  }

  private _back(): void {
    const index = this._stepIndex;
    if (index > 0) {
      void this._leaveTo(STEPS[index - 1] ?? "entities");
    } else {
      fireEvent(this, "studio-cancel");
    }
  }

  private async _try(scene: SceneConfig): Promise<void> {
    if (!this.hass) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    try {
      await callHassService(this.hass, "scene", "apply", { entities: scene.entities });
    } catch (error) {
      this._error = friendlyActionError(error, "Could not apply scene");
    } finally {
      this._busy = false;
    }
  }

  private async _save(): Promise<void> {
    const scenes = this._scenes;
    if (!scenes.length) {
      this._error = "Add at least one entity first.";
      return;
    }
    if (!(await this._persist())) {
      return;
    }
    fireEvent(this, "studio-save", {
      draft: this._draft,
      scenes,
      previousIds: this.previousIds,
      written: true,
    });
  }

  private _renderEntities() {
    return html`
      <div class="form">
        <p class="help">
          Search by name or entity id, or filter by area and then device. Tap a
          match to add it. You can also add every unused light and switch in the
          current filter.
        </p>
        <scene-studio-bulk-pick
          .hass=${this.hass}
          .used=${this._draft.entities}
          @studio-add-entities=${this._bulkAdd}
        ></scene-studio-bulk-pick>
        <div class="chips">
          ${this._draft.entities.map(
            (entityId, index) => html`
              <div class="chip">
                <span>${this._entityName(entityId)}</span>
                <button class="ghost" type="button" @click=${() => this._removeEntity(index)}>
                  Remove
                </button>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  private _renderName() {
    return html`
      <div class="form">
        <label class="field">
          <span>Scene set name</span>
          <input
            type="text"
            placeholder="Movie night"
            .value=${this._draft.name}
            @input=${this._nameInput}
          />
        </label>
        <label class="field">
          <span>Scene id prefix</span>
          <input
            type="text"
            .value=${this._draft.slug}
            ?disabled=${this.slugLocked}
            @input=${this._slugInput}
          />
          <span class="help">
            Home Assistant scenes will be sla_${this._draft.slug || "movie"}_00
            (Off / Default, all lights off), then _01, _02… Automations call
            <code>scene.turn_on</code>.
          </span>
        </label>
      </div>
    `;
  }

  private _renderEntityLook(index: number, entityId: string) {
    const look =
      this._draft.looks[index]?.entities[entityId] ?? emptyLookState(entityId);
    const on = look.state === "on";
    const rgb = isRgbCapableLight(this.hass, entityId);
    return html`
      <div class="chip assign">
        <label class="inline tight">
          <span>${this._entityName(entityId)}</span>
          <select
            .value=${look.state}
            @change=${(ev: Event) =>
              this._lookState(index, entityId, {
                state: (ev.target as HTMLSelectElement).value === "on" ? "on" : "off",
                brightness: look.brightness ?? DEFAULT_RGB_PERCENT,
                hex: look.hex,
              })}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        ${on && isLightEntity(entityId)
          ? html`
              <label class="field compact">
                <span>${asRgbPercent(look.brightness)}%</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  .value=${String(asRgbPercent(look.brightness))}
                  @input=${(ev: Event) =>
                    this._lookState(index, entityId, {
                      brightness: asRgbPercent((ev.target as HTMLInputElement).value),
                    })}
                />
              </label>
            `
          : nothing}
        ${on && rgb
          ? html`
              <div class="presets">
                ${STUDIO_RGB_PRESETS.map(
                  (hex) => html`
                    <button
                      class="swatch ${normalizeHex(look.hex, "") === hex ? "active" : ""}"
                      type="button"
                      style="--swatch:${hex}"
                      @click=${() => this._lookState(index, entityId, { hex })}
                    ></button>
                  `,
                )}
                <label class="field compact">
                  <span>Custom</span>
                  <input
                    type="color"
                    .value=${normalizeHex(look.hex, "#ff8a1d")}
                    @input=${(ev: Event) =>
                      this._lookState(index, entityId, {
                        hex: normalizeHex((ev.target as HTMLInputElement).value, "#ff8a1d"),
                      })}
                  />
                </label>
              </div>
              <label class="field effect-card">
                <span>Effect</span>
                <select
                  .value=${look.effect ?? ""}
                  @change=${(ev: Event) =>
                    this._lookState(index, entityId, {
                      effect: (ev.target as HTMLSelectElement).value,
                    })}
                >
                  ${studioEffectOptions(this.hass, [entityId]).map(
                    (option) => html`
                      <option value=${option.id}>${option.label}</option>
                    `,
                  )}
                </select>
              </label>
            `
          : nothing}
      </div>
    `;
  }

  private _renderGroups() {
    return html`
      <div class="form">
        <scene-studio-assign
          .hass=${this.hass}
          .entities=${this._draft.entities}
          .groups=${this._draft.groups.map((group) => ({
            id: group.id,
            name: group.name,
            entities: group.entities,
            editable: true,
          }))}
          editable
          @studio-assign=${this._assignEntity}
          @studio-unassign=${this._unassignEntity}
          @studio-group-name=${this._groupNamed}
          @studio-group-remove=${this._groupRemoved}
          @studio-group-add=${this._addGroup}
        ></scene-studio-assign>
      </div>
    `;
  }

  private _renderGroupEntity(
    group: AdvancedGroup,
    index: number,
    stage: number,
    count: number,
    entityId: string,
  ) {
    const look = advancedLookForStage(group, stage, count, entityId);
    const on = look.state === "on";
    const rgb = isRgbCapableLight(this.hass, entityId);
    return html`
      <div class="chip assign">
        <label class="inline tight">
          <span>${this._entityName(entityId)}</span>
          <select
            .value=${look.state}
            @change=${(ev: Event) =>
              this._setGroupSceneLook(index, stage, entityId, {
                state: (ev.target as HTMLSelectElement).value === "on" ? "on" : "off",
              })}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
        ${on && isLightEntity(entityId)
          ? html`
              <label class="field compact">
                <span>${asRgbPercent(look.brightness)}%</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  .value=${String(asRgbPercent(look.brightness))}
                  @input=${(ev: Event) =>
                    this._setGroupSceneLook(index, stage, entityId, {
                      brightness: asRgbPercent((ev.target as HTMLInputElement).value),
                    })}
                />
              </label>
            `
          : nothing}
        ${on && rgb
          ? html`
              <div class="presets">
                ${STUDIO_RGB_PRESETS.map(
                  (hex) => html`
                    <button
                      class="swatch ${normalizeHex(look.hex, "") === hex ? "active" : ""}"
                      type="button"
                      style="--swatch:${hex}"
                      @click=${() =>
                        this._setGroupSceneLook(index, stage, entityId, { hex })}
                    ></button>
                  `,
                )}
                <label class="field compact">
                  <span>Custom</span>
                  <input
                    type="color"
                    .value=${normalizeHex(look.hex, "#ff8a1d")}
                    @input=${(ev: Event) =>
                      this._setGroupSceneLook(index, stage, entityId, {
                        hex: normalizeHex(
                          (ev.target as HTMLInputElement).value,
                          "#ff8a1d",
                        ),
                      })}
                  />
                </label>
              </div>
              <label class="field effect-card">
                <span>Effect</span>
                <select
                  .value=${look.effect ?? ""}
                  @change=${(ev: Event) =>
                    this._setGroupSceneLook(index, stage, entityId, {
                      effect: (ev.target as HTMLSelectElement).value,
                    })}
                >
                  ${studioEffectOptions(this.hass, [entityId]).map(
                    (option) => html`
                      <option value=${option.id}>${option.label}</option>
                    `,
                  )}
                </select>
              </label>
            `
          : nothing}
      </div>
    `;
  }

  private _renderGroup(group: AdvancedGroup, index: number) {
    const count = studioStageCount(group.entities, group.stages);
    const names = studioIntensityNames(count);
    return html`
      <div class="row-card ${group.entities.length ? "" : "pending"}">
        <div class="item-head">
          <strong>${group.name.trim() || `Group ${index + 1}`}</strong>
          <span class="help">${group.entities.length} entities</span>
        </div>
        ${group.entities.length
          ? html`
              <div class="stage-dots">
                ${names.map(
                  (label) => html`<span class="stage-dot">${label}</span>`,
                )}
                <button
                  class="ghost"
                  type="button"
                  @click=${() => this._groupPatch(index, { stages: count + 1 })}
                >
                  Add stage
                </button>
                <button
                  class="ghost"
                  type="button"
                  ?disabled=${count <= 1}
                  @click=${() => this._groupPatch(index, { stages: count - 1 })}
                >
                  Remove
                </button>
              </div>
              ${names.map(
                (label, stageIndex) => html`
                  <div class="row-card">
                    <div class="item-head">
                      <strong>${label}</strong>
                      <span class="help">Set each entity for this scene</span>
                    </div>
                    ${group.entities.map((entityId) =>
                      this._renderGroupEntity(
                        group,
                        index,
                        stageIndex + 1,
                        count,
                        entityId,
                      ),
                    )}
                  </div>
                `,
              )}
            `
          : html`<p class="help">Assign entities on Groups first.</p>`}
      </div>
    `;
  }

  private _renderStages() {
    return html`
      <div class="form">
        <p class="help">
          Set on/off, brightness, and color for each entity in each scene. Add
          or remove stages as needed.
        </p>
        ${this._draft.groups.map((group, index) => this._renderGroup(group, index))}
        <p class="help">
          Extra custom scenes can still mix on/off, brightness, and color per
          entity.
        </p>
        ${this._draft.looks.map(
          (look, index) => html`
            <div class="row-card">
              <div class="item-head">
                <input
                  type="text"
                  .value=${look.name}
                  placeholder=${`Look ${index + 1}`}
                  @input=${(ev: Event) => this._lookName(index, ev)}
                />
                <button class="ghost" type="button" @click=${() => this._removeLook(index)}>
                  Remove
                </button>
              </div>
              ${this._draft.entities.map((entityId) =>
                this._renderEntityLook(index, entityId),
              )}
            </div>
          `,
        )}
        <button class="secondary" type="button" @click=${this._addLook}>
          Add scene
        </button>
      </div>
    `;
  }

  private _renderReview() {
    const scenes = this._scenes;
    const entities = this._draft.entities.filter(isValidEntityId);
    if (!scenes.length) {
      return html`<p class="help">Add entities first.</p>`;
    }
    return html`
      <div class="form">
        <p class="help">
          ${scenes.length} Home Assistant scenes will be created or updated.
        </p>
        <table>
          <thead>
            <tr>
              <th>Scene</th>
              ${entities.map(
                (entityId) => html`<th>${this._entityName(entityId)}</th>`,
              )}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${scenes.map(
              (scene) => html`
                <tr>
                  <td>
                    ${scene.name}
                    <div class="help">${scene.id}</div>
                  </td>
                  ${entities.map((entityId) => {
                    const on = scene.entities[entityId]?.state === "on";
                    return html`<td class=${on ? "on" : "off"}>${on ? "On" : "Off"}</td>`;
                  })}
                  <td>
                    <button
                      class="ghost"
                      type="button"
                      ?disabled=${this._busy}
                      @click=${() => this._try(scene)}
                    >
                      Try
                    </button>
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  protected render() {
    return html`
      <div class="steps steps-5">
        ${STEPS.map((step, index) => {
          const current = this._stepIndex;
          return html`
            <button
              class="step ${step === this._step ? "active" : ""} ${index < current ? "done" : ""}"
              type="button"
              @click=${() => {
                if (index <= current || this._canNext()) {
                  void this._leaveTo(step);
                }
              }}
            >
              <span class="dot">${index + 1}</span>
              ${STEP_LABEL[step]}
            </button>
          `;
        })}
      </div>
      <div class="card">
        ${this._step === "entities"
          ? this._renderEntities()
          : this._step === "name"
            ? this._renderName()
            : this._step === "groups"
              ? this._renderGroups()
              : this._step === "stages"
                ? this._renderStages()
                : this._renderReview()}
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        <div class="footer">
          <button class="ghost" type="button" @click=${this._back}>
            ${this._stepIndex === 0 ? "Cancel" : "Back"}
          </button>
          <div class="nav">
            ${this._step === "review"
              ? html`
                  <button
                    class="primary"
                    type="button"
                    ?disabled=${this._busy || !this._canNext()}
                    @click=${this._save}
                  >
                    Finish
                  </button>
                `
              : html`
                  <button
                    class="primary"
                    type="button"
                    ?disabled=${this._busy || !this._canNext()}
                    @click=${this._next}
                  >
                    Next
                  </button>
                `}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [STUDIO_ADVANCED_WIZARD]: SceneStudioAdvancedWizard;
  }
}

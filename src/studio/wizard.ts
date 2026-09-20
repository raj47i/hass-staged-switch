import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { callHassService, entityDisplayName, fireEvent, friendlyActionError, isGeneratedEntityLabel, isValidEntityId } from "../shared";
import type { HomeAssistant, SwitchState } from "../shared/types";
import "./bulk";
import { OFF_LABEL, STUDIO_WIZARD } from "./const";
import { persistStudioScenes } from "./bind";
import { slugify } from "./ids";
import { newSwitchGroupDraft, switchGroupToScenes } from "./scenes";
import { studioStyles } from "./styles";
import type { SceneConfig, SwitchGroupDraft, StudioWizardStep } from "./types";

const STEPS: StudioWizardStep[] = ["entities", "name", "stages", "review"];
const STEP_LABEL: Record<StudioWizardStep, string> = {
  entities: "Entities",
  name: "Name",
  groups: "Groups",
  stages: "Scenes",
  edit: "Live edit",
  review: "Finish",
};

const cloneDraft = (draft: SwitchGroupDraft): SwitchGroupDraft => ({
  ...draft,
  entities: [...draft.entities],
  stage_names: [...draft.stage_names],
  stages: draft.stages?.map((stage) => ({
    ...stage,
    switches: { ...stage.switches },
  })),
});

@customElement(STUDIO_WIZARD)
export class SceneStudioWizard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public draft: SwitchGroupDraft = newSwitchGroupDraft();
  @property({ type: Boolean }) public slugLocked = false;
  @property({ attribute: false }) public previousIds: string[] = [];
  @property({ type: Number }) public session = 0;

  @state() private _draft: SwitchGroupDraft = newSwitchGroupDraft();
  @state() private _step: StudioWizardStep = "name";
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

  private _namedStages(draft: SwitchGroupDraft): string[] {
    const entities = draft.entities.filter(isValidEntityId);
    return [
      OFF_LABEL,
      ...entities.map((entityId, index) => {
        const live = this._entityName(entityId);
        const named = draft.stage_names[index + 1]?.trim();
        if (
          named &&
          named !== `Stage ${index + 1}` &&
          !isGeneratedEntityLabel(named, entityId, live)
        ) {
          return named;
        }
        return live;
      }),
    ];
  }

  private get _scenes(): SceneConfig[] {
    return switchGroupToScenes({
      ...this._draft,
      stage_names: this._namedStages(this._draft),
    });
  }

  private get _stepIndex(): number {
    return STEPS.indexOf(this._step);
  }

  private _patch(patch: Partial<SwitchGroupDraft>): void {
    this._draft = { ...this._draft, ...patch };
    this._error = undefined;
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

  private _addEntities(entityIds: string[]): void {
    const next = [...this._draft.entities];
    entityIds.forEach((entityId) => {
      if (!isValidEntityId(entityId) || next.includes(entityId)) {
        return;
      }
      next.push(entityId);
    });
    if (next.length === this._draft.entities.length) {
      return;
    }
    this._patch({ entities: next });
  }

  private _bulkAdd(ev: Event): void {
    const entities = (ev as CustomEvent<{ entities?: string[] }>).detail?.entities;
    this._addEntities(entities ?? []);
  }

  private _moveEntity(index: number, delta: number): void {
    const next = [...this._draft.entities];
    const swap = index + delta;
    if (swap < 0 || swap >= next.length) {
      return;
    }
    const current = next[index];
    const other = next[swap];
    if (current === undefined || other === undefined) {
      return;
    }
    next[index] = other;
    next[swap] = current;
    this._patch({ entities: next });
  }

  private _removeEntity(index: number): void {
    this._patch({
      entities: this._draft.entities.filter((_, item) => item !== index),
    });
  }

  private _setMode(mode: SwitchGroupDraft["mode"]): void {
    if (mode === this._draft.mode) {
      return;
    }
    if (mode === "explicit") {
      const scenes = switchGroupToScenes({ ...this._draft, mode: "cumulative" });
      this._patch({
        mode,
        stages: scenes.map((scene) => ({
          name: scene.name.split(" · ").slice(1).join(" · ") || scene.name,
          switches: Object.fromEntries(
            Object.entries(scene.entities).map(([entity, look]) => [
              entity,
              look.state,
            ]),
          ),
        })),
        stage_names: scenes.map(
          (scene) => scene.name.split(" · ").slice(1).join(" · ") || scene.name,
        ),
      });
      return;
    }
    this._patch({ mode, stages: undefined });
  }

  private _stageName(index: number, ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    if (this._draft.mode === "explicit") {
      const stages = [...(this._draft.stages ?? [])];
      const current = stages[index];
      if (!current) {
        return;
      }
      stages[index] = { ...current, name: value };
      this._patch({ stages });
      return;
    }
    const names = [...this._draft.stage_names];
    names[index] = value;
    this._patch({ stage_names: names });
  }

  private _stageState(index: number, entityId: string, ev: Event): void {
    const state = (ev.target as HTMLSelectElement).value === "on" ? "on" : "off";
    const stages = [...(this._draft.stages ?? [])];
    const current = stages[index] ?? { name: `Stage ${index}`, switches: {} };
    stages[index] = {
      ...current,
      switches: { ...current.switches, [entityId]: state as SwitchState },
    };
    this._patch({ mode: "explicit", stages });
  }

  private _canNext(): boolean {
    if (this._step === "name") {
      return Boolean(this._draft.name.trim() && this._draft.slug.trim());
    }
    if (this._step === "entities") {
      return this._draft.entities.some(isValidEntityId);
    }
    return this._scenes.length > 0;
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
      this._error = "Add at least one on/off entity first.";
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

  private _entityName(entityId: string): string {
    return entityDisplayName(this.hass, entityId);
  }

  private _renderName() {
    return html`
      <div class="form">
        <label class="field">
          <span>Scene set name</span>
          <input
            type="text"
            class="text-input"
            placeholder="Patio"
            .value=${this._draft.name}
            @input=${this._nameInput}
          />
        </label>
        <label class="field">
          <span>Scene id prefix</span>
          <input
            type="text"
            class="text-input"
            .value=${this._draft.slug}
            ?disabled=${this.slugLocked}
            @input=${this._slugInput}
          />
          <span class="help">
            Scenes will be sst_${this._draft.slug || "patio"}_00 (Off), _01, _02…
            Changing this later would create a new scene set.
          </span>
        </label>
      </div>
    `;
  }

  private _renderEntities() {
    return html`
      <div class="form">
        <p class="help">
          Search by name or entity id, or filter by area and then device. Tap a
          match to add it. Order is the cumulative order after Off.
        </p>
        <scene-studio-bulk-pick
          .hass=${this.hass}
          .used=${this._draft.entities}
          @studio-add-entities=${this._bulkAdd}
        ></scene-studio-bulk-pick>
        <div class="list">
          ${this._draft.entities.map(
            (entityId, index) => html`
              <div class="item">
                <div class="item-head">
                  <span>${index + 1}. ${this._entityName(entityId)}</span>
                  <div class="nav">
                    <button
                      class="ghost"
                      type="button"
                      ?disabled=${index === 0}
                      @click=${() => this._moveEntity(index, -1)}
                    >
                      Up
                    </button>
                    <button
                      class="ghost"
                      type="button"
                      ?disabled=${index === this._draft.entities.length - 1}
                      @click=${() => this._moveEntity(index, 1)}
                    >
                      Down
                    </button>
                    <button class="ghost" type="button" @click=${() => this._removeEntity(index)}>
                      Remove
                    </button>
                  </div>
                </div>
                <span class="help">${entityId}</span>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  private _renderStages() {
    const scenes = this._scenes;
    const entities = this._draft.entities.filter(isValidEntityId);
    return html`
      <div class="form">
        <label class="field">
          <span>How stages work</span>
          <select
            @change=${(ev: Event) =>
              this._setMode(
                (ev.target as HTMLSelectElement).value === "explicit"
                  ? "explicit"
                  : "cumulative",
              )}
          >
            <option value="cumulative" ?selected=${this._draft.mode === "cumulative"}>
              Cumulative — each stage keeps earlier entities on
            </option>
            <option value="explicit" ?selected=${this._draft.mode === "explicit"}>
              Explicit — set on/off for every entity per stage
            </option>
          </select>
          <span class="help">
            Off is always included. Studio can create as many scenes as you
            need. Saving writes a normal Home Assistant scene for each row.
          </span>
        </label>
        ${this._draft.mode === "cumulative"
          ? html`
              <div class="list">
                ${scenes.map(
                  (scene, index) => html`
                    <label class="field">
                      <span>${index === 0 ? "Off" : `Stage ${index}`}</span>
                      <input
                        type="text"
                        .value=${this._namedStages(this._draft)[index] ?? scene.name.split(" · ").slice(1).join(" · ")}
                        ?disabled=${index === 0}
                        @input=${(ev: Event) => this._stageName(index, ev)}
                      />
                    </label>
                  `,
                )}
              </div>
            `
          : html`
              <div class="list">
                ${(this._draft.stages ?? []).map(
                  (stage, index) => html`
                    <div class="item">
                      <input
                        type="text"
                        .value=${stage.name ?? ""}
                        placeholder=${index === 0 ? OFF_LABEL : `Stage ${index}`}
                        @input=${(ev: Event) => this._stageName(index, ev)}
                      />
                      ${entities.map(
                        (entityId) => html`
                          <label class="inline">
                            <span>${this._entityName(entityId)}</span>
                            <select
                              .value=${stage.switches[entityId] ?? "off"}
                              @change=${(ev: Event) =>
                                this._stageState(index, entityId, ev)}
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
            `}
      </div>
    `;
  }

  private _renderReview() {
    const scenes = this._scenes;
    const entities = this._draft.entities.filter(isValidEntityId);
    if (!scenes.length) {
      return html`<p class="help">Add entities first to see the scenes.</p>`;
    }
    return html`
      <div class="form">
        <p class="help">
          ${scenes.length} Home Assistant scenes will be created or updated.
          Remotes can call <code>scene.turn_on</code> on any of them.
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
                    return html`
                      <td class=${on ? "on" : "off"}>${on ? "On" : "Off"}</td>
                    `;
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
      <div class="steps steps-4">
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
    [STUDIO_WIZARD]: SceneStudioWizard;
  }
}

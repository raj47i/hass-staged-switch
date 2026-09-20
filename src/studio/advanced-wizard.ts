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
  withTimeout,
} from "../shared";
import type { HomeAssistant } from "../shared/types";
import { normalizeHex } from "../cards/staged-lights/color";
import "./assign";
import "./bulk";
import {
  STUDIO_ADVANCED_WIZARD,
  STUDIO_PREVIEW_TIMEOUT_MS,
  STUDIO_RGB_PRESETS,
} from "./const";
import { studioEffectOptions } from "./effects";
import { persistStudioScenes, previewStudioScene } from "./bind";
import { slugify } from "./ids";
import { loadSceneConfig } from "./ha";
import {
  advancedGroupLevelNames,
  advancedLevelOverflow,
  advancedLightToScenes,
  cloneAdvancedDraft,
  cloneAdvancedLooks,
  DEFAULT_ADVANCED_LEVEL_TEXT,
  draftPatchFromAdvancedScene,
  emptyLookState,
  lookFromAdvancedSlot,
  newAdvancedGroup,
  newAdvancedLightDraft,
  newAdvancedLook,
  parseAdvancedLevelNames,
  reviewAdvancedSceneGroups,
  serializeAdvancedLevelNames,
  slotForAdvancedScene,
  trimAdvancedLooks,
  type AdvancedLookSlot,
} from "./advanced";
import {
  asRgbPercent,
  DEFAULT_RGB_PERCENT,
  lightSceneOnIds,
  lightSceneTitle,
} from "./lights";
import { resolveWizardStep, WIZARD_STEPS } from "./route";
import { studioStyles } from "./styles";
import type {
  AdvancedGroup,
  AdvancedLightDraft,
  AdvancedLookState,
  LightSceneLook,
  SceneConfig,
  StudioWizardStep,
} from "./types";

const STEPS = WIZARD_STEPS.advanced;
const STEP_LABEL: Record<StudioWizardStep, string> = {
  entities: "Entities",
  name: "Name",
  groups: "Groups",
  stages: "Looks / States",
  edit: "Looks / States",
  review: "Finish",
};

@customElement(STUDIO_ADVANCED_WIZARD)
export class SceneStudioAdvancedWizard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public draft: AdvancedLightDraft =
    newAdvancedLightDraft();
  @property({ type: Boolean }) public slugLocked = false;
  @property({ attribute: false }) public previousIds: string[] = [];
  @property({ type: Number }) public session = 0;
  @property() public step: StudioWizardStep = "name";

  @state() private _draft: AdvancedLightDraft = newAdvancedLightDraft();
  @state() private _step: StudioWizardStep = "name";
  @state() private _error?: string;
  @state() private _busy = false;
  @state() private _slugTouched = false;
  @state() private _collapsed: Record<string, boolean> = {};
  @state() private _liveSceneId?: string;
  @state() private _notice?: string;
  private _liveSnapshot?: AdvancedLightDraft;
  private _applying = false;
  private _applyAgain = false;
  private _intendedId?: string;
  private _flushPromise: Promise<void> = Promise.resolve();
  private _applyTimer?: number;
  private _openToken = 0;
  private _clonedSession?: number;

  static styles = studioStyles;

  public disconnectedCallback(): void {
    window.clearTimeout(this._applyTimer);
    super.disconnectedCallback();
  }

  protected willUpdate(_changed: PropertyValues): void {
    if (this._clonedSession !== this.session) {
      this._clonedSession = this.session;
      this._draft = cloneAdvancedDraft(this.draft);
      this._step = resolveWizardStep(STEPS, this.step);
      this._error = undefined;
      this._notice = undefined;
      this._slugTouched = false;
      this._collapsed = {};
      this._resetLive();
    }
  }

  protected updated(changed: PropertyValues): void {
    const step = resolveWizardStep(STEPS, this.step);
    if (
      this._clonedSession === this.session &&
      changed.has("step") &&
      step !== this._step
    ) {
      void this._leaveTo(step);
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
    if (this._liveSceneId) {
      void this._applyLive();
    }
  }

  private _liveLocked(): boolean {
    return Boolean(this._liveSceneId);
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
    const groups = this._draft.groups.map((group) => ({
      ...group,
      entities: [...group.entities],
    }));
    const rgb = groups.find((group) => group.name.trim().toLowerCase() === "rgb");
    if (!rgb) {
      groups.unshift(newAdvancedGroup("RGB", rgbIds));
      return groups;
    }
    rgbIds.forEach((entityId) => {
      if (!rgb.entities.includes(entityId)) {
        rgb.entities.push(entityId);
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

  private _addGroup(): void {
    this._patch({
      groups: [
        ...this._draft.groups,
        newAdvancedGroup(`Group ${this._draft.groups.length + 1}`),
      ],
    });
  }

  private _groupPatch(index: number, patch: Partial<AdvancedGroup>): void {
    const groups = this._draft.groups.map((group) => ({
      ...group,
      entities: [...group.entities],
    }));
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
    const current = lookFromAdvancedSlot(
      this._draft,
      {
        kind: "group",
        id: "",
        title: "",
        groupKey: group.id,
        groupLabel: group.name,
        entities: group.entities,
        groupIndex: index,
        stage,
      },
      entityId,
    );
    const sceneLooks = cloneAdvancedLooks(group.sceneLooks);
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

  private _persistName(): void {
    if (this._step === "name" && this._draft.name.trim() && this._draft.slug.trim()) {
      void this._persist();
    }
  }

  private _addLook(): void {
    const index = this._draft.looks.length + 1;
    this._patch({
      looks: [...this._draft.looks, newAdvancedLook(this._draft.entities, `Look ${index}`)],
    });
    void this._persist();
  }

  private _removeLook(index: number): void {
    this._patch({
      looks: this._draft.looks.filter((_, item) => item !== index),
    });
    void this._persist();
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

  private _liveSlot(): AdvancedLookSlot | undefined {
    return this._liveSceneId
      ? slotForAdvancedScene(this._draft, this._liveSceneId, this.hass)
      : undefined;
  }

  private _setLiveLook(entityId: string, patch: Partial<LightSceneLook>): void {
    const slot = this._liveSlot();
    if (!slot || slot.kind === "off") {
      return;
    }
    if (slot.kind === "group" && slot.groupIndex != null && slot.stage != null) {
      this._setGroupSceneLook(slot.groupIndex, slot.stage, entityId, patch);
      return;
    }
    if (slot.kind === "look" && slot.lookIndex != null) {
      this._lookState(slot.lookIndex, entityId, patch);
    }
  }

  private _canNext(): boolean {
    if (this._step === "entities") {
      return this._draft.entities.some(isValidEntityId);
    }
    if (this._step === "name") {
      return Boolean(this._draft.name.trim() && this._draft.slug.trim());
    }
    if (this._step === "groups") {
      return (
        this._draft.groups.some((group) => group.entities.length > 0) ||
        this._draft.looks.length > 0
      );
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

  private _setGroupLevels(ev: Event): void {
    const { groupId, value, commit } = (ev as CustomEvent<{
      groupId?: string;
      value?: string;
      commit?: boolean;
    }>).detail ?? {};
    const index = this._draft.groups.findIndex((group) => group.id === groupId);
    const group = this._draft.groups[index];
    if (index < 0 || !group) {
      return;
    }
    const text = value ?? "";
    if (!commit) {
      this._groupPatch(index, { levelText: text });
      return;
    }
    const names = parseAdvancedLevelNames(text);
    this._groupPatch(index, {
      levelText: serializeAdvancedLevelNames(names),
      levelNames: names,
      stages: names.length,
      sceneLooks: trimAdvancedLooks(group.sceneLooks, names.length),
    });
  }

  private _go(step: StudioWizardStep): void {
    if (this._liveLocked()) {
      return;
    }
    this._openToken += 1;
    this._busy = false;
    this._step = step;
    this._error = undefined;
    this._notice = undefined;
    fireEvent(this, "studio-step", { step });
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
    if (this._liveLocked() || this._busy || step === this._step) {
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
    if (this._liveLocked()) {
      return;
    }
    const index = this._stepIndex;
    if (index > 0) {
      void this._leaveTo(STEPS[index - 1] ?? "name");
    } else {
      fireEvent(this, "studio-cancel");
    }
  }

  private _resetLive(): void {
    this._openToken += 1;
    window.clearTimeout(this._applyTimer);
    this._liveSceneId = undefined;
    this._liveSnapshot = undefined;
    this._intendedId = undefined;
    this._applyAgain = false;
  }

  private _queueApply(id?: string): Promise<void> {
    this._intendedId = id;
    if (this._applying) {
      this._applyAgain = true;
      return this._flushPromise;
    }
    this._flushPromise = this._runApply();
    return this._flushPromise;
  }

  private async _runApply(): Promise<void> {
    this._applying = true;
    try {
      do {
        this._applyAgain = false;
        const id = this._intendedId;
        const current = id ? this._scenes.find((item) => item.id === id) : undefined;
        if (!this.hass || !current) {
          continue;
        }
        try {
          await callHassService(this.hass, "scene", "apply", { entities: current.entities });
        } catch (error) {
          this._error = friendlyActionError(error, "Could not apply look");
        }
      } while (this._applyAgain);
    } finally {
      this._applying = false;
    }
  }

  private _applyLive(): void {
    window.clearTimeout(this._applyTimer);
    this._applyTimer = window.setTimeout(() => {
      void this._queueApply(this._liveSceneId);
    }, 40);
  }

  private async _try(scene: SceneConfig | string): Promise<void> {
    const id = typeof scene === "string" ? scene : scene.id;
    const current = this._scenes.find((item) => item.id === id);
    const off = this._scenes[0];
    this._busy = true;
    this._error = undefined;
    try {
      await withTimeout(
        previewStudioScene(this.hass, id, current, off?.id === id ? undefined : off),
        STUDIO_PREVIEW_TIMEOUT_MS,
        "Device connection timed out",
      );
    } catch (error) {
      this._error = friendlyActionError(error, "Could not apply look");
    } finally {
      this._busy = false;
    }
  }

  private async _startLive(scene: SceneConfig): Promise<void> {
    const slot = slotForAdvancedScene(this._draft, scene, this.hass);
    if (!slot || slot.kind === "off" || this._liveLocked() || this._busy) {
      return;
    }
    const token = ++this._openToken;
    this._busy = true;
    this._error = undefined;
    this._notice = "Opening look…";
    try {
      const fallback = this._scenes.find((item) => item.id === scene.id) ?? scene;
      const off = this._scenes[0];
      let saved = fallback;
      try {
        saved = await withTimeout(
          loadSceneConfig(this.hass, scene.id),
          STUDIO_PREVIEW_TIMEOUT_MS,
          "Could not load look",
        );
      } catch {
        saved = fallback;
      }
      if (token !== this._openToken || this._step !== "edit") {
        return;
      }
      const patch = draftPatchFromAdvancedScene(this._draft, saved);
      if (patch) {
        this._draft = { ...this._draft, ...patch };
      }
      this._liveSnapshot = cloneAdvancedDraft(this._draft);
      this._liveSceneId = scene.id;
      this._notice = undefined;
      this._busy = false;
      void this._previewOpenedLook(scene.id, fallback, off, token);
    } catch (error) {
      if (token !== this._openToken) {
        return;
      }
      this._notice = undefined;
      this._error = friendlyActionError(error, "Could not open look");
      this._busy = false;
    }
  }

  private async _previewOpenedLook(
    id: string,
    fallback: SceneConfig,
    off: SceneConfig | undefined,
    token: number,
  ): Promise<void> {
    try {
      await withTimeout(
        previewStudioScene(this.hass, id, fallback, off),
        STUDIO_PREVIEW_TIMEOUT_MS,
        "Device connection timed out",
      );
    } catch (error) {
      if (token !== this._openToken || !this._liveSceneId) {
        return;
      }
      this._error = friendlyActionError(error, "Could not apply look");
    }
  }

  private _cancelLive(): void {
    if (this._busy) {
      return;
    }
    const id = this._liveSceneId;
    const snapshot = this._liveSnapshot;
    window.clearTimeout(this._applyTimer);
    this._resetLive();
    this._error = undefined;
    if (snapshot) {
      this._draft = snapshot;
    }
    if (id) {
      void this._queueApply(id);
    }
  }

  private async _saveLive(): Promise<void> {
    const scene = this._scenes.find((item) => item.id === this._liveSceneId);
    if (!scene) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    this._notice = "Saving look…";
    try {
      await persistStudioScenes(this.hass, this._scenes, this.previousIds);
      fireEvent(this, "studio-look-saved", {
        draft: this._draft,
        id: scene.id,
        scenes: this._scenes,
      });
      this._resetLive();
      this._notice = "Look saved.";
    } catch (error) {
      this._notice = undefined;
      this._error = error instanceof Error ? error.message : "Could not save look";
    } finally {
      this._busy = false;
    }
  }

  private async _save(): Promise<void> {
    if (this._liveLocked()) {
      return;
    }
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
          match to add it. These lights stay off on every look unless you add
          them to a group next.
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
          <span>Scene-set name</span>
          <input
            type="text"
            class="text-input"
            placeholder="Movie night"
            .value=${this._draft.name}
            @input=${this._nameInput}
            @blur=${this._persistName}
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
            @blur=${this._persistName}
          />
          <span class="help">
            Home Assistant scenes will be sla_${this._draft.slug || "movie"}_00
            (Off / Default, all lights off), then _01, _02… The card remembers
            the last look. Automations call
            <code>scene.turn_on</code>.
          </span>
        </label>
      </div>
    `;
  }

  private _renderGroups() {
    return html`
      <div class="form">
        <scene-studio-assign
          .hass=${this.hass}
          .entities=${this._draft.entities}
          .help=${"Drag an entity into a group, or tap one and then tap a group. Groups can overlap. Type level names split by |. Short names fit the card buttons. Only lights in a group change on that group's looks. The rest stay off. Add a custom look later if you need a mix that is not a group level."}
          .groups=${this._draft.groups.map((group) => {
            const text =
              group.levelText ??
              serializeAdvancedLevelNames(advancedGroupLevelNames(group));
            const overflow = advancedLevelOverflow(text);
            return {
              id: group.id,
              name: group.name,
              entities: group.entities,
              editable: true,
              showStages: true,
              levelInput: true,
              minEntities: 1,
              levels: text || DEFAULT_ADVANCED_LEVEL_TEXT,
              levelWarning: overflow
                ? "Only the first 7 names are used."
                : undefined,
            };
          })}
          editable
          @studio-assign=${this._assignEntity}
          @studio-unassign=${this._unassignEntity}
          @studio-group-name=${this._groupNamed}
          @studio-group-remove=${this._groupRemoved}
          @studio-group-add=${this._addGroup}
          @studio-group-levels=${this._setGroupLevels}
        ></scene-studio-assign>
      </div>
    `;
  }

  private _toggleGroup(key: string): void {
    this._collapsed = { ...this._collapsed, [key]: !this._collapsed[key] };
  }

  private _sceneSummary(scene: SceneConfig): string {
    const slot = slotForAdvancedScene(this._draft, scene, this.hass);
    const members = slot?.entities ?? [];
    if (!members.length) {
      return "All off";
    }
    const on = lightSceneOnIds(scene, members);
    if (!on.length) {
      return slot?.kind === "off" ? "All lights off" : "Group lights off";
    }
    return on.map((entityId) => this._entityName(entityId)).join(", ");
  }

  private _renderLiveEntity(slot: AdvancedLookSlot, entityId: string) {
    const look = lookFromAdvancedSlot(this._draft, slot, entityId);
    const on = look.state === "on";
    const light = on && isLightEntity(entityId);
    const rgb = light && isRgbCapableLight(this.hass, entityId);
    const percent = asRgbPercent(look.brightness ?? DEFAULT_RGB_PERCENT);
    return html`
      <div class="live-entity">
        <div class="live-entity-head">
          <strong title=${entityId}>${this._entityName(entityId)}</strong>
          <button
            class="toggle ${on ? "on" : ""}"
            type="button"
            @click=${() => this._setLiveLook(entityId, { state: on ? "off" : "on" })}
          >
            ${on ? "On" : "Off"}
          </button>
        </div>
        ${light
          ? html`
              <label class="field">
                <span>${percent}%</span>
                <input
                  class="bright-slider"
                  type="range"
                  min="1"
                  max="100"
                  .value=${String(percent)}
                  @input=${(ev: Event) =>
                    this._setLiveLook(entityId, {
                      brightness: asRgbPercent((ev.target as HTMLInputElement).value),
                    })}
                />
              </label>
            `
          : nothing}
        ${rgb
          ? html`
              <div class="presets">
                ${STUDIO_RGB_PRESETS.map(
                  (hex) => html`
                    <button
                      class="swatch ${normalizeHex(look.hex, "") === hex ? "active" : ""}"
                      type="button"
                      style="--swatch:${hex}"
                      @click=${() => this._setLiveLook(entityId, { hex })}
                    ></button>
                  `,
                )}
                <label class="field compact">
                  <span>Custom</span>
                  <input
                    type="color"
                    .value=${normalizeHex(look.hex, "#ff8a1d")}
                    @input=${(ev: Event) =>
                      this._setLiveLook(entityId, {
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
                    this._setLiveLook(entityId, {
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

  private _renderLookList(edit: boolean) {
    const groups = reviewAdvancedSceneGroups(this._draft, this.hass);
    if (!this._scenes.length) {
      return html`<p class="help">Assign a group or add a custom look to create scenes.</p>`;
    }
    return html`
      <div class="look-list">
        ${groups.map((group) => {
          const rows = group.scenes;
          if (!rows.length) {
            return nothing;
          }
          const open = this._collapsed[group.key] !== true;
          return html`
            <div class="look-group">
              <button
                class="group-toggle"
                type="button"
                aria-expanded=${open}
                @click=${() => this._toggleGroup(group.key)}
              >
                <span class="chevron" aria-hidden="true">${open ? "▼" : "▶"}</span>
                ${group.label}
                <span class="help">${rows.length}</span>
              </button>
              ${open
                ? rows.map((scene) => {
                    const slot = slotForAdvancedScene(this._draft, scene, this.hass);
                    const editable = slot != null && slot.kind !== "off";
                    return html`
                      <div class="look-item">
                        <div>
                          ${edit && slot?.kind === "look" && slot.lookIndex != null
                            ? html`
                                <input
                                  class="text-input"
                                  .value=${this._draft.looks[slot.lookIndex]?.name ?? ""}
                                  placeholder=${`Look ${slot.lookIndex + 1}`}
                                  @input=${(ev: Event) => this._lookName(slot.lookIndex!, ev)}
                                  @blur=${() => void this._persist()}
                                />
                              `
                            : html`<strong>${lightSceneTitle(scene)}</strong>`}
                          <div class="help">${this._sceneSummary(scene)}</div>
                        </div>
                        ${edit
                          ? editable
                            ? html`
                                <div class="nav">
                                  ${slot?.kind === "look" && slot.lookIndex != null
                                    ? html`
                                        <button
                                          class="ghost"
                                          type="button"
                                          ?disabled=${this._busy}
                                          @click=${() => this._removeLook(slot.lookIndex!)}
                                        >
                                          Remove
                                        </button>
                                      `
                                    : nothing}
                                  <button
                                    class="secondary"
                                    type="button"
                                    ?disabled=${this._busy}
                                    @click=${() => this._startLive(scene)}
                                  >
                                    Live edit
                                  </button>
                                </div>
                              `
                            : html`<span class="help">Always off</span>`
                          : html`
                              <button
                                class="ghost"
                                type="button"
                                ?disabled=${this._busy}
                                @click=${() => this._try(scene.id)}
                              >
                                Try
                              </button>
                            `}
                      </div>
                    `;
                  })
                : nothing}
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderLivePage(scene: SceneConfig) {
    const slot = slotForAdvancedScene(this._draft, scene, this.hass);
    const entities = slot?.entities ?? [];
    return html`
      <div class="form live-page">
        <div>
          <h2>${lightSceneTitle(scene)}</h2>
          <p class="help">
            This page loads the saved scene, not the lights' current state. Off /
            Default runs first, then this look. Toggles change the real lights.
            Save writes this look.
          </p>
        </div>
        ${slot
          ? html`
              <div class="live-entities">
                ${entities.map((entityId) => this._renderLiveEntity(slot, entityId))}
              </div>
            `
          : html`<p class="help">Default Off looks stay all off.</p>`}
      </div>
    `;
  }

  private _renderEdit() {
    const live = this._liveSceneId
      ? this._scenes.find((scene) => scene.id === this._liveSceneId)
      : undefined;
    if (live) {
      return this._renderLivePage(live);
    }
    return html`
      <div class="form">
        <p class="help">
          Off / Default is always all lights off and is not edited. Open a look
          to change its lights live. Save writes that look. Each step writes the
          full scene-set.
        </p>
        ${this._renderLookList(true)}
        <button class="secondary" type="button" @click=${this._addLook}>
          Add custom look
        </button>
      </div>
    `;
  }

  private _renderReview() {
    return html`
      <div class="form">
        <p class="help">
          ${this._scenes.length} exclusive Home Assistant scenes. Remotes call
          <code>scene.turn_on</code>.
        </p>
        ${this._renderLookList(false)}
      </div>
    `;
  }

  protected render() {
    const live = this._liveLocked();
    return html`
      ${live
        ? nothing
        : html`
            <div class="steps steps-5">
              ${STEPS.map((step, index) => {
                const current = this._stepIndex;
                return html`
                  <button
                    class="step ${step === this._step ? "active" : ""} ${index < current
                      ? "done"
                      : ""}"
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
          `}
      <div class="card">
        ${this._step === "entities"
          ? this._renderEntities()
          : this._step === "name"
            ? this._renderName()
            : this._step === "groups"
              ? this._renderGroups()
              : this._step === "edit"
                ? this._renderEdit()
                : this._renderReview()}
        ${this._notice ? html`<p class="muted">${this._notice}</p>` : nothing}
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        <div class="footer">
          ${live
            ? html`
                <button
                  class="ghost"
                  type="button"
                  ?disabled=${this._busy}
                  @click=${() => this._cancelLive()}
                >
                  Cancel
                </button>
                <div class="nav">
                  <button
                    class="primary"
                    type="button"
                    ?disabled=${this._busy}
                    @click=${() => this._saveLive()}
                  >
                    Save
                  </button>
                </div>
              `
            : html`
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
                          @click=${() => this._save()}
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
              `}
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

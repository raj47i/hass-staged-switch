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
  STUDIO_LIGHTS_WIZARD,
  STUDIO_PREVIEW_TIMEOUT_MS,
  STUDIO_RGB_PRESET_COUNT,
  STUDIO_RGB_PRESETS,
} from "./const";
import { studioEffectOptions } from "./effects";
import { parseLookSceneId, slugify } from "./ids";
import { loadSceneConfig } from "./ha";
import { persistStudioScenes, previewStudioScene } from "./bind";
import {
  allLightIds,
  asRgbPercent,
  cloneLightDraft,
  cloneLightLooks,
  DEFAULT_WHITES_STAGES,
  draftPatchFromSavedScene,
  entityLookForSlot,
  isMinimalDraft,
  lightGroupToScenes,
  lightSceneOnIds,
  lightSceneTitle,
  MIN_WHITES_ENTITIES,
  newLightGroupDraft,
  reviewSceneGroups,
  rowIds,
  slotForLightScene,
  STUDIO_ROW_META,
  studioRows,
  trimStageLooks,
  WARM_HEX,
  warmWhiteStageCount,
  WHITE_HEX,
  WHITES_STAGE_CHOICES,
  whitesStageCount,
  remapWhitesLooks,
  whitesStageHex,
  type SimpleLightSlot,
} from "./lights";
import { resolveWizardStep, WIZARD_STEPS } from "./route";
import { studioStyles } from "./styles";
import type {
  LightGroupDraft,
  LightRowId,
  LightSceneLook,
  SceneConfig,
  StudioWizardStep,
} from "./types";

const STEPS = WIZARD_STEPS.light;
const STEP_LABEL: Record<StudioWizardStep, string> = {
  entities: "Entities",
  name: "Name",
  groups: "Groups",
  stages: "Looks / States",
  edit: "Looks / States",
  review: "Finish",
};
@customElement(STUDIO_LIGHTS_WIZARD)
export class SceneStudioLightsWizard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public draft: LightGroupDraft = newLightGroupDraft();
  @property({ type: Boolean }) public slugLocked = false;
  @property({ attribute: false }) public previousIds: string[] = [];
  @property({ type: Number }) public session = 0;
  @property() public step: StudioWizardStep = "name";

  @state() private _draft: LightGroupDraft = newLightGroupDraft();
  @state() private _step: StudioWizardStep = "name";
  @state() private _error?: string;
  @state() private _busy = false;
  @state() private _slugTouched = false;
  @state() private _collapsed: Record<string, boolean> = {};
  @state() private _liveSceneId?: string;
  @state() private _notice?: string;
  private _liveSnapshot?: LightGroupDraft;
  private _applying = false;
  private _applyAgain = false;
  private _intendedId?: string;
  private _flushPromise: Promise<void> = Promise.resolve();
  private _applyTimer?: number;
  private _openToken = 0;
  private _cachedDraft?: LightGroupDraft;
  private _cachedHass?: HomeAssistant;
  private _cachedScenes: SceneConfig[] = [];
  private _clonedSession?: number;

  static styles = studioStyles;

  public disconnectedCallback(): void {
    window.clearTimeout(this._applyTimer);
    super.disconnectedCallback();
  }

  protected willUpdate(_changed: PropertyValues): void {
    if (this._clonedSession !== this.session) {
      this._clonedSession = this.session;
      this._draft = cloneLightDraft(this.draft);
      if (!this._draft.entities.length) {
        this._draft.entities = allLightIds(this._draft);
      }
      this._step = resolveWizardStep(STEPS, this.step);
      this._error = undefined;
      this._notice = undefined;
      this._slugTouched = false;
      this._collapsed = {};
      this._resetLive();
      this._cachedDraft = undefined;
    }
  }

  protected updated(changed: PropertyValues): void {
    if (
      this._clonedSession === this.session &&
      changed.has("step") &&
      STEPS.includes(this.step) &&
      this.step !== this._step
    ) {
      void this._leaveTo(this.step);
    }
  }

  private get _scenes(): SceneConfig[] {
    if (this._cachedDraft === this._draft && this._cachedHass === this.hass) {
      return this._cachedScenes;
    }
    this._cachedDraft = this._draft;
    this._cachedHass = this.hass;
    this._cachedScenes = lightGroupToScenes(this._draft, this.hass);
    return this._cachedScenes;
  }

  private get _stepIndex(): number {
    return STEPS.indexOf(this._step);
  }

  private _rows(): LightRowId[] {
    return studioRows(this._draft);
  }

  private _patch(patch: Partial<LightGroupDraft>): void {
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

  private _inRow(entityId: string, row: LightRowId): boolean {
    return rowIds(this._draft, row).includes(entityId);
  }

  private _addEntities(entityIds: string[]): void {
    const next = [...this._draft.entities];
    const rgb = [...this._draft.rgb];
    entityIds.forEach((entityId) => {
      if (!isValidEntityId(entityId) || next.includes(entityId)) {
        return;
      }
      next.push(entityId);
      if (isRgbCapableLight(this.hass, entityId) && !rgb.includes(entityId)) {
        rgb.push(entityId);
      }
    });
    if (next.length === this._draft.entities.length) {
      return;
    }
    this._patch({ entities: next, rgb });
  }

  private _bulkAdd(ev: Event): void {
    const entities = (ev as CustomEvent<{ entities?: string[] }>).detail?.entities;
    this._addEntities(entities ?? []);
  }

  private _removeEntity(index: number): void {
    const entityId = this._draft.entities[index];
    this._patch({
      entities: this._draft.entities.filter((_, item) => item !== index),
      rgb: this._draft.rgb.filter((id) => id !== entityId),
      warm: this._draft.warm.filter((id) => id !== entityId),
      white: this._draft.white.filter((id) => id !== entityId),
      whites: (this._draft.whites ?? []).filter((id) => id !== entityId),
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

  private get _presets(): string[] {
    const source = this._draft.presets?.length
      ? this._draft.presets
      : [...STUDIO_RGB_PRESETS];
    return Array.from({ length: STUDIO_RGB_PRESET_COUNT }, (_, index) => {
      return source[index] ?? STUDIO_RGB_PRESETS[index] ?? "#ff8a1d";
    });
  }

  private _hexInput(ev: Event): void {
    this._patch({
      hex: normalizeHex((ev.target as HTMLInputElement).value, this._draft.hex),
    });
  }

  private _preset(hex: string): void {
    this._patch({ hex: normalizeHex(hex, this._draft.hex) });
  }

  private _editPreset(index: number, ev: Event): void {
    const hex = normalizeHex((ev.target as HTMLInputElement).value, this._draft.hex);
    const presets = [...this._presets];
    presets[index] = hex;
    this._patch({ presets, hex });
  }

  private _effectInput(ev: Event): void {
    this._patch({ effect: (ev.target as HTMLSelectElement).value });
  }

  private _musicSyncInput(ev: Event): void {
    this._patch({ musicSync: (ev.target as HTMLInputElement).checked });
  }

  private _brightnessInput(ev: Event): void {
    this._patch({
      brightness: asRgbPercent((ev.target as HTMLInputElement).value),
    });
  }

  private _canNext(): boolean {
    if (this._step === "entities") {
      return this._draft.entities.some(isValidEntityId);
    }
    if (this._step === "name") {
      return Boolean(this._draft.name.trim() && this._draft.slug.trim());
    }
    if (this._step === "groups") {
      if (isMinimalDraft(this._draft)) {
        return (
          rowIds(this._draft, "rgb").length > 0 ||
          rowIds(this._draft, "whites").length >= MIN_WHITES_ENTITIES
        );
      }
      const rgb = rowIds(this._draft, "rgb").length > 0;
      const warm = rowIds(this._draft, "warm").length >= 2;
      const white = rowIds(this._draft, "white").length >= 2;
      return rgb || warm || white;
    }
    return this._rows().some((row) => rowIds(this._draft, row).length > 0);
  }

  private _assignEntity(ev: Event): void {
    const { groupId, entityId } = (ev as CustomEvent<{
      groupId?: string;
      entityId?: string;
    }>).detail ?? {};
    if (!groupId || !entityId || !this._rows().includes(groupId as LightRowId)) {
      return;
    }
    const row = groupId as LightRowId;
    if (this._inRow(entityId, row)) {
      return;
    }
    this._patch({ [row]: [...rowIds(this._draft, row), entityId] });
  }

  private _unassignEntity(ev: Event): void {
    const { groupId, entityId } = (ev as CustomEvent<{
      groupId?: string;
      entityId?: string;
    }>).detail ?? {};
    if (!groupId || !entityId || !this._rows().includes(groupId as LightRowId)) {
      return;
    }
    const row = groupId as LightRowId;
    this._patch({ [row]: rowIds(this._draft, row).filter((id) => id !== entityId) });
  }

  private _setSceneLook(
    slot: SimpleLightSlot,
    entityId: string,
    patch: Partial<LightSceneLook>,
  ): void {
    if (!slot.entities.includes(entityId)) {
      return;
    }
    const current = entityLookForSlot(this._draft, slot, entityId);
    const next = { ...current, ...patch };
    if (slot.row === "warm") {
      next.hex = WARM_HEX;
      next.effect = "";
    } else if (slot.row === "white") {
      next.hex = WHITE_HEX;
      next.effect = "";
    } else if (slot.row === "whites") {
      next.hex = whitesStageHex(slot.stage ?? 1, slot.stages ?? DEFAULT_WHITES_STAGES);
      next.effect = "";
    }
    const sceneLooks = cloneLightLooks(this._draft.sceneLooks);
    sceneLooks[slot.slot] = {
      ...(sceneLooks[slot.slot] ?? {}),
      [entityId]: next,
    };
    this._patch({ sceneLooks });
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
      this._error =
        error instanceof Error ? error.message : "Could not save scenes";
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
    this._busy = true;
    this._error = undefined;
    try {
      await this._queueApply(id);
    } finally {
      this._busy = false;
    }
  }

  private async _startLive(scene: SceneConfig): Promise<void> {
    if (!slotForLightScene(this._draft, scene) || this._liveLocked() || this._busy) {
      return;
    }
    const token = ++this._openToken;
    this._busy = true;
    this._error = undefined;
    this._notice = "Opening look…";
    try {
      const fallback = this._scenes.find((item) => item.id === scene.id) ?? scene;
      const off = this._scenes.find(
        (item) => parseLookSceneId(item.id)?.slot === "off",
      );
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
      const patch = draftPatchFromSavedScene(this._draft, saved);
      if (patch) {
        this._draft = { ...this._draft, ...patch };
      }
      this._liveSnapshot = cloneLightDraft(this._draft);
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
      this._error = isMinimalDraft(this._draft)
        ? "Assign at least one entity to RGB or Whites."
        : "Assign at least one entity to RGB, Warm, or White.";
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
            placeholder="Living room"
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
            Home Assistant scenes will be
            ${isMinimalDraft(this._draft) ? "ssm" : "ssl"}_${this._draft.slug || "living"}_off
            (Off / Default, all lights off), then
            ${isMinimalDraft(this._draft) ? "_rgb, _t1…" : "_rgb, _w1, _n1…"}.
            The card remembers the last look in each group. Automations call
            <code>scene.turn_on</code>.
          </span>
        </label>
      </div>
    `;
  }

  private _setGroupStages(ev: Event): void {
    const { groupId, stages } = (ev as CustomEvent<{
      groupId?: string;
      stages?: number;
    }>).detail ?? {};
    if (groupId === "whites") {
      const ids = rowIds(this._draft, "whites");
      const from = whitesStageCount(ids, this._draft.whitesStages);
      const count = whitesStageCount(ids, stages);
      this._patch({
        whitesStages: count,
        sceneLooks: remapWhitesLooks(this._draft.sceneLooks, from, count),
      });
      return;
    }
    if (groupId === "warm" || groupId === "white") {
      const count = warmWhiteStageCount(rowIds(this._draft, groupId), stages);
      this._patch({
        [groupId === "warm" ? "warmStages" : "whiteStages"]: count,
        sceneLooks: trimStageLooks(
          this._draft.sceneLooks,
          groupId === "warm" ? "w" : "n",
          count,
        ),
      });
    }
  }

  private _renderGroups() {
    const minimal = isMinimalDraft(this._draft);
    return html`
      <div class="form">
        <scene-studio-assign
          .hass=${this.hass}
          .entities=${this._draft.entities}
          .help=${minimal
            ? "Drag an entity into RGB or Whites, or tap one and then tap a group. Whites need at least one light, then pick 2–4 levels: Min/Max, Warm/Neutral/White, or Dim/Warm/Neutral/White. Only lights in a group change on that group's looks. The rest stay off."
            : ""}
          .groups=${this._rows().map((row) => ({
            id: row,
            name: STUDIO_ROW_META[row].label,
            entities: rowIds(this._draft, row),
            rgbOnly: row === "rgb",
            showStages: row !== "rgb",
            minEntities: row === "whites" ? MIN_WHITES_ENTITIES : 2,
            stages:
              row === "whites"
                ? whitesStageCount(rowIds(this._draft, "whites"), this._draft.whitesStages)
                : row === "warm"
                  ? warmWhiteStageCount(rowIds(this._draft, "warm"), this._draft.warmStages)
                  : row === "white"
                    ? warmWhiteStageCount(rowIds(this._draft, "white"), this._draft.whiteStages)
                    : undefined,
            stageChoices: row === "whites" ? WHITES_STAGE_CHOICES : undefined,
          }))}
          @studio-assign=${this._assignEntity}
          @studio-unassign=${this._unassignEntity}
          @studio-group-stages=${this._setGroupStages}
        ></scene-studio-assign>
      </div>
    `;
  }

  private _setBrightness(
    slot: SimpleLightSlot,
    entityId: string,
    value: string,
  ): void {
    this._setSceneLook(slot, entityId, { brightness: asRgbPercent(value) });
  }

  private _toggleGroup(row: string): void {
    this._collapsed = { ...this._collapsed, [row]: !this._collapsed[row] };
  }

  private _sceneSummary(scene: SceneConfig): string {
    const members = slotForLightScene(this._draft, scene)?.entities ?? [];
    if (!members.length) {
      return "All off";
    }
    const on = lightSceneOnIds(scene, members);
    if (!on.length) {
      return "Group lights off";
    }
    return on.map((entityId) => this._entityName(entityId)).join(", ");
  }

  private _renderRgbControls(music = false) {
    const ids = rowIds(this._draft, "rgb");
    return html`
      <div class="presets">
        ${this._presets.map(
          (hex, index) => html`
            <label
              class="swatch-edit ${this._draft.hex.toLowerCase() === hex.toLowerCase()
                ? "active"
                : ""}"
              title=${hex}
            >
              <input
                type="color"
                .value=${normalizeHex(hex, "#ff8a1d")}
                @input=${(ev: Event) => this._editPreset(index, ev)}
                @click=${() => this._preset(hex)}
              />
            </label>
          `,
        )}
        <label class="field compact">
          <span>Custom</span>
          <input
            type="color"
            .value=${normalizeHex(this._draft.hex, "#ff8a1d")}
            @input=${this._hexInput}
          />
        </label>
      </div>
      <label class="field">
        <span>Brightness · ${asRgbPercent(this._draft.brightness)}%</span>
        <input
          type="range"
          min="1"
          max="100"
          .value=${String(asRgbPercent(this._draft.brightness))}
          @input=${this._brightnessInput}
        />
      </label>
      <label class="field effect-card">
        <span>Effect</span>
        <select .value=${this._draft.effect ?? ""} @change=${this._effectInput}>
          ${studioEffectOptions(this.hass, ids).map(
            (option) => html`<option value=${option.id}>${option.label}</option>`,
          )}
        </select>
      </label>
      ${music
        ? html`
            <label class="music-sync">
              <input
                type="checkbox"
                .checked=${Boolean(this._draft.musicSync)}
                @change=${this._musicSyncInput}
              />
              <div>
                <strong>Music sync</strong>
                <span class="help">
                  Placeholder for a later release. Color lights will follow the
                  music when this is implemented.
                </span>
              </div>
            </label>
          `
        : nothing}
    `;
  }

  private _renderLiveEntity(slot: SimpleLightSlot, entityId: string) {
    const look = entityLookForSlot(this._draft, slot, entityId);
    const on = look.state === "on";
    const smart = on && isLightEntity(entityId) && slot.row !== "rgb";
    const percent = asRgbPercent(look.brightness);
    return html`
      <div class="live-entity">
        <div class="live-entity-head">
          <strong title=${entityId}>${this._entityName(entityId)}</strong>
          <button
            class="toggle ${on ? "on" : ""}"
            type="button"
            @click=${() =>
              this._setSceneLook(slot, entityId, { state: on ? "off" : "on" })}
          >
            ${on ? "On" : "Off"}
          </button>
        </div>
        ${smart
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
                    this._setBrightness(
                      slot,
                      entityId,
                      (ev.target as HTMLInputElement).value,
                    )}
                />
              </label>
            `
          : nothing}
      </div>
    `;
  }

  private _renderLookList(edit: boolean) {
    const scenes = this._scenes;
    const groups = reviewSceneGroups(scenes, this._draft);
    if (!scenes.length) {
      return html`<p class="help">${isMinimalDraft(this._draft)
        ? "Assign RGB or Whites to create scenes."
        : "Assign RGB, Warm, or White to create scenes."}</p>`;
    }
    return html`
      <div class="look-list">
        ${groups.map((group) => {
          const rows = group.scenes;
          if (!rows.length) {
            return nothing;
          }
          const open = this._collapsed[group.row] !== true;
          return html`
            <div class="look-group">
              <button
                class="group-toggle"
                type="button"
                aria-expanded=${open}
                @click=${() => this._toggleGroup(group.row)}
              >
                <span class="chevron" aria-hidden="true">${open ? "▼" : "▶"}</span>
                ${group.label}
                <span class="help">${rows.length}</span>
              </button>
              ${open
                ? rows.map((scene) => {
                    const editable = Boolean(slotForLightScene(this._draft, scene));
                    return html`
                      <div class="look-item">
                        <div>
                          <strong>${lightSceneTitle(scene)}</strong>
                          <div class="help">${this._sceneSummary(scene)}</div>
                        </div>
                        ${edit
                          ? editable
                            ? html`
                                <button
                                  class="secondary"
                                  type="button"
                                  ?disabled=${this._busy}
                                  @click=${() => this._startLive(scene)}
                                >
                                  Live edit
                                </button>
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
    const slot = slotForLightScene(this._draft, scene);
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
        ${slot?.row === "rgb"
          ? html`
              <div class="row-card">
                <div class="item-head">
                  <strong>Shared RGB look</strong>
                  <span class="help">One color and brightness for lights that are on</span>
                </div>
                ${this._renderRgbControls(true)}
              </div>
            `
          : nothing}
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
    [STUDIO_LIGHTS_WIZARD]: SceneStudioLightsWizard;
  }
}

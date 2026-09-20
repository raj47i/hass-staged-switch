import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { errorMessage, relevantHassChanged } from "../shared";
import type { HomeAssistant } from "../shared/types";
import { STUDIO_PANEL, STUDIO_TITLE, studioSetEditorTitle, studioSetKindLabel } from "./const";
import { saveSwitchGroup } from "./ha";
import { deleteStudioSet, rememberWrittenScenes, refreshStudioScenes } from "./bind";
import { uniqueStudioSceneIds } from "./ids";
import { draftFromAdvancedScenes, newAdvancedLightDraft } from "./advanced";
import { draftFromLightScenes, newLightGroupDraft } from "./lights";
import { draftFromScenes, newSwitchGroupDraft, summarizeGroups } from "./scenes";
import { readStudioSidebar, setStudioSidebar } from "./sidebar";
import { studioStyles } from "./styles";
import type {
  AdvancedLightDraft,
  LightGroupDraft,
  SceneConfig,
  SwitchGroupDraft,
  SwitchGroupSummary,
} from "./types";
import "./wizard";
import "./lights-wizard";
import "./advanced-wizard";

const sceneEntityIds = (hass?: HomeAssistant): string[] =>
  Object.keys(hass?.states ?? {}).filter((entityId) =>
    entityId.startsWith("scene."),
  );

type StudioView = "list" | "switch" | "lights" | "advanced";

@customElement(STUDIO_PANEL)
export class SceneStudioPanel extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ type: Boolean }) public narrow = false;
  @property({ attribute: false }) public route?: unknown;
  @property({ attribute: false }) public panel?: unknown;

  @state() private _view: StudioView = "list";
  @state() private _groups: SwitchGroupSummary[] = [];
  @state() private _switchDraft: SwitchGroupDraft = newSwitchGroupDraft();
  @state() private _lightDraft: LightGroupDraft = newLightGroupDraft();
  @state() private _advancedDraft: AdvancedLightDraft = newAdvancedLightDraft();
  @state() private _previousIds: string[] = [];
  @state() private _slugLocked = false;
  @state() private _error?: string;
  @state() private _notice?: string;
  @state() private _loading = false;
  @state() private _session = 0;
  @state() private _showSidebar?: boolean;
  @state() private _sidebarReady = false;
  @state() private _confirmKey?: string;
  @state() private _confirmReady = false;
  @state() private _busyKey?: string;
  private _confirmTimer?: number;

  static styles = studioStyles;

  public connectedCallback(): void {
    super.connectedCallback();
    void this._refresh();
    void this._syncSidebar();
  }

  public disconnectedCallback(): void {
    window.clearTimeout(this._confirmTimer);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (!changed.has("hass")) {
      return;
    }
    void this._syncSidebar();
    if (this._view !== "list") {
      return;
    }
    const previous = changed.get("hass") as HomeAssistant | undefined;
    const ids = [...new Set([...sceneEntityIds(previous), ...sceneEntityIds(this.hass)])];
    if (relevantHassChanged(previous, this.hass, ids)) {
      void this._refresh();
    }
  }

  private async _refresh(): Promise<void> {
    if (!this.hass) {
      this._loading = false;
      return;
    }
    this._loading = true;
    try {
      const scenes = await refreshStudioScenes(this.hass);
      this._groups = summarizeGroups(scenes);
      this._error = undefined;
    } catch (error) {
      this._error = errorMessage(error, "Could not load scenes");
    } finally {
      this._loading = false;
    }
  }

  private async _syncSidebar(): Promise<void> {
    const shown = await readStudioSidebar(this.hass);
    this._sidebarReady = shown !== undefined;
    this._showSidebar = shown;
  }

  private async _toggleSidebar(ev: Event): Promise<void> {
    const show = (ev.target as HTMLInputElement).checked;
    this._showSidebar = show;
    try {
      await setStudioSidebar(this.hass, show);
      this._sidebarReady = true;
    } catch (error) {
      this._showSidebar = !show;
      this._error = errorMessage(error, "Could not update the sidebar");
    }
  }

  private _open(view: Exclude<StudioView, "list">): void {
    this._previousIds = [];
    this._slugLocked = false;
    this._session += 1;
    this._view = view;
    this._notice = undefined;
    this._error = undefined;
  }

  private _createLights(): void {
    this._lightDraft = newLightGroupDraft();
    this._open("lights");
  }

  private _createMinimal(): void {
    this._lightDraft = newLightGroupDraft("", "minimal");
    this._open("lights");
  }

  private _createAdvanced(): void {
    this._advancedDraft = newAdvancedLightDraft();
    this._open("advanced");
  }

  private _createSwitch(): void {
    this._switchDraft = newSwitchGroupDraft();
    this._open("switch");
  }

  private _edit(group: SwitchGroupSummary): void {
    this._previousIds = group.scenes.map((scene) => scene.id);
    this._slugLocked = true;
    this._session += 1;
    this._notice = undefined;
    this._error = undefined;
    if (group.kind === "light" || group.kind === "minimal") {
      this._lightDraft = draftFromLightScenes(group.slug, group.scenes);
      this._view = "lights";
      return;
    }
    if (group.kind === "advanced") {
      this._advancedDraft = draftFromAdvancedScenes(group.slug, group.scenes);
      this._view = "advanced";
      return;
    }
    this._switchDraft = draftFromScenes(group.slug, group.scenes);
    this._view = "switch";
  }

  private _cancel(): void {
    this._view = "list";
    void this._refresh();
  }

  private _rememberLook(ev: Event): void {
    const detail = (
      ev as CustomEvent<{
        draft?: LightGroupDraft;
        id?: string;
        scenes?: SceneConfig[];
      }>
    ).detail;
    if (detail?.draft && this._view === "lights") {
      this._lightDraft = detail.draft;
    }
    if (detail?.scenes?.length) {
      this._previousIds = uniqueStudioSceneIds(
        detail.scenes.map((scene) => scene.id),
      );
    } else if (detail?.id) {
      this._previousIds = uniqueStudioSceneIds([
        ...this._previousIds,
        detail.id,
      ]);
    }
    this._slugLocked = true;
    this._error = undefined;
  }

  private async _save(ev: Event): Promise<void> {
    const detail = (
      ev as CustomEvent<{
        scenes: SceneConfig[];
        previousIds: string[];
        draft?: LightGroupDraft;
        written?: boolean;
      }>
    ).detail;
    if (!detail?.scenes.length) {
      return;
    }
    try {
      if (!detail.written) {
        await saveSwitchGroup(this.hass, detail.scenes, detail.previousIds);
        rememberWrittenScenes(detail.scenes);
      }
      this._notice = `Saved ${detail.scenes.length} scene${detail.scenes.length === 1 ? "" : "s"}.`;
      this._error = undefined;
      this._previousIds = detail.scenes.map((scene) => scene.id);
      this._slugLocked = true;
      if (detail.draft && this._view === "lights") {
        this._lightDraft = detail.draft;
      }
      this._view = "list";
      await this._refresh();
    } catch (error) {
      this._error = errorMessage(error, "Could not save scenes");
    }
  }

  private _groupKey(group: SwitchGroupSummary): string {
    return `${group.kind}:${group.slug}`;
  }

  private _clearDeleteConfirm(): void {
    window.clearTimeout(this._confirmTimer);
    this._confirmTimer = undefined;
    this._confirmKey = undefined;
    this._confirmReady = false;
  }

  private _askDelete(ev: Event, group: SwitchGroupSummary): void {
    ev.preventDefault();
    ev.stopPropagation();
    const key = this._groupKey(group);
    window.clearTimeout(this._confirmTimer);
    this._confirmKey = key;
    this._confirmReady = false;
    this._error = undefined;
    this._confirmTimer = window.setTimeout(() => {
      if (this._confirmKey === key) {
        this._confirmReady = true;
      }
    }, 800);
  }

  private _cancelDelete(ev: Event): void {
    ev.stopPropagation();
    this._clearDeleteConfirm();
  }

  private async _delete(ev: Event, group: SwitchGroupSummary): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();
    const key = this._groupKey(group);
    if (
      this._confirmKey !== key ||
      !this._confirmReady ||
      (ev as MouseEvent).detail > 1
    ) {
      return;
    }
    this._busyKey = key;
    this._error = undefined;
    try {
      const ids = await deleteStudioSet(this.hass, group);
      this._groups = this._groups.filter(
        (item) => this._groupKey(item) !== key,
      );
      this._clearDeleteConfirm();
      this._notice = `Deleted ${group.name} (${ids.length} scene${ids.length === 1 ? "" : "s"}).`;
      await this._refresh();
    } catch (error) {
      this._error = errorMessage(error, "Could not delete this set");
    } finally {
      this._busyKey = undefined;
    }
  }

  private _renderCreate() {
    return html`
      <div class="create-grid">
        <button class="create-card featured" type="button" @click=${this._createLights}>
          <span class="kind">Lights</span>
          <strong>${studioSetKindLabel("light")}</strong>
          <p class="muted">
            RGB, Warm, and White groups. Color lights can also join Warm or
            White. Saved as Home Assistant scenes.
          </p>
        </button>
        <button class="create-card featured" type="button" @click=${this._createMinimal}>
          <span class="kind">Lights</span>
          <strong>${studioSetKindLabel("minimal")}</strong>
          <p class="muted">
            RGB plus a Whites group. Whites can be Min/Max, Warm/Neutral/White,
            or Dim/Warm/Neutral/White. Saved as Home Assistant scenes.
          </p>
        </button>
        <button class="create-card" type="button" @click=${this._createAdvanced}>
          <span class="kind">Lights</span>
          <strong>${studioSetKindLabel("advanced")}</strong>
          <p class="muted">
            Add and edit custom groups, then extra per-entity scenes if you
            need them.
          </p>
        </button>
        <button class="create-card" type="button" @click=${this._createSwitch}>
          <span class="kind">Switches</span>
          <strong>${studioSetKindLabel("switch")}</strong>
          <p class="muted">On/off snapshots for fans, heaters, and other toggles.</p>
        </button>
        <div class="create-card later">
          <span class="kind">Later</span>
          <strong>Climate, fans, sensors</strong>
          <p class="muted">More scene helpers after lights and switches.</p>
        </div>
      </div>
    `;
  }

  private _renderList() {
    return html`
      <div class="page">
        <div class="toolbar">
          <div>
            <h1>${STUDIO_TITLE}</h1>
            <p class="muted">
              An easier editor for Home Assistant scenes. Each set is a handful
              of related scenes that remotes and automations call with
              <code>scene.turn_on</code>.
            </p>
          </div>
          ${this._sidebarReady
            ? html`
                <label class="sidebar-pref">
                  <input
                    type="checkbox"
                    .checked=${Boolean(this._showSidebar)}
                    @change=${this._toggleSidebar}
                  />
                  <span>
                    Show in sidebar
                    <span class="help">
                      Same toggle as Settings → Dashboards
                    </span>
                  </span>
                </label>
              `
            : nothing}
        </div>
        ${this._renderCreate()}
        ${this._notice ? html`<p class="muted">${this._notice}</p>` : nothing}
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        ${this._loading
          ? html`<p class="muted">Loading…</p>`
          : this._groups.length
            ? html`
                <div class="groups">
                  ${this._groups.map((group) => {
                    const key = this._groupKey(group);
                    const busy = this._busyKey === key;
                    const confirm = this._confirmKey === key;
                    return html`
                      <div class="group ${confirm ? "confirming" : ""}">
                        <div class="group-row">
                          <button
                            class="group-main"
                            type="button"
                            ?disabled=${busy || confirm}
                            @click=${() => this._edit(group)}
                          >
                            <span class="kind">${studioSetKindLabel(group.kind)}</span>
                            <strong>${group.name}</strong>
                            <span class="muted">
                              ${group.sceneCount} scenes · ${group.entityCount} entities
                            </span>
                          </button>
                          ${confirm
                            ? nothing
                            : html`
                                <div class="group-actions">
                                  <button
                                    class="ghost"
                                    type="button"
                                    ?disabled=${busy}
                                    @click=${() => this._edit(group)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    class="ghost"
                                    type="button"
                                    ?disabled=${busy}
                                    @click=${(ev: Event) => this._askDelete(ev, group)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              `}
                        </div>
                        ${confirm
                          ? html`
                              <div class="group-confirm" role="alert">
                                <p>
                                  Permanently delete <strong>${group.name}</strong> and
                                  all ${group.sceneCount} Home Assistant scenes? Remotes
                                  and dashboard cards that call them will stop working.
                                  This cannot be undone.
                                </p>
                                <div class="group-actions">
                                  <button
                                    class="ghost"
                                    type="button"
                                    ?disabled=${busy}
                                    @click=${this._cancelDelete}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    class="danger"
                                    type="button"
                                    ?disabled=${busy || !this._confirmReady}
                                    @click=${(ev: Event) => this._delete(ev, group)}
                                  >
                                    ${busy ? "Deleting…" : "Delete permanently"}
                                  </button>
                                </div>
                              </div>
                            `
                          : nothing}
                      </div>
                    `;
                  })}
                </div>
              `
            : html`
                <div class="card empty">
                  No scene sets yet. Start with a ${studioSetKindLabel("light").toLowerCase()}.
                </div>
              `}
      </div>
    `;
  }

  private _renderSwitchWizard() {
    return html`
      <div class="page">
        <div class="toolbar">
          <div>
            <h1>${studioSetEditorTitle("switch", this._slugLocked)}</h1>
            <p class="muted">Entities first, then name, then on/off scenes.</p>
          </div>
        </div>
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        <scene-studio-wizard
          .hass=${this.hass}
          .draft=${this._switchDraft}
          .slugLocked=${this._slugLocked}
          .previousIds=${this._previousIds}
          .session=${this._session}
          @studio-cancel=${this._cancel}
          @studio-save=${this._save}
          @studio-look-saved=${this._rememberLook}
        ></scene-studio-wizard>
      </div>
    `;
  }

  private _renderLightsWizard() {
    const minimal = this._lightDraft.profile === "minimal";
    const title = studioSetEditorTitle(
      minimal ? "minimal" : "light",
      this._slugLocked,
    );
    return html`
      <div class="page">
        <div class="toolbar">
          <div>
            <h1>${title}</h1>
            <p class="muted">
              Entities, then groups, then looks, then Finish.
            </p>
          </div>
        </div>
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        ${this._notice ? html`<p class="muted">${this._notice}</p>` : nothing}
        <scene-studio-lights-wizard
          .hass=${this.hass}
          .draft=${this._lightDraft}
          .slugLocked=${this._slugLocked}
          .previousIds=${this._previousIds}
          .session=${this._session}
          @studio-cancel=${this._cancel}
          @studio-save=${this._save}
          @studio-look-saved=${this._rememberLook}
        ></scene-studio-lights-wizard>
      </div>
    `;
  }

  private _renderAdvancedWizard() {
    return html`
      <div class="page">
        <div class="toolbar">
          <div>
            <h1>
              ${studioSetEditorTitle("advanced", this._slugLocked)}
            </h1>
            <p class="muted">
              Entities, then custom groups, then dynamic stages per group.
            </p>
          </div>
        </div>
        ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
        <scene-studio-advanced-wizard
          .hass=${this.hass}
          .draft=${this._advancedDraft}
          .slugLocked=${this._slugLocked}
          .previousIds=${this._previousIds}
          .session=${this._session}
          @studio-cancel=${this._cancel}
          @studio-save=${this._save}
          @studio-look-saved=${this._rememberLook}
        ></scene-studio-advanced-wizard>
      </div>
    `;
  }

  protected render() {
    if (this._view === "lights") {
      return this._renderLightsWizard();
    }
    if (this._view === "advanced") {
      return this._renderAdvancedWizard();
    }
    if (this._view === "switch") {
      return this._renderSwitchWizard();
    }
    return this._renderList();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [STUDIO_PANEL]: SceneStudioPanel;
  }
}

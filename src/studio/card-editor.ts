import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fireConfigChanged,
  normalizeTitleAlign,
  pickedValue,
  storedTitleAlign,
  TITLE_ALIGN_OPTIONS,
} from "../shared";
import { sharedEditorStyles } from "../shared/styles";
import type { HomeAssistant } from "../shared/types";
import { peekStudioScenes, refreshStudioScenes, studioCardTitle, studioSetOptions } from "./bind";
import { STUDIO_CARD } from "./const";
import {
  hiddenEntityIds,
  renderEntityButtonsEditor,
  studioSetEntityIds,
  toggleHiddenEntity,
} from "./entity-buttons";
import type { SceneStudioCardConfig } from "./card";

@customElement(`${STUDIO_CARD}-editor`)
export class SceneStudioCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SceneStudioCardConfig;

  public setConfig(config: SceneStudioCardConfig): void {
    if (!config || typeof config !== "object") {
      return;
    }
    this._config = { ...config };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void refreshStudioScenes(this.hass).then(() => this.requestUpdate());
  }

  private _write(patch: Partial<SceneStudioCardConfig>): void {
    if (!this._config) {
      return;
    }
    this._config = { ...this._config, ...patch };
    fireConfigChanged(this, this._config);
  }

  private _changed(ev: Event): void {
    if (!this._config) {
      return;
    }
    const slug = pickedValue(ev);
    this._config = {
      type: this._config.type,
      studio: slug || undefined,
      show_switches: this._config.show_switches,
      hidden_entities: this._config.hidden_entities,
      ...(this._config.title !== undefined ? { title: this._config.title } : {}),
      ...(this._config.title_align ? { title_align: this._config.title_align } : {}),
    };
    fireConfigChanged(this, this._config);
  }

  private _titleChanged(ev: Event): void {
    this._write({ title: (ev.target as HTMLInputElement).value });
  }

  private _alignChanged(ev: Event): void {
    this._write({ title_align: storedTitleAlign(pickedValue(ev)) });
  }

  private _setShowButtons(enabled: boolean): void {
    this._write({
      show_switches: enabled || undefined,
      hidden_entities: enabled ? this._config?.hidden_entities : undefined,
    });
  }

  private _setEntityVisible(entityId: string, visible: boolean): void {
    const roster = studioSetEntityIds(this._config?.studio, peekStudioScenes(this.hass));
    this._write({
      hidden_entities: toggleHiddenEntity(
        this._config?.hidden_entities ?? [],
        entityId,
        visible,
        roster,
      ),
    });
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const sets = studioSetOptions(this.hass);
    const slug = this._config.studio?.trim() || "";
    const selected = sets.find((set) => set.slug === slug);
    const defaultTitle = selected ? studioCardTitle(selected.name) : "";
    const titleValue = this._config.title ?? defaultTitle;
    const hasTitle = Boolean(titleValue.trim());
    const entities = studioSetEntityIds(slug, peekStudioScenes(this.hass));
    return html`
      <div class="form">
        <label class="row">
          <span class="label">Scene-set</span>
          <select class="text-input" .value=${slug} @change=${this._changed}>
            <option value="">All scene-sets</option>
            ${sets.map((set) => html`<option value=${set.slug}>${set.name}</option>`)}
          </select>
        </label>
        <label class="row">
          <span class="label">Title</span>
          <div class="split">
            <input
              class="text-input"
              .value=${titleValue}
              placeholder=${defaultTitle || "Optional heading"}
              @input=${this._titleChanged}
            />
            <select
              class="text-input"
              .value=${normalizeTitleAlign(this._config.title_align)}
              ?disabled=${!hasTitle}
              @change=${this._alignChanged}
            >
              ${TITLE_ALIGN_OPTIONS.map(
                (option) => html`<option value=${option.value}>${option.label}</option>`,
              )}
            </select>
          </div>
        </label>
        <span class="help">
          Lights scene-set : Simple and Minimal use Room Lights: Mini.
          Switches scene-set and Lights scene-set : Advanced use Room Switches.
          Title is optional. The default is the scene-set name. Clear it to hide
          the heading. Alignment is available when a title is shown.
        </span>
        ${renderEntityButtonsEditor({
          hass: this.hass,
          enabled: this._config.show_switches === true,
          entities: slug ? entities : [],
          hidden: hiddenEntityIds(this._config),
          onEnabled: (enabled) => this._setShowButtons(enabled),
          onVisible: (entityId, visible) => this._setEntityVisible(entityId, visible),
          emptyHint: slug
            ? "No entities in this scene-set yet."
            : "Pick a scene-set to choose which entity buttons appear. With all scene-sets selected, every entity in each one is shown.",
        })}
      </div>
    `;
  }

  static styles = sharedEditorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "scene-studio-card-editor": SceneStudioCardEditor;
  }
}

import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DOCUMENTATION_URL, isInEditorPreview, registerLovelaceCard } from "../shared";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "../shared/types";
import {
  isStudioPanelHost,
  refreshStudioScenes,
  showStudioEditor,
  studioChildCardConfig,
  studioDashboardSets,
  studioScenesVersion,
  studioSetOptions,
} from "./bind";
import {
  STUDIO_CARD,
  STUDIO_CARD_TITLE,
  STUDIO_CARD_TYPE,
  STUDIO_RGB_PRESETS,
} from "./const";
import type { SwitchGroupSummary } from "./types";
import "./card-editor";
import "./panel";
import "../cards/staged-lights-mini/card";
import "../cards/staged-switch/card";

export interface SceneStudioCardConfig extends LovelaceCardConfig {
  studio?: string;
  title?: string;
  title_align?: "left" | "center" | "right";
  editor?: boolean;
  show_switches?: boolean;
  hidden_entities?: string[];
}

@customElement(STUDIO_CARD)
export class SceneStudioCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SceneStudioCardConfig;
  @state() private _sets: SwitchGroupSummary[] = [];
  @state() private _inPanel = false;
  private _applied = new Map<string, string>();
  private _seenVersion = -1;

  public static async getConfigElement() {
    return document.createElement(`${STUDIO_CARD}-editor`);
  }

  public static getStubConfig(): SceneStudioCardConfig {
    return { type: STUDIO_CARD_TYPE };
  }

  public setConfig(config: SceneStudioCardConfig): void {
    this._config = { ...config };
    this._applied.clear();
  }

  public getCardSize(): number {
    const extra = this._config?.show_switches === true ? 1 : 0;
    return this._showEditor() ? 8 : Math.max(3, this._visibleSets().length * (3 + extra));
  }

  public getGridOptions() {
    if (this._showEditor()) {
      return { columns: 12, min_columns: 6, min_rows: 6 };
    }
    return { columns: 12, min_columns: 6, min_rows: 2 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._inPanel = isStudioPanelHost(this);
    void this._load();
  }

  protected updated(changed: PropertyValues): void {
    if (
      this.hass &&
      (studioScenesVersion() !== this._seenVersion ||
        (changed.has("hass") && !this._sets.length))
    ) {
      void this._load();
    }
    if (this._showEditor()) {
      return;
    }
    if (changed.has("_config")) {
      this._applied.clear();
    }
    this._syncChildren();
  }

  private _showEditor(): boolean {
    return showStudioEditor(this._config, this._inPanel);
  }

  private async _load(): Promise<void> {
    await refreshStudioScenes(this.hass);
    this._sets = studioSetOptions(this.hass);
    this._seenVersion = studioScenesVersion();
  }

  private _visibleSets(): SwitchGroupSummary[] {
    return studioDashboardSets(this._sets, this._config?.studio);
  }

  private _syncChildren(force = false): void {
    this.renderRoot.querySelectorAll("[data-studio]").forEach((node) => {
      const el = node as LovelaceCard & HTMLElement;
      const slug = el.dataset.studio ?? "";
      const kind = (el.dataset.kind ?? "light") as SwitchGroupSummary["kind"];
      const key = `${kind}:${slug}`;
      if (force || this._applied.get(key) !== slug) {
        el.setConfig(studioChildCardConfig(kind, slug, this._config));
        this._applied.set(key, slug);
      }
      if (this.hass) {
        el.hass = this.hass;
      }
    });
  }

  private _showShowcase(): boolean {
    return isInEditorPreview(this) && !this._visibleSets().length;
  }

  private _renderShowcase() {
    return html`
      <ha-card class="showcase" aria-hidden="true">
        <div class="sample">
          <section class="sample-block">
            <div class="sample-head">
              <h2 class="title">Living</h2>
              <span class="kind">Lights</span>
            </div>
            <div class="modes">
              <span class="mode on">
                <ha-icon .icon=${"mdi:palette"}></ha-icon>
                RGB
              </span>
              <span class="mode">
                <ha-icon .icon=${"mdi:lamp"}></ha-icon>
                Warm
              </span>
              <span class="mode">
                <ha-icon .icon=${"mdi:white-balance-sunny"}></ha-icon>
                White
              </span>
            </div>
            <div class="rgb-row">
              <div class="bar"><i></i></div>
              <span class="pct">71%</span>
              <div class="swatches">
                ${STUDIO_RGB_PRESETS.map(
                  (hex, index) => html`
                    <span
                      class="swatch ${index === 0 ? "current" : ""}"
                      style="--swatch:${hex}"
                    ></span>
                  `,
                )}
              </div>
            </div>
          </section>
          <section class="sample-block">
            <div class="sample-head">
              <h2 class="title">Patio</h2>
              <span class="kind">Switches</span>
            </div>
            <div class="stages">
              <span class="power on">
                <ha-icon .icon=${"mdi:power"}></ha-icon>
              </span>
              <span class="track">
                <i></i>
                <span class="dot done"></span>
                <span class="dot done"></span>
                <span class="dot current"></span>
                <span class="dot"></span>
              </span>
              <span class="stage-name">Heater</span>
            </div>
          </section>
        </div>
      </ha-card>
    `;
  }

  protected render() {
    if (this._showEditor()) {
      return html`<scene-studio-panel .hass=${this.hass}></scene-studio-panel>`;
    }
    if (this._showShowcase()) {
      return this._renderShowcase();
    }
    const sets = this._visibleSets();
    if (!sets.length) {
      return html`
        <ha-card>
          <div class="empty">
            No scene-set on this card yet. Open Scene Studio from the sidebar to
            create one, then pick it here.
          </div>
        </ha-card>
      `;
    }
    return html`
      <div class="stack">
        ${sets.map((set) =>
          set.kind === "switch"
            ? html`<scene-studio-room-switches-card
                data-studio=${set.slug}
                data-kind=${set.kind}
              ></scene-studio-room-switches-card>`
            : html`<scene-studio-room-lights-mini-card
                data-studio=${set.slug}
                data-kind=${set.kind}
              ></scene-studio-room-lights-mini-card>`,
        )}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: auto;
      min-height: 0;
    }

    :host(:has(scene-studio-panel)) {
      height: 100%;
      min-height: 420px;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .empty {
      padding: 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--secondary-text-color);
    }

    .showcase {
      overflow: hidden;
    }

    .sample {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 14px 16px 16px;
    }

    .sample-block {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sample-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }

    .title {
      margin: 0;
      font-size: var(--ha-font-size-m, 14px);
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: var(--ha-line-height-condensed, 20px);
      color: var(--primary-text-color);
    }

    .kind {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-xs, 11px);
      font-weight: var(--ha-font-weight-medium, 500);
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }

    .modes {
      display: flex;
      overflow: hidden;
      border-radius: var(--ha-control-border-radius, 10px);
      background: color-mix(
        in srgb,
        var(--disabled-color, var(--primary-text-color)) 15%,
        transparent
      );
    }

    .mode {
      display: flex;
      flex: 1 1 0;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding: 8px 10px;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
      font-weight: var(--ha-font-weight-medium, 500);
    }

    .mode + .mode {
      box-shadow: inset 1px 0 0
        color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    }

    .mode.on {
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    }

    .mode ha-icon {
      --mdc-icon-size: 16px;
    }

    .rgb-row,
    .stages {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 28px;
    }

    .bar,
    .track {
      position: relative;
      flex: 1 1 auto;
      height: 4px;
      border-radius: 99px;
      background: color-mix(in srgb, var(--primary-text-color) 16%, transparent);
    }

    .bar i,
    .track i {
      position: absolute;
      inset: 0 auto 0 0;
      width: 71%;
      border-radius: inherit;
      background: var(--primary-color, #03a9f4);
    }

    .track i {
      width: 66%;
    }

    .pct,
    .stage-name {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }

    .swatches {
      display: flex;
      gap: 5px;
    }

    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--swatch);
      box-shadow: inset 0 0 0 1px
        color-mix(in srgb, var(--primary-text-color) 18%, transparent);
    }

    .swatch.current {
      box-shadow: 0 0 0 2px var(--card-background-color, #111),
        0 0 0 3px var(--primary-color, #03a9f4);
    }

    .power {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
    }

    .power.on {
      color: var(--primary-color, #03a9f4);
    }

    .power ha-icon {
      --mdc-icon-size: 18px;
    }

    .track {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 4px;
      padding: 0 2px;
    }

    .dot {
      position: relative;
      z-index: 1;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--primary-text-color) 28%, transparent);
    }

    .dot.done,
    .dot.current {
      background: var(--primary-color, #03a9f4);
    }

    .dot.current {
      width: 10px;
      height: 10px;
    }
  `;
}

registerLovelaceCard({
  type: STUDIO_CARD,
  name: STUDIO_CARD_TITLE,
  description:
    "Pick a scene-set. Lights use Room Lights: Mini; switches use Room Switches.",
  preview: true,
  documentationURL: DOCUMENTATION_URL,
});

declare global {
  interface HTMLElementTagNameMap {
    [STUDIO_CARD]: SceneStudioCard;
  }
}

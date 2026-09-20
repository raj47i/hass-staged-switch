import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DOCUMENTATION_URL, registerLovelaceCard } from "../shared";
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
import { STUDIO_CARD, STUDIO_CARD_TYPE } from "./const";
import type { SwitchGroupSummary } from "./types";
import "./card-editor";
import "./panel";
import "../cards/staged-lights-mini/card";
import "../cards/staged-switch/card";

export interface SceneStudioCardConfig extends LovelaceCardConfig {
  studio?: string;
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

  protected render() {
    if (this._showEditor()) {
      return html`<scene-studio-panel .hass=${this.hass}></scene-studio-panel>`;
    }
    const sets = this._visibleSets();
    if (!sets.length) {
      return html`
        <ha-card>
          <div class="empty">
            No Scene Studio set on this card yet. Open Scene Studio from the sidebar to
            create one, then pick it here.
          </div>
        </ha-card>
      `;
    }
    return html`
      <div class="stack">
        ${sets.map((set) =>
          set.kind === "light" || set.kind === "minimal"
            ? html`<staged-lights-mini-card
                data-studio=${set.slug}
                data-kind=${set.kind}
              ></staged-lights-mini-card>`
            : html`<staged-switch-card
                data-studio=${set.slug}
                data-kind=${set.kind}
              ></staged-switch-card>`,
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
  `;
}

registerLovelaceCard({
  type: STUDIO_CARD,
  name: "Scene Studio Card",
  description:
    "The staged lights or switch control for a Scene Studio set. Guest Room lights become the mini lights card.",
  preview: false,
  documentationURL: DOCUMENTATION_URL,
});

declare global {
  interface HTMLElementTagNameMap {
    [STUDIO_CARD]: SceneStudioCard;
  }
}

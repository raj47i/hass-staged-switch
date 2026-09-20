import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { entityDisplayName, fireEvent, isRgbCapableLight } from "../shared";
import type { HomeAssistant } from "../shared/types";
import { DEFAULT_ADVANCED_LEVEL_TEXT } from "./advanced";
import { STUDIO_ASSIGN } from "./const";
import { studioIntensityNames } from "./lights";
import { studioStyles } from "./styles";
import { MAX_LIGHT_STAGES, MIN_LIGHT_STAGES, MIN_WARM_WHITE_ENTITIES } from "../cards/staged-lights/const";

export interface AssignStageChoice {
  count: number;
  label: string;
}

export interface AssignGroup {
  id: string;
  name: string;
  entities: string[];
  rgbOnly?: boolean;
  editable?: boolean;
  stages?: number;
  showStages?: boolean;
  minEntities?: number;
  stageChoices?: AssignStageChoice[];
  levelInput?: boolean;
  levels?: string;
  levelWarning?: string;
}

type DragPayload = { entityId: string; from: string };

@customElement(STUDIO_ASSIGN)
export class SceneStudioAssign extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public entities: string[] = [];
  @property({ attribute: false }) public groups: AssignGroup[] = [];
  @property({ type: Boolean }) public editable = false;
  @property() public help?: string;

  @state() private _selected?: string;
  @state() private _over?: string;
  private _drag?: DragPayload;

  static styles = studioStyles;

  private _name(entityId: string): string {
    return entityDisplayName(this.hass, entityId);
  }

  private _canJoin(group: AssignGroup, entityId: string): boolean {
    if (!group.rgbOnly) {
      return true;
    }
    return isRgbCapableLight(this.hass, entityId);
  }

  private _assign(groupId: string, entityId: string): void {
    const group = this.groups.find((item) => item.id === groupId);
    if (!group || !this._canJoin(group, entityId) || group.entities.includes(entityId)) {
      return;
    }
    fireEvent(this, "studio-assign", { groupId, entityId });
  }

  private _unassign(groupId: string, entityId: string): void {
    fireEvent(this, "studio-unassign", { groupId, entityId });
  }

  private _payload(ev: DragEvent): DragPayload | undefined {
    if (this._drag) {
      return this._drag;
    }
    const raw = ev.dataTransfer?.getData("text/plain");
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return { entityId: raw, from: "" };
    }
  }

  private _dragStart(entityId: string, from: string, ev: DragEvent): void {
    this._drag = { entityId, from };
    this._selected = entityId;
    ev.dataTransfer?.setData("text/plain", JSON.stringify(this._drag));
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = "copyMove";
    }
  }

  private _dragEnd(): void {
    this._drag = undefined;
    this._over = undefined;
  }

  private _overZone(zone: string, ev: DragEvent): void {
    ev.preventDefault();
    this._over = zone;
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = zone === "pool" ? "move" : "copy";
    }
  }

  private _drop(zone: string, ev: DragEvent): void {
    ev.preventDefault();
    const payload = this._payload(ev);
    this._over = undefined;
    this._drag = undefined;
    if (!payload?.entityId) {
      return;
    }
    if (zone === "pool") {
      if (payload.from) {
        this._unassign(payload.from, payload.entityId);
      }
      return;
    }
    this._assign(zone, payload.entityId);
  }

  private _select(entityId: string, ev: Event): void {
    ev.stopPropagation();
    this._selected = this._selected === entityId ? undefined : entityId;
  }

  private _laneClick(groupId: string): void {
    if (!this._selected) {
      return;
    }
    this._assign(groupId, this._selected);
  }

  private _renderChip(entityId: string, from: string) {
    return html`
      <button
        class="drag-chip ${this._selected === entityId ? "selected" : ""}"
        type="button"
        draggable="true"
        @dragstart=${(ev: DragEvent) => this._dragStart(entityId, from, ev)}
        @dragend=${this._dragEnd}
        @click=${(ev: Event) => this._select(entityId, ev)}
      >
        <span>${this._name(entityId)}</span>
        ${from
          ? html`
              <span
                class="drag-x"
                @click=${(ev: Event) => {
                  ev.stopPropagation();
                  this._unassign(from, entityId);
                }}
              >
                ×
              </span>
            `
          : nothing}
      </button>
    `;
  }

  private _minEntities(group: AssignGroup): number {
    return group.minEntities ?? MIN_WARM_WHITE_ENTITIES;
  }

  private _stageChoices(group: AssignGroup): AssignStageChoice[] {
    if (group.stageChoices?.length) {
      return group.stageChoices;
    }
    return Array.from(
      { length: MAX_LIGHT_STAGES - MIN_LIGHT_STAGES + 1 },
      (_, index) => {
        const count = MIN_LIGHT_STAGES + index;
        return { count, label: `${count} · ${studioIntensityNames(count).join("/")}` };
      },
    );
  }

  private _renderLevelInput(group: AssignGroup) {
    return html`
      <label class="stage-pick" @click=${(ev: Event) => ev.stopPropagation()}>
        <span class="help">Levels</span>
        <input
          type="text"
          .value=${group.levels ?? DEFAULT_ADVANCED_LEVEL_TEXT}
          placeholder=${DEFAULT_ADVANCED_LEVEL_TEXT}
          @input=${(ev: Event) =>
            fireEvent(this, "studio-group-levels", {
              groupId: group.id,
              value: (ev.target as HTMLInputElement).value,
              commit: false,
            })}
          @blur=${(ev: Event) => {
            const value = (ev.target as HTMLInputElement).value.trim()
              ? (ev.target as HTMLInputElement).value
              : DEFAULT_ADVANCED_LEVEL_TEXT;
            fireEvent(this, "studio-group-levels", {
              groupId: group.id,
              value,
              commit: true,
            });
          }}
        />
        ${group.levelWarning
          ? html`<span class="help error">${group.levelWarning}</span>`
          : nothing}
      </label>
    `;
  }

  private _renderStageSelect(group: AssignGroup) {
    if (group.levelInput) {
      return this._renderLevelInput(group);
    }
    const ready = group.entities.length >= this._minEntities(group);
    const choices = this._stageChoices(group);
    const current = ready
      ? group.stages || choices[0]?.count || MIN_LIGHT_STAGES
      : choices[0]?.count || MIN_LIGHT_STAGES;
    return html`
      <label class="stage-pick" @click=${(ev: Event) => ev.stopPropagation()}>
        <span class="help">Levels</span>
        <select
          ?disabled=${!ready}
          @change=${(ev: Event) =>
            fireEvent(this, "studio-group-stages", {
              groupId: group.id,
              stages: Number((ev.target as HTMLSelectElement).value),
            })}
        >
          ${choices.map(
            (choice) => html`
              <option value=${String(choice.count)} ?selected=${choice.count === current}>
                ${choice.label}
              </option>
            `,
          )}
        </select>
      </label>
    `;
  }

  protected render() {
    return html`
      <div class="assign-board">
        <p class="help">
          ${this.help ||
          "Drag an entity into a group, or tap one and then tap a group. Warm and White need at least two lights, then pick 2–5 levels. Only lights in a group change on that group's looks. The rest stay off. The same light can belong to more than one group."}
        </p>
        <div
          class="pool ${this._over === "pool" ? "over" : ""}"
          @dragover=${(ev: DragEvent) => this._overZone("pool", ev)}
          @dragleave=${() => {
            this._over = undefined;
          }}
          @drop=${(ev: DragEvent) => this._drop("pool", ev)}
        >
          <span class="label">Entities</span>
          <div class="pool-chips">
            ${this.entities.map((entityId) => this._renderChip(entityId, ""))}
          </div>
        </div>
        <div class="lanes">
          ${this.groups.map((group) => {
            return html`
              <div
                class="lane ${this._over === group.id ? "over" : ""} ${group.entities.length
                  ? ""
                  : "pending"}"
                @dragover=${(ev: DragEvent) => this._overZone(group.id, ev)}
                @dragleave=${() => {
                  this._over = undefined;
                }}
                @drop=${(ev: DragEvent) => this._drop(group.id, ev)}
                @click=${() => this._laneClick(group.id)}
              >
                <div class="item-head">
                  ${this.editable
                    ? html`
                        <input
                          type="text"
                          .value=${group.name}
                          placeholder="Group name"
                          @click=${(ev: Event) => ev.stopPropagation()}
                          @input=${(ev: Event) =>
                            fireEvent(this, "studio-group-name", {
                              groupId: group.id,
                              name: (ev.target as HTMLInputElement).value,
                            })}
                        />
                        <button
                          class="ghost"
                          type="button"
                          @click=${(ev: Event) => {
                            ev.stopPropagation();
                            fireEvent(this, "studio-group-remove", {
                              groupId: group.id,
                            });
                          }}
                        >
                          Remove
                        </button>
                      `
                    : html`<strong>${group.name}</strong>`}
                </div>
                <div class="pool-chips">
                  ${group.entities.map((entityId) => this._renderChip(entityId, group.id))}
                </div>
                ${group.entities.length
                  ? group.showStages && group.entities.length < this._minEntities(group)
                    ? html`<p class="help">
                        Add at least ${this._minEntities(group)}
                        light${this._minEntities(group) === 1 ? "" : "s"} for levels.
                      </p>`
                    : nothing
                  : html`<p class="help">Drop entities here</p>`}
                ${group.showStages ? this._renderStageSelect(group) : nothing}
              </div>
            `;
          })}
        </div>
        ${this.editable
          ? html`
              <button
                class="secondary"
                type="button"
                @click=${() => fireEvent(this, "studio-group-add")}
              >
                Add group
              </button>
            `
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [STUDIO_ASSIGN]: SceneStudioAssign;
  }
}

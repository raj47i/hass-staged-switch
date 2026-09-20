import { html, nothing } from "lit";
import {
  checkboxChecked,
  hiddenEntityIds,
  SHOW_ENTITY_BUTTONS_LABEL,
} from "../shared/entity-buttons";
import { entityDisplayName } from "../shared/entities";
import type { HomeAssistant } from "../shared/types";
import { draftFromAdvancedScenes } from "./advanced";
import { parseStudioSceneId } from "./ids";
import { draftFromLightScenes } from "./lights";
import { draftFromScenes } from "./scenes";
import type { SceneConfig, StudioSetKind } from "./types";

export {
  checkboxChecked,
  hiddenEntityIds,
  overlayHiddenEntities,
  pruneHiddenEntities,
  SHOW_ENTITY_BUTTONS_LABEL,
  showsEntityButtons,
  toggleHiddenEntity,
} from "../shared/entity-buttons";
export type { EntityButtonsConfig } from "../shared/entity-buttons";

export const studioSetEntityIds = (
  slug: string | undefined,
  scenes: SceneConfig[],
  kind?: StudioSetKind,
): string[] => {
  if (!slug) {
    return [];
  }
  const mine = scenes.filter((scene) => {
    const parsed = parseStudioSceneId(scene.id);
    return parsed?.slug === slug && (!kind || parsed.kind === kind);
  });
  if (!mine.length) {
    return [];
  }
  const parsed = parseStudioSceneId(mine[0]?.id);
  if (parsed?.kind === "light" || parsed?.kind === "minimal") {
    return draftFromLightScenes(slug, mine).entities;
  }
  if (parsed?.kind === "advanced") {
    return draftFromAdvancedScenes(slug, mine).entities;
  }
  return draftFromScenes(slug, mine).entities;
};

export const renderEntityButtonsEditor = (opts: {
  hass?: HomeAssistant;
  enabled: boolean;
  entities: string[];
  hidden?: string[];
  onEnabled: (enabled: boolean) => void;
  onVisible: (entityId: string, visible: boolean) => void;
  emptyHint?: string;
}) => {
  const hidden = new Set(hiddenEntityIds({ hidden_entities: opts.hidden }));
  return html`
    <div class="inline">
      <span class="label">${SHOW_ENTITY_BUTTONS_LABEL}</span>
      <input
        type="checkbox"
        .checked=${opts.enabled}
        @change=${(ev: Event) => opts.onEnabled(checkboxChecked(ev))}
      />
    </div>
    ${opts.enabled
      ? opts.entities.length
        ? html`
            <div class="row">
              <span class="help">
                These buttons sit under the scene controls. Every entity in the
                scene set is listed, including ones not in a group. Uncheck a
                name to hide it. New entities stay checked.
              </span>
              <div class="list">
                ${opts.entities.map(
                  (entityId) => html`
                    <label class="inline">
                      <span class="label"
                        >${entityDisplayName(opts.hass, entityId)}</span
                      >
                      <input
                        type="checkbox"
                        .checked=${!hidden.has(entityId)}
                        @change=${(ev: Event) =>
                          opts.onVisible(entityId, checkboxChecked(ev))}
                      />
                    </label>
                  `,
                )}
              </div>
            </div>
          `
        : html`
            <span class="help"
              >${opts.emptyHint ?? "No entities in this scene set yet."}</span
            >
          `
      : nothing}
  `;
};

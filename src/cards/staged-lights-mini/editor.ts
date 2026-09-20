import { customElement } from "lit/decorators.js";
import { registerCardAliases } from "../../shared";
import { StagedLightsCardEditor } from "../staged-lights/editor";
import { isLightsCardConfig } from "../staged-lights/roster";
import type { StagedLightsCardConfig } from "../staged-lights/types";
import { CARD_LEGACY_NAME, CARD_NAME } from "./const";

@customElement(`${CARD_NAME}-editor`)
export class StagedLightsMiniCardEditor extends StagedLightsCardEditor {
  public setConfig(config: StagedLightsCardConfig): void {
    if (!isLightsCardConfig(config)) {
      return;
    }
    super.setConfig(config);
  }

  protected get _entityButtonsEnabled(): boolean {
    return Boolean(this._config?.studio);
  }
}

registerCardAliases(`${CARD_NAME}-editor`, [`${CARD_LEGACY_NAME}-editor`]);

declare global {
  interface HTMLElementTagNameMap {
    [CARD_NAME + "-editor"]: StagedLightsMiniCardEditor;
    [CARD_LEGACY_NAME + "-editor"]: StagedLightsMiniCardEditor;
  }
}

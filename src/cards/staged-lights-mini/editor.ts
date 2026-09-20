import { customElement } from "lit/decorators.js";
import { StagedLightsCardEditor } from "../staged-lights/editor";
import { isLightsCardConfig } from "../staged-lights/roster";
import type { StagedLightsCardConfig } from "../staged-lights/types";
import { CARD_NAME } from "./const";

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

declare global {
  interface HTMLElementTagNameMap {
    "staged-lights-mini-card-editor": StagedLightsMiniCardEditor;
  }
}

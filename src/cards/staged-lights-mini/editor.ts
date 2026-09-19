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
    const rest = { ...config };
    delete rest.show_switches;
    super.setConfig(rest);
  }

  protected get _entityButtonsEnabled(): boolean {
    return false;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "staged-lights-mini-card-editor": StagedLightsMiniCardEditor;
  }
}

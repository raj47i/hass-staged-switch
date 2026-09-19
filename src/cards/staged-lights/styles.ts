import { css } from "lit";
import {
  sharedCardChrome,
  sharedEditorStyles,
  sharedEntityChips,
} from "../../shared/styles";

const lightsStyles = css`
  .stage-name {
    margin-top: 2px;
    font-size: 14px;
    font-weight: 500;
    color: var(--primary-color);
  }

  .stage-value {
    flex-shrink: 0;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-color);
    background: color-mix(
      in srgb,
      var(--primary-color) 14%,
      var(--card-background-color, #fff)
    );
  }

  .slider-section {
    --slider-button-height: 64px;
    --slider-dot-size: 36px;
    --slider-track-height: 3px;
    --slider-well-pad-x: 10px;
    --power-button-size: 64px;
    --slider-icon-size: 24px;
    --slider-dot-icon-size: 20px;
    --stage-label-gap: 3px;
    --stage-label-height: 12px;
    --preset-height: 26px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px 16px;
  }

  .mode-group {
    --mode-gap: 10px;
    display: grid;
    grid-template-columns: var(--power-button-size) minmax(0, 1fr);
    grid-template-rows: repeat(var(--mode-rows, 3), minmax(var(--slider-button-height), auto));
    column-gap: var(--mode-gap);
    row-gap: 0;
    align-items: stretch;
    width: 100%;
    padding: 8px var(--slider-well-pad-x);
    border-radius: 8px;
    background: var(
      --slider-bar-background,
      color-mix(
        in srgb,
        var(--primary-text-color) 8%,
        var(--card-background-color, #fff)
      )
    );
  }

  .power-bar {
    grid-column: 1;
    grid-row: 1 / span var(--mode-rows, 3);
    display: grid;
    grid-template-rows: subgrid;
    overflow: hidden;
    border-radius: 8px;
    background: var(--card-background-color, #fff);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--primary-text-color) 12%, transparent);
  }

  @supports not (grid-template-rows: subgrid) {
    .power-bar {
      display: flex;
      flex-direction: column;
    }

    .power-bar .power-icon {
      flex: 1 1 0;
    }
  }

  .mode-rule {
    grid-column: 1 / -1;
    align-self: end;
    z-index: 4;
    height: 1px;
    pointer-events: none;
    background: color-mix(in srgb, var(--primary-text-color) 14%, transparent);
  }

  .mode-controls {
    position: relative;
    display: flex;
    grid-column: 2;
    align-self: stretch;
    min-width: 0;
    width: 100%;
    padding: 0;
  }

  .mode-controls.power-off .slider-fill,
  .mode-controls.power-off .brightness {
    opacity: 0.55;
  }

  .rgb-controls {
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    min-height: var(--slider-button-height);
  }

  .stage-controls {
    align-items: center;
    justify-content: space-between;
    min-height: var(--slider-button-height);
  }

  .slider-visual {
    position: absolute;
    left: calc(var(--slider-dot-size) / 2);
    right: calc(var(--slider-dot-size) / 2);
    top: calc(
      50% - (var(--stage-label-gap) + var(--stage-label-height)) / 2
    );
    height: 0;
    pointer-events: none;
    z-index: 1;
  }

  .slider-line,
  .slider-fill {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: var(--slider-track-height);
    transform: translateY(-50%);
    border-radius: 999px;
  }

  .slider-line {
    background: var(--card-background-color, #fff);
  }

  .slider-fill {
    right: auto;
    width: var(--slider-progress, 0%);
    background: var(--primary-color, #03a9f4);
  }

  .power-icon {
    position: relative;
    z-index: 3;
    display: inline-flex;
    flex-direction: column;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    min-height: 0;
    height: auto;
    margin: 0;
    padding: 6px;
    border: 0;
    border-radius: 0;
    appearance: none;
    background: transparent;
    box-shadow: none;
    color: var(
      --state-inactive-color,
      var(--state-icon-color, var(--secondary-text-color, #9e9e9e))
    );
    cursor: pointer;
  }

  .power-icon.on {
    color: var(
      --state-active-color,
      var(
        --state-icon-active-color,
        var(--paper-item-icon-active-color, var(--primary-color))
      )
    );
    background: color-mix(
      in srgb,
      var(
          --state-active-color,
          var(--state-icon-active-color, var(--primary-color))
        )
        16%,
      var(--card-background-color, #fff)
    );
  }

  .power-icon:focus-visible,
  .swatch:focus-visible,
  .slider-dot:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .power-icon ha-icon {
    display: inline-flex;
    width: var(--slider-icon-size);
    height: var(--slider-icon-size);
    --mdc-icon-size: var(--slider-icon-size);
    color: inherit;
  }

  .brightness {
    display: block;
    width: 100%;
    height: 14px;
    margin: 0;
    appearance: none;
    border-radius: 999px;
    background: linear-gradient(to right, #111, var(--current-color, #ff8a1d));
    outline: none;
  }

  .brightness::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: var(--current-color, #ff8a1d);
    box-shadow: 0 0 0 1px color-mix(in srgb, #000 25%, transparent);
    cursor: pointer;
  }

  .brightness::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: var(--current-color, #ff8a1d);
    box-shadow: 0 0 0 1px color-mix(in srgb, #000 25%, transparent);
    cursor: pointer;
  }

  .presets {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .swatch,
  .picker-wrap {
    flex: 1 1 0;
    min-width: 0;
    height: var(--preset-height);
  }

  .swatch {
    padding: 0;
    border: 0;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 18%, transparent);
    cursor: pointer;
  }

  .swatch.selected,
  .picker-wrap.selected .picker-button {
    box-shadow: inset 0 0 0 2px var(--primary-color, #03a9f4);
  }

  .picker-wrap {
    position: relative;
  }

  .picker-button {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: conic-gradient(
      #f44336,
      #ffeb3b,
      #4caf50,
      #00bcd4,
      #2196f3,
      #9c27b0,
      #f44336
    );
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 18%, transparent);
    cursor: pointer;
  }

  .picker-wrap input[type="color"] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }

  .slider-dot-slot {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: var(--stage-label-gap);
    min-width: 0;
    cursor: pointer;
  }

  .slider-dot {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: var(--slider-dot-size);
    height: var(--slider-dot-size);
    padding: 0;
    border: 0;
    border-radius: 8px;
    box-sizing: border-box;
    background-color: var(--card-background-color, #fff);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    color: var(
      --state-inactive-color,
      var(--state-icon-color, var(--secondary-text-color, #9e9e9e))
    );
    cursor: pointer;
  }

  .slider-dot.done {
    background-color: color-mix(
      in srgb,
      var(--primary-color, #03a9f4) 22%,
      var(--card-background-color, #fff)
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--primary-color, #03a9f4) 40%, transparent);
    color: var(--primary-color, #03a9f4);
  }

  .slider-dot.current {
    background-color: color-mix(
      in srgb,
      var(--primary-color, #03a9f4) 28%,
      #10243f
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--primary-color, #03a9f4) 55%, transparent);
    color: #fff;
  }

  .slider-dot.todo {
    background-color: var(--card-background-color, #fff);
  }

  .slider-dot ha-icon {
    display: inline-flex;
    width: var(--slider-dot-icon-size);
    height: var(--slider-dot-icon-size);
    --mdc-icon-size: var(--slider-dot-icon-size);
    color: inherit;
  }

  .tick {
    max-width: 100%;
    padding: 0 2px;
    overflow: hidden;
    border: 0;
    background: none;
    font: inherit;
    font-size: 10px;
    line-height: 12px;
    letter-spacing: 0.01em;
    text-align: center;
    pointer-events: none;
    color: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.7;
  }

  .tick.active {
    font-weight: 500;
    opacity: 0.88;
  }

  .slider-dot-slot > .tick {
    display: -webkit-box;
    width: 100%;
    color: var(--secondary-text-color);
    overflow-wrap: anywhere;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }

  .slider-dot-slot > .tick.active {
    color: var(--primary-text-color);
  }

  .showcase {
    --power-button-size: 48px;
    --slider-dot-size: 26px;
    --slider-button-height: 48px;
    --slider-icon-size: 20px;
    --slider-dot-icon-size: 14px;
    --preset-height: 18px;
  }

  .showcase .header {
    padding-bottom: 0;
  }

  .showcase .slider-section {
    padding-top: 10px;
  }

  .showcase .power-icon,
  .showcase .slider-dot,
  .showcase .switch-status,
  .showcase .swatch,
  .showcase .picker-button,
  .showcase .picker-wrap input,
  .showcase .brightness {
    pointer-events: none;
    cursor: default;
  }
`;

const lightsEditorStyles = css`
  .step-groups {
    display: grid;
    gap: 12px;
  }

  .step-group {
    display: grid;
    gap: 8px;
  }

  .steps {
    flex-wrap: wrap;
  }

  .steps button {
    flex: 1 1 calc(33.33% - 8px);
    min-width: 84px;
  }

  ha-icon-picker {
    width: 100%;
  }

  .preset-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preset-row input[type="color"] {
    width: 48px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    background: none;
    cursor: pointer;
  }

  .preset-row .hex {
    flex: 1 1 auto;
    font-size: 13px;
    color: var(--secondary-text-color);
  }
`;

export const cardStyles = [sharedCardChrome, sharedEntityChips, lightsStyles];
export const editorStyles = [sharedEditorStyles, lightsEditorStyles];

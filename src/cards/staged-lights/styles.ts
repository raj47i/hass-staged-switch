import { css } from "lit";
import {
  sharedCardChrome,
  sharedEditorStyles,
  sharedEntityChips,
} from "../../shared/styles";

const lightsStyles = css`
  .slider-section {
    --slider-button-height: 64px;
    --slider-dot-size: 36px;
    --slider-track-height: 3px;
    --power-button-size: 48px;
    --power-icon-size: 36px;
    --slider-icon-size: 24px;
    --slider-dot-icon-size: 20px;
    --stage-label-gap: 3px;
    --preset-height: 26px;
    --rgb-value-width: 36px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: 8px;
  }

  .mode-group {
    --mode-gap: 8px;
    display: grid;
    grid-template-columns: var(--power-button-size) minmax(0, 1fr);
    grid-template-rows: repeat(var(--mode-rows, 3), minmax(var(--slider-button-height), auto));
    column-gap: var(--mode-gap);
    row-gap: 0;
    align-items: stretch;
    overflow: visible;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    background: none;
  }

  .power-bar {
    grid-column: 1;
    grid-row: 1 / span var(--mode-rows, 3);
    display: grid;
    grid-template-rows: subgrid;
    overflow: visible;
    background: none;
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
    align-items: center;
    align-self: stretch;
    overflow: hidden;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    height: 100%;
    padding: 0;
  }

  .mode-controls.power-off .brightness,
  .mode-controls.power-off .swatch,
  .mode-controls.power-off .picker-wrap,
  .mode-controls.power-off .picker-button {
    filter: grayscale(1);
    opacity: 0.38;
  }

  .mode-controls.power-off .brightness-value {
    color: var(--secondary-text-color);
    opacity: 0.45;
  }

  .mode-controls.power-off .slider-fill {
    opacity: 0.28;
    background: color-mix(in srgb, var(--primary-text-color) 40%, transparent);
  }

  .mode-controls.power-off .slider-dot,
  .mode-controls.power-off .slider-dot.done,
  .mode-controls.power-off .slider-dot.current,
  .mode-controls.power-off .slider-dot.todo {
    background-color: color-mix(
      in srgb,
      var(--primary-text-color) 8%,
      var(--card-background-color, #fff)
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--primary-text-color) 10%, transparent);
    color: var(
      --state-inactive-color,
      var(--state-icon-color, var(--secondary-text-color, #9e9e9e))
    );
  }

  .mode-controls.power-off .slider-dot.current {
    background-color: color-mix(
      in srgb,
      var(--primary-text-color) 16%,
      var(--card-background-color, #fff)
    );
  }

  .mode-controls.power-off .tick,
  .mode-controls.power-off .slider-dot-slot > .tick,
  .mode-controls.power-off .slider-dot-slot > .tick.active {
    color: var(--secondary-text-color);
    opacity: 0.5;
  }

  .rgb-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--rgb-value-width);
    grid-template-rows: auto auto;
    align-content: center;
    align-items: center;
    column-gap: 6px;
    row-gap: 8px;
    min-width: 0;
    min-height: var(--slider-button-height);
  }

  .brightness-value {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--primary-text-color);
  }

  .stage-controls {
    min-width: 0;
    width: 100%;
    max-width: 100%;
    min-height: var(--slider-button-height);
  }

  .stage-track {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    width: 100%;
    min-width: 0;
  }

  .slider-visual {
    position: absolute;
    left: min(
      calc(var(--slider-dot-size) / 2),
      calc(100% / (2 * var(--stage-count, 2)))
    );
    right: min(
      calc(var(--slider-dot-size) / 2),
      calc(100% / (2 * var(--stage-count, 2)))
    );
    top: calc(var(--slider-dot-size) / 2);
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
    background: color-mix(in srgb, var(--primary-text-color) 14%, transparent);
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
    padding: 0;
    border: 0;
    border-radius: 0;
    appearance: none;
    background: transparent;
    box-shadow: none;
    color: var(--secondary-text-color, #727272);
    cursor: pointer;
  }

  .power-icon.on {
    color: var(--primary-text-color);
    background: transparent;
  }

  .power-icon .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--power-icon-size);
    height: var(--power-icon-size);
    border-radius: 50%;
    background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    color: var(
      --state-inactive-color,
      var(--state-icon-color, var(--secondary-text-color, #9e9e9e))
    );
  }

  .power-icon.on .icon {
    background: var(
      --state-icon-active-color,
      var(
        --state-light-active-color,
        var(--state-active-color, var(--paper-item-icon-active-color, #fdd835))
      )
    );
    color: #212121;
  }

  .power-icon:focus-visible {
    outline: none;
  }

  .power-icon:focus-visible .icon,
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
    --iron-icon-width: var(--slider-icon-size);
    --iron-icon-height: var(--slider-icon-size);
    --icon-primary-color: currentColor;
    --state-icon-color: currentColor;
    color: inherit;
  }

  .power-icon ha-icon svg {
    display: block;
    width: var(--slider-icon-size);
    height: var(--slider-icon-size);
    fill: currentColor;
  }

  .brightness {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
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
    flex-wrap: nowrap;
    align-items: center;
    gap: 6px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .swatch {
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
    width: 100%;
    min-width: 0;
    height: var(--preset-height);
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
    flex: 0 1 var(--slider-dot-size);
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    align-self: flex-start;
    gap: var(--stage-label-gap);
    width: var(--slider-dot-size);
    height: auto;
    min-width: 0;
    max-width: 100%;
    cursor: pointer;
  }

  .slider-dot {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: var(--slider-dot-size);
    aspect-ratio: 1;
    height: auto;
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
    --power-button-size: 40px;
    --power-icon-size: 28px;
    --slider-dot-size: 26px;
    --slider-button-height: 48px;
    --slider-icon-size: 18px;
    --slider-dot-icon-size: 14px;
    --preset-height: 18px;
    --rgb-value-width: 28px;
  }

  .showcase .slider-section {
    padding: 8px;
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

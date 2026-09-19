import { css } from "lit";
import {
  sharedCardChrome,
  sharedEditorStyles,
  sharedEntityChips,
} from "../../shared/styles";

const stagedSwitchStyles = css`
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
    --slider-thumb-size: 36px;
    --slider-button-height: 64px;
    --slider-dot-size: 36px;
    --slider-track-height: 3px;
    --slider-well-pad-x: 10px;
    --power-button-size: 64px;
    --slider-icon-size: 24px;
    --slider-dot-icon-size: 20px;
    --stage-label-gap: 3px;
    --stage-label-height: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px 16px;
  }

  .slider-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 72px;
    padding: 10px var(--slider-well-pad-x);
    border-radius: 8px;
    cursor: default;
    background: var(
      --slider-bar-background,
      color-mix(
        in srgb,
        var(--primary-text-color) 8%,
        var(--card-background-color, #fff)
      )
    );
  }

  .slider-wrap.power-off .slider-fill {
    opacity: 0.4;
  }

  .slider-main {
    position: relative;
    display: grid;
    grid-template-columns: repeat(calc(var(--stage-count, 1) + 1), minmax(0, 1fr));
    align-items: center;
    width: 100%;
    min-height: var(--slider-button-height);
  }

  .slider-wrap.single .slider-main {
    display: flex;
    grid-template-columns: none;
    justify-content: flex-start;
  }

  .slider-wrap.has-labels .slider-main {
    padding-bottom: 2px;
  }

  .power-icon {
    position: relative;
    z-index: 3;
    display: inline-flex;
    flex-direction: column;
    flex-shrink: 0;
    justify-self: center;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: var(--power-button-size);
    height: var(--power-button-size);
    padding: 6px;
    border: 0;
    border-radius: 8px;
    background: var(--card-background-color, #fff);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--primary-text-color) 12%, transparent);
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
    box-shadow: inset 0 0 0 1px
      color-mix(
        in srgb,
        var(
            --state-active-color,
            var(--state-icon-active-color, var(--primary-color))
          )
          35%,
        transparent
      );
  }

  .power-icon:focus-visible {
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

  .slider-visual {
    position: absolute;
    left: calc(100% / (2 * (var(--stage-count, 1) + 1)));
    right: calc(100% / (2 * (var(--stage-count, 1) + 1)));
    top: 50%;
    height: 0;
    pointer-events: none;
    z-index: 1;
  }

  .slider-wrap.has-labels .slider-visual {
    top: calc(
      50% - (var(--stage-label-gap) + var(--stage-label-height)) / 2
    );
  }

  .slider-wrap.single .slider-visual {
    display: none;
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

  .slider-dot:hover {
    background-color: color-mix(
      in srgb,
      var(--primary-text-color) 6%,
      var(--card-background-color, #fff)
    );
  }

  .slider-dot:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .slider-dot:disabled {
    cursor: default;
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
    --iron-icon-width: var(--slider-dot-icon-size);
    --iron-icon-height: var(--slider-dot-icon-size);
    --icon-primary-color: currentColor;
    --state-icon-color: currentColor;
    color: inherit;
  }

  .slider-dot ha-icon svg {
    display: block;
    width: var(--slider-dot-icon-size);
    height: var(--slider-dot-icon-size);
    fill: currentColor;
  }

  .slider-wrap.single {
    justify-content: flex-start;
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
  }

  .power-icon .tick {
    color: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.7;
  }

  .slider-dot-slot > .tick {
    display: -webkit-box;
    width: 100%;
    color: var(--secondary-text-color);
    opacity: 0.7;
    overflow-wrap: anywhere;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .tick.active {
    font-weight: 500;
    opacity: 0.88;
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
    --stage-label-gap: 0px;
    --stage-label-height: 0px;
  }

  .showcase .header {
    padding-bottom: 0;
  }

  .showcase .slider-section {
    padding-top: 10px;
  }

  .showcase-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--slider-button-height);
    padding: 8px 10px;
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

  .showcase-track {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    height: var(--slider-dot-size);
  }

  .showcase-dots {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
  }

  .showcase-track .slider-line,
  .showcase-track .slider-fill {
    left: 0;
    right: 0;
    top: 50%;
  }

  .showcase .power-icon,
  .showcase .slider-dot,
  .showcase .switch-status {
    pointer-events: none;
    cursor: default;
  }
`;

export const cardStyles = [
  sharedCardChrome,
  sharedEntityChips,
  stagedSwitchStyles,
];

export const editorStyles = [sharedEditorStyles];

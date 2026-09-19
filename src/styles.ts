import { css } from "lit";

export const cardStyles = css`
  :host {
    display: block;
  }

  ha-card {
    overflow: hidden;
    background: var(--ha-card-background, var(--card-background-color, #fff));
  }

  .warning,
  .notice {
    padding: 8px 16px 0;
    font-size: 13px;
  }

  .warning {
    color: var(--error-color, #db4437);
  }

  ha-card > .warning:first-child,
  ha-card > .notice:first-child {
    padding: 16px;
  }

  .notice {
    color: var(--warning-color, #ff9800);
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 16px 4px;
  }

  .titles {
    min-width: 0;
  }

  .title {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    line-height: 24px;
    color: var(--primary-text-color);
  }

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
    --slider-dot-size: 36px;
    --slider-track-height: 3px;
    --slider-well-pad-x: 10px;
    --power-button-size: 36px;
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
    min-height: 56px;
    padding: 8px var(--slider-well-pad-x) 6px 8px;
    border-radius: 8px;
    cursor: pointer;
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
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
  }

  .power-icon {
    position: relative;
    z-index: 3;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: var(--power-button-size);
    height: var(--power-button-size);
    padding: 0;
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
    width: 22px;
    height: 22px;
    --mdc-icon-size: 22px;
    --iron-icon-width: 22px;
    --iron-icon-height: 22px;
    --icon-primary-color: currentColor;
    --state-icon-color: currentColor;
    color: inherit;
  }

  .power-icon ha-icon svg {
    display: block;
    width: 22px;
    height: 22px;
    fill: currentColor;
  }

  .slider-track {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 36px;
  }

  .slider-wrap.single .slider-track {
    display: none;
  }

  .slider-visual {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 0;
    pointer-events: none;
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

  .slider-dots {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 0;
    z-index: 2;
  }

  .slider-dot {
    position: absolute;
    top: 0;
    left: calc(
      var(--dot-index) * 100% / max(var(--max-index, 1), 1)
    );
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--slider-dot-size);
    height: var(--slider-dot-size);
    padding: 0;
    transform: translate(-50%, -50%);
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

  .slider-dots .slider-dot:last-child {
    transform: translate(-100%, -50%);
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
    width: 20px;
    height: 20px;
    --mdc-icon-size: 20px;
    --iron-icon-width: 20px;
    --iron-icon-height: 20px;
    --icon-primary-color: currentColor;
    --state-icon-color: currentColor;
    color: inherit;
  }

  .slider-dot ha-icon svg {
    display: block;
    width: 20px;
    height: 20px;
    fill: currentColor;
  }

  .slider-dot .tick {
    position: absolute;
    top: calc(100% + 2px);
    left: 50%;
    max-width: 76px;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .slider-dots .slider-dot:last-child .tick {
    left: auto;
    right: 0;
    transform: none;
    text-align: right;
  }

  .slider-wrap.single {
    justify-content: flex-start;
  }

  .ticks-row {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
  }

  .ticks {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 14px;
  }

  .tick {
    position: absolute;
    left: calc(
      var(--dot-index) * 100% / max(var(--max-index, 1), 1)
    );
    transform: translateX(-50%);
    max-width: 30%;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: none;
    color: var(--secondary-text-color);
    font: inherit;
    font-size: 10px;
    line-height: 14px;
    letter-spacing: 0.01em;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.55;
    pointer-events: none;
  }

  .tick.power-tick {
    position: relative;
    left: auto;
    flex: 0 0 var(--power-button-size);
    max-width: none;
    transform: none;
  }

  .ticks .tick:last-child {
    transform: translateX(-100%);
  }

  .tick.active {
    color: var(--primary-text-color);
    font-weight: 500;
    opacity: 0.72;
  }

  .switches {
    display: flex;
    align-items: stretch;
    overflow: hidden;
    width: 100%;
    margin: 0;
    padding: 0;
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

  .switch-status {
    display: inline-flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    width: auto;
    min-width: 0;
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font: inherit;
    color: var(
      --state-inactive-color,
      var(--state-icon-color, var(--secondary-text-color, #9e9e9e))
    );
    cursor: pointer;
  }

  .switch-status:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  }

  .switch-status:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
    z-index: 1;
  }

  .switch-status + .switch-status {
    border-left: 1px solid
      color-mix(in srgb, var(--primary-text-color) 10%, transparent);
  }

  .switch-status ha-state-icon,
  .switch-status ha-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    --mdc-icon-size: 24px;
    --iron-icon-width: 24px;
    --iron-icon-height: 24px;
    --ha-icon-display: block;
    --icon-primary-color: currentColor;
    --state-icon-color: currentColor;
    color: inherit;
  }

  .switch-status ha-state-icon svg,
  .switch-status ha-icon svg {
    display: block;
    width: 24px;
    height: 24px;
    fill: currentColor;
  }

  .switch-status.on {
    color: var(
      --state-domain-active-color,
      var(
        --state-active-color,
        var(
          --state-icon-active-color,
          var(--paper-item-icon-active-color, var(--primary-color))
        )
      )
    );
  }

  .switch-status.unavailable,
  .switch-status.unknown,
  .switch-status.missing {
    color: var(--state-unavailable-color, var(--disabled-color, #9e9e9e));
    cursor: default;
  }
`;

export const editorStyles = css`
  :host {
    display: block;
  }

  .form {
    display: grid;
    gap: 16px;
  }

  .row {
    display: grid;
    gap: 8px;
  }

  .inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .label {
    font-size: 14px;
    font-weight: 500;
    color: var(--primary-text-color);
  }

  .help {
    font-size: 12px;
    color: var(--secondary-text-color);
  }

  ha-textfield,
  ha-entity-picker,
  ha-select {
    width: 100%;
  }

  .list {
    display: grid;
    gap: 10px;
  }

  .item {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 12px;
    background: var(--card-background-color, #fff);
  }

  .item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .actions {
    display: flex;
    justify-content: flex-start;
  }

  mwc-button,
  ha-button {
    margin-top: 4px;
  }
`;

import { css } from "lit";

export const sharedCardChrome = css`
  :host {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  ha-card {
    overflow: hidden;
    width: 100%;
    max-width: 100%;
    min-width: 0;
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

  .empty {
    padding: 8px 16px 16px;
    font-size: 14px;
    line-height: 20px;
    color: var(--secondary-text-color);
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
`;

export const sharedEntityChips = css`
  .switches {
    display: flex;
    flex-direction: column;
    gap: 0;
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

  .switch-row {
    display: flex;
    align-items: stretch;
    overflow: hidden;
    width: 100%;
    border-radius: 0;
    background: transparent;
  }

  .switch-row + .switch-row {
    border-top: 1px solid
      color-mix(in srgb, var(--primary-text-color) 10%, transparent);
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

export const sharedEditorStyles = css`
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
  ha-text-field,
  ha-entity-picker,
  ha-area-picker,
  ha-device-picker,
  ha-icon-picker,
  ha-select,
  .text-input {
    width: 100%;
  }

  .text-input {
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    font: inherit;
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

  .reorder {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .item.focused,
  ha-textfield.focused {
    box-shadow: inset 0 0 0 2px var(--primary-color);
  }

  .steps {
    display: flex;
    gap: 8px;
  }

  .steps button {
    flex: 1;
    padding: 8px 10px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    cursor: pointer;
  }

  .steps button.active {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    font-weight: 600;
  }

  .actions {
    display: flex;
    justify-content: flex-start;
  }

  .actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  mwc-button,
  ha-button {
    margin-top: 4px;
  }
`;

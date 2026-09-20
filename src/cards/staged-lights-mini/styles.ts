import { css } from "lit";
import { cardStyles as lightsCardStyles } from "../staged-lights/styles";

const miniStyles = css`
  .mode-bar {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    width: 100%;
    height: 56px;
    min-height: 56px;
    overflow: hidden;
    border-radius: var(--ha-control-border-radius, 10px);
    background: color-mix(
      in srgb,
      var(--disabled-color, var(--primary-text-color)) 15%,
      transparent
    );
  }

  .mode-bar .power-icon {
    flex-direction: row;
    width: auto;
    flex: 1 1 0;
    min-width: 0;
    gap: 8px;
    justify-content: flex-start;
    padding: 8px;
  }

  .mode-bar .power-icon + .power-icon {
    box-shadow: inset 1px 0 0 color-mix(in srgb, var(--primary-text-color) 12%, transparent);
  }

  .mode-bar .power-icon.on {
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
  }

  .mode-bar .copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-width: 0;
  }

  .mode-bar .tick,
  .mode-bar .tick.active {
    max-width: 100%;
    font-family: var(--ha-font-family-body, var(--ha-font-family, Roboto, Noto, sans-serif));
    font-size: var(--ha-font-size-m, 14px);
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: var(--ha-line-height-condensed, 20px);
    letter-spacing: 0.1px;
    color: var(--primary-text-color);
    text-align: left;
    opacity: 1;
  }

  .mode-bar .state {
    max-width: 100%;
    overflow: hidden;
    font-family: var(--ha-font-family-body, var(--ha-font-family, Roboto, Noto, sans-serif));
    font-size: var(--ha-font-size-s, 12px);
    font-weight: var(--ha-font-weight-normal, 400);
    line-height: 16px;
    letter-spacing: 0.4px;
    color: var(--secondary-text-color);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .control-row {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--slider-button-height);
  }

  .control-row .mode-controls {
    grid-column: auto;
    height: auto;
    flex: 1 1 auto;
  }

  .showcase .mode-bar .power-icon {
    pointer-events: none;
    cursor: default;
  }

  :host > .title {
    margin: 0 4px 8px;
    padding: 0;
  }
`;

export const cardStyles = [...lightsCardStyles, miniStyles];

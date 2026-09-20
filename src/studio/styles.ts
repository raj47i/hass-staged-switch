import { css } from "lit";

export const studioStyles = css`
  :host {
    --studio-surface: var(
      --card-background-color,
      var(--ha-card-background, var(--secondary-background-color, #fff))
    );
    --studio-inset: color-mix(
      in srgb,
      var(--primary-text-color, #212121) 8%,
      var(--studio-surface)
    );
    --studio-chip: color-mix(
      in srgb,
      var(--primary-text-color, #212121) 14%,
      var(--studio-surface)
    );
    --studio-text: var(--primary-text-color, #212121);
    --studio-muted: var(--secondary-text-color, #727272);
    display: block;
    min-height: 100%;
    color: var(--studio-text);
    background: var(--primary-background-color, #f2f4f6);
    font: 14px/20px Roboto, system-ui, sans-serif;
    color-scheme: light dark;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .page {
    max-width: 920px;
    margin: 0 auto;
    padding: 24px 16px 48px;
  }

  .toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }

  .sidebar-pref {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex: 0 0 auto;
    margin-top: 6px;
    font-size: 13px;
    color: var(--studio-text);
    cursor: pointer;
    user-select: none;
  }

  .sidebar-pref input {
    margin-top: 2px;
  }

  .sidebar-pref .help {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: var(--studio-muted);
  }

  .create-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .create-card {
    display: grid;
    gap: 6px;
    padding: 16px 18px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 12px;
    background: var(--studio-surface);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    text-align: left;
    cursor: pointer;
    color: var(--studio-text);
    font: inherit;
  }

  .create-card strong {
    font-size: 16px;
    font-weight: 500;
  }

  .create-card.featured {
    border-color: color-mix(in srgb, var(--primary-color, #03a9f4) 55%, transparent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color, #03a9f4) 18%, transparent);
  }

  .create-card:hover:not(.later) {
    background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, var(--studio-surface));
  }

  .create-card.later {
    opacity: 0.58;
    cursor: default;
    box-shadow: none;
  }

  .kind {
    display: block;
    margin-bottom: 2px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--studio-muted);
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 8px;
  }

  .swatch {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--swatch, #ccc);
    cursor: pointer;
  }

  .swatch.active {
    border-color: var(--studio-text);
  }

  .swatch-edit {
    position: relative;
    width: 32px;
    height: 32px;
    overflow: hidden;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--studio-chip);
    cursor: pointer;
  }

  .swatch-edit.active {
    border-color: var(--studio-text);
  }

  .swatch-edit input[type="color"] {
    position: absolute;
    inset: -8px;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 0;
    cursor: pointer;
  }

  .memberships {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .memberships label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 16px;
    background: var(--studio-chip);
    box-shadow: inset 0 0 0 1px var(--divider-color, rgba(0, 0, 0, 0.12));
    color: var(--studio-text);
    font-size: 13px;
    cursor: pointer;
  }

  .memberships label.on {
    color: var(--primary-color, #03a9f4);
    box-shadow: inset 0 0 0 1px var(--primary-color, #03a9f4);
  }

  .effect-card {
    padding: 12px;
    border-radius: 12px;
    background: var(--studio-inset);
    color: var(--studio-text);
    box-shadow: none;
  }

  .effect-card select {
    appearance: none;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position:
      calc(100% - 16px) calc(50% - 3px),
      calc(100% - 11px) calc(50% - 3px);
    background-size:
      5px 5px,
      5px 5px;
    background-repeat: no-repeat;
    padding-right: 32px;
  }

  .music-sync {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border: 1px dashed var(--divider-color, rgba(0, 0, 0, 0.18));
    border-radius: 12px;
    color: var(--studio-text);
  }

  .music-sync strong {
    display: block;
  }

  .field.compact {
    width: auto;
  }

  .item.pending {
    border-style: dashed;
  }

  input[type="range"] {
    width: 100%;
  }

  input[type="color"] {
    width: 48px;
    height: 36px;
    padding: 2px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.14));
    border-radius: 8px;
    background: var(--studio-chip);
  }

  @media (max-width: 720px) {
    .create-grid {
      grid-template-columns: 1fr;
    }
  }

  h1,
  h2 {
    margin: 0;
    font-weight: 400;
  }

  h1 {
    font-size: 28px;
    line-height: 36px;
  }

  h2 {
    font-size: 20px;
    line-height: 28px;
  }

  .muted {
    margin: 4px 0 0;
    color: var(--studio-muted);
  }

  .card {
    background: var(--studio-surface);
    color: var(--studio-text);
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    padding: 20px;
  }

  .groups {
    display: grid;
    gap: 12px;
  }

  .group {
    width: 100%;
    padding: 16px 18px;
    border-radius: 12px;
    background: var(--studio-surface);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    color: var(--studio-text);
  }

  .group-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .group-main {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }

  .group-main .muted {
    margin: 0;
  }

  .group-main:hover:not(:disabled) strong {
    color: var(--primary-color, #03a9f4);
  }

  .group-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
  }

  .group-actions .ghost,
  .group-actions .danger {
    min-width: 88px;
  }

  .group.confirming {
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.12),
      inset 0 0 0 1px var(--error-color, #db4437);
  }

  .group-confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--error-color, #db4437) 45%, transparent);
  }

  .group-confirm p {
    margin: 0;
    max-width: 52ch;
    font-size: 13px;
    line-height: 18px;
    color: var(--studio-text);
  }

  .group-actions .danger {
    min-width: 148px;
  }

  .danger {
    border: 0;
    border-radius: 8px;
    padding: 10px 16px;
    background: var(--error-color, #db4437);
    color: var(--text-primary-color, #fff);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .empty {
    padding: 28px 8px;
    text-align: center;
    color: var(--studio-muted);
  }

  .primary,
  .secondary,
  .ghost {
    border-radius: 8px;
    padding: 10px 16px;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .primary {
    border: 0;
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
  }

  .secondary,
  .ghost {
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    background: var(--studio-inset);
    color: var(--studio-text);
  }

  .ghost {
    background: transparent;
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 20px;
  }

  .steps.steps-5 {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .assign-board {
    display: grid;
    gap: 14px;
  }

  .pool,
  .lane {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px dashed var(--divider-color, rgba(0, 0, 0, 0.16));
    border-radius: 12px;
    background: var(--studio-inset);
    color: var(--studio-text);
    min-height: 88px;
    min-width: 0;
    overflow: hidden;
  }

  .pool.over,
  .lane.over {
    border-color: var(--primary-color, #03a9f4);
    background: color-mix(in srgb, var(--primary-color, #03a9f4) 12%, var(--studio-surface));
  }

  .lanes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .pool-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .drag-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 0;
    border-radius: 16px;
    background: var(--studio-chip);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    color: var(--studio-text);
    font: inherit;
    cursor: grab;
  }

  .drag-chip.selected {
    outline: 2px solid var(--primary-color, #03a9f4);
  }

  .drag-x {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--studio-inset);
    color: var(--studio-text);
    cursor: pointer;
  }

  .chip.assign.look-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .look-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toggle {
    min-width: 56px;
    padding: 6px 12px;
    border: 0;
    border-radius: 16px;
    background: var(--studio-chip);
    color: var(--studio-text);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .toggle.on {
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
  }

  .bright-edit {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    gap: 4px 2px;
  }

  .bright-value {
    width: 52px;
    padding: 6px 4px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.14));
    border-radius: 8px;
    background: var(--studio-inset);
    color: var(--studio-text);
    font: inherit;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
  }

  .bright-suffix {
    color: var(--studio-muted);
    font-size: 13px;
  }

  .bright-slider {
    grid-column: 1 / -1;
    width: 160px;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--studio-muted);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    line-height: 16px;
    text-align: center;
  }

  .step .dot {
    width: 28px;
    height: 28px;
    margin: 0 auto;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--studio-chip);
    color: var(--studio-text);
    font-weight: 600;
  }

  .step.active {
    color: var(--primary-color, #03a9f4);
    font-weight: 500;
  }

  .step.active .dot,
  .step.done .dot {
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
  }

  .form {
    display: grid;
    gap: 16px;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  label span,
  .label {
    font-weight: 500;
    color: var(--studio-text);
  }

  input[type="text"],
  input[type="number"],
  input[type="search"],
  select,
  textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.14));
    border-radius: 8px;
    background: var(--studio-inset);
    color: var(--studio-text);
    font: inherit;
    color-scheme: inherit;
  }

  input::placeholder {
    color: var(--studio-muted);
    opacity: 1;
  }

  select option,
  select optgroup {
    background: var(--studio-surface);
    color: var(--studio-text);
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
    background: var(--studio-inset);
    color: var(--studio-text);
  }

  .item-head,
  .inline,
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .stage-pick {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .stage-pick select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    padding: 6px 8px;
    font-size: 12px;
  }

  .footer {
    margin-top: 20px;
  }

  .nav {
    display: flex;
    gap: 8px;
  }

  .help {
    color: var(--studio-muted);
    font-size: 13px;
  }

  .error {
    color: var(--error-color, #db4437);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: var(--studio-text);
  }

  th,
  td {
    padding: 8px 6px;
    border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
    text-align: left;
  }

  th {
    color: var(--studio-muted);
    font-weight: 500;
  }

  .on {
    color: var(--primary-color, #03a9f4);
    font-weight: 600;
  }

  .off {
    color: var(--studio-muted);
  }

  .review-wrap {
    overflow-x: auto;
  }

  tr.group-head td {
    padding: 0;
    background: var(--studio-inset);
    border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
  }

  .group-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 8px;
    border: 0;
    background: none;
    color: var(--studio-text);
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .group-toggle:disabled {
    cursor: default;
    opacity: 0.8;
  }

  .look-list,
  .look-group,
  .live-entities {
    display: grid;
    gap: 8px;
  }

  .look-group {
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
    border-radius: 12px;
    background: var(--studio-inset);
    overflow: hidden;
  }

  .look-item,
  .live-entity-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .look-item {
    padding: 12px 14px;
    border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
    background: var(--studio-surface);
  }

  .look-item > :first-child {
    min-width: 0;
    flex: 1;
  }

  .look-item .help,
  .live-entity .help {
    margin-top: 2px;
  }

  .live-entity {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: 12px;
    background: var(--studio-inset);
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
  }

  .live-entity .bright-slider {
    width: 100%;
  }

  .group-toggle .chevron {
    width: 1em;
    color: var(--studio-muted);
  }

  .group-toggle .help {
    margin-left: auto;
    font-weight: 400;
  }

  .chips {
    display: grid;
    gap: 8px;
  }

  .chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--studio-chip);
    color: var(--studio-text);
  }

  .chip.assign {
    display: grid;
    gap: 8px;
  }

  .row-card {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: 12px;
    background: var(--studio-inset);
    color: var(--studio-text);
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
  }

  .row-card.pending {
    border-style: dashed;
  }

  .stage-dots {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .stage-dot {
    display: inline-grid;
    place-items: center;
    min-width: 44px;
    height: 36px;
    padding: 0 10px;
    border-radius: 18px;
    background: var(--studio-chip);
    color: var(--studio-text);
    box-shadow: inset 0 0 0 1px var(--divider-color, rgba(0, 0, 0, 0.12));
    font-size: 12px;
    font-weight: 500;
  }

  .inline.tight {
    justify-content: space-between;
  }

  .bulk,
  .pick {
    display: grid;
    gap: 12px;
  }

  .pick-filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .pick-results {
    display: grid;
    gap: 6px;
    max-height: 280px;
    overflow: auto;
  }

  .pick-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    border-radius: 10px;
    background: var(--studio-inset);
    color: var(--studio-text);
    text-align: left;
    cursor: pointer;
  }

  .pick-row .muted {
    margin: 0;
    font-size: 12px;
  }

  .pick-row:hover,
  .pick-row:focus-visible {
    box-shadow: inset 0 0 0 1px var(--primary-color, #03a9f4);
  }

  @media (max-width: 720px) {
    .pick-filters {
      grid-template-columns: 1fr;
    }
  }
`;

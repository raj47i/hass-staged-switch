# Staged Switch Card

![Staged Switch Card on a Home Assistant dashboard](images/staged-switch-card.png)

A Home Assistant Lovelace card that combines several toggles into one staged control. Each position is a **stage**. Choosing a stage writes it to an `input_number` helper and turns the mapped entities on or off together.

The control looks like a progress bar, but it is a set of buttons — it is not a draggable slider. The leftmost **Power** button turns the whole group off or back on. Power off always turns every entity on the card off. The helper remembers only the last stage, not individual chip states.

Use it when one control should represent a sequence, for example:

- Pool pump → heater → lights
- Hall light → reading lamp → accent lights
- Fan low / medium / high using three switches
- Irrigation zones that come on one after another

The plugin is a single frontend file (`staged-switch-card.js`) for [HACS](https://hacs.xyz/). It currently ships two cards: **Staged Switch Card** and **Staged Lights Card**.

## How to use it

You need three things: the plugin, a number helper for the current stage, and a list of entities to combine.

### 1. Install the plugin

**HACS (recommended)**

1. Install [HACS](https://hacs.xyz/docs/setup/download) if needed.
2. Open **HACS → Frontend**.
3. Three-dot menu → **Custom repositories**.
4. Add `https://github.com/raj47i/hass-staged-switch` and set the type to **Lovelace** / **Dashboard**.
5. Install **Staged Switch Card**.
6. Reload Lovelace resources (or restart Home Assistant) and refresh the browser.

HACS downloads `staged-switch-card.js` from the GitHub release.

**Manual**

1. Copy `staged-switch-card.js` from a GitHub release (or `dist/` after `npm run build`) into `config/www/`.
2. Add a dashboard resource:
   - URL: `/local/staged-switch-card.js`
   - Type: **JavaScript Module**

While testing from this repo, use `npm run deploy` and point the resource at `/local/staged-switch-loader.js` instead. That loader reads a version stamp so you only need a browser refresh after each deploy, not a new resource URL.

```yaml
resources:
  - url: /local/staged-switch-card.js
    type: module
```

### 2. Create the stage helper

The current stage is stored in an `input_number`. Create it under **Settings → Devices & services → Helpers → Create helper → Number**, or in YAML.

Set `min` to `0`, `step` to `1`, and `max` to the last stage index. The card shows at most **5 stages besides Power**. Extra entities can still be on the card as chips.

For three devices in cumulative mode there are **four** helper values (Off plus one per device), so `max` is `3`:

```yaml
input_number:
  patio_stage:
    name: Patio stage
    min: 0
    max: 3
    step: 1
    mode: slider
```

| Helper value | Meaning in cumulative mode |
| --- | --- |
| `0` | Everything off |
| `1` | First entity on |
| `2` | First two entities on |
| `3` | All listed entities on |

If `min` is not `0`, the card still maps stage buttons onto that range when it writes `input_number.set_value`.

### 3. Add the card to a dashboard

1. Edit the dashboard → **Add card**.
2. Choose **Custom: Staged Switch Card** (or paste YAML).
3. Pick the helper in **Stage helper**.
4. Add the entities you want to combine (see below).
5. Save.

You can also open **Show code editor** and paste any of the examples in this README.

## Combine multiple entities

The card has two ways to group entities. Use **cumulative** when later stages should keep earlier ones on. Use **explicit stages** when each position needs its own on/off mix.

The editor accepts `switch`, `light`, `fan`, and `input_boolean` entities that have On/Off. Sensors, diagnostics, and hidden or disabled entities are skipped.

### Cumulative: stack entities in order

This is the usual “combination” setup. List the entities in the order they should come on. Stage `0` turns **all of them off**. Each higher stage turns on one more entity and leaves the earlier ones on.

```yaml
type: custom:staged-switch-card
title: Patio
entity: input_number.patio_stage
power_entity: input_boolean.patio_power
stage_names:
  - Off
  - Fan
  - String lights
  - Heater
switches:
  - entity: switch.patio_fan
    name: Fan
  - entity: light.patio_string
    name: String lights
  - entity: switch.patio_heater
    name: Heater
```

What that combination does:

| Stage | Label | Fan | String lights | Heater |
| --- | --- | --- | --- | --- |
| 0 | Off | off | off | off |
| 1 | Fan | on | off | off |
| 2 | String lights | on | on | off |
| 3 | Heater | on | on | on |

Stage names are independent of the entities. Set them with `stage_names`, or in the editor under **Stage names**. A switch `name` is only used as the entity button tooltip.

Shorthand if you do not need custom labels:

```yaml
type: custom:staged-switch-card
entity: input_number.patio_stage
switches:
  - switch.patio_fan
  - light.patio_string
  - switch.patio_heater
```

You can list more than five entities. The card still shows only five stage buttons; extra entities stay available as chips and are included when Power turns everything off.

### Explicit: any on/off mix per stage

Use this when the combination is not “each new stage keeps the previous ones on”. Every stage lists the target state for each entity.

```yaml
type: custom:staged-switch-card
title: Living room
entity: input_number.living_scene
stages:
  - name: All off
    switches:
      light.sofa: off
      light.reading: off
      light.cabinet: off
      switch.soundbar: off
  - name: Reading
    switches:
      light.sofa: off
      light.reading: on
      light.cabinet: off
      switch.soundbar: off
  - name: Movie
    switches:
      light.sofa: off
      light.reading: off
      light.cabinet: on
      switch.soundbar: on
  - name: Evening
    switches:
      light.sofa: on
      light.reading: off
      light.cabinet: on
      switch.soundbar: on
```

| Stage | Label | Sofa | Reading | Cabinet | Soundbar |
| --- | --- | --- | --- | --- | --- |
| 0 | All off | off | off | off | off |
| 1 | Reading | off | on | off | off |
| 2 | Movie | off | off | on | on |
| 3 | Evening | on | off | on | on |

Set the helper `max` to the last stage index (`3` in this example).

You can write each stage as a list instead of a map:

```yaml
stages:
  - name: Movie
    switches:
      - entity: light.cabinet
        state: "on"
      - entity: switch.soundbar
        state: "on"
      - entity: light.sofa
        state: "off"
      - entity: light.reading
        state: "off"
```

List every entity you care about on **every** stage. When a stage is applied, roster entities that are omitted from that stage are turned off. Power off also turns every card entity off, including hidden chips.

If both `stages` and `switches` are set, `stages` wins for the stage map. `switches` is still used for chip order, names, and `hide`.

### Several independent combinations

One card is one combination (one helper, one set of entities). For two groups, add two helpers and two cards:

```yaml
# Card 1 — upstairs
type: custom:staged-switch-card
title: Upstairs
entity: input_number.upstairs_stage
switches:
  - light.hall
  - light.landing
  - light.bedroom

# Card 2 — downstairs
type: custom:staged-switch-card
title: Downstairs
entity: input_number.downstairs_stage
switches:
  - light.kitchen
  - light.dining
  - switch.dining_fan
```

Give each card its own `input_number` so the stages do not fight.

### Mix entity domains in one card

A single combination can include different domains. The card calls `homeassistant.turn_on` / `turn_off` on whatever you list:

```yaml
type: custom:staged-switch-card
title: Workshop
entity: input_number.workshop_stage
switches:
  - entity: switch.workshop_outlets
    name: Power
  - entity: light.workshop_overhead
    name: Lights
  - entity: fan.workshop_exhaust
    name: Exhaust
  - entity: input_boolean.workshop_occupied
    name: Occupied
```

### Let an automation own the switches

If you already have automations that listen to the helper, keep the stage control on the card but do not let the card touch the entities:

```yaml
type: custom:staged-switch-card
title: Irrigation
entity: input_number.irrigation_zone
direct_control: false
stages:
  - name: Idle
  - name: Front lawn
  - name: Beds
  - name: Drip
```

The card only updates the helpers. Your automation decides what turns on.

## Visual editor

1. Edit the dashboard and add **Staged Switch Card**, or click **Edit** on an existing card.
2. Set the title, the `input_number` stage helper, and an optional `input_boolean` power helper.
3. On **1. Entities**, add lights, fans, and switches. You can pick an area or a device to add every matching On/Off entity under it.
4. Use **Hide from card** if a relay should follow the stages but not show as a chip.
5. On **2. Stages**, choose **Cumulative switches** or **Explicit stage map**.
6. Edit **Stage names** so each combination has its own label (Fan / Heater, and so on). The Power button label is always **Power**.
7. In explicit mode, set each row to **On** or **Off** for that stage.
8. Use the checkboxes to show or hide entity buttons and stage labels, or to disable direct switch control.

YAML is still available from **Show code editor**.

## Configuration reference

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | string | yes | | `custom:staged-switch-card` |
| `title` | string | no | `Staged Switch Control` | Card heading |
| `entity` | string | recommended | | `input_number` that stores the current stage |
| `power_entity` | string | no | | Optional `input_boolean` that stores group on/off. The stage helper keeps the last stage when the group is off |
| `switches` | list | no | | Entities to combine in order. Stage `0` is all off; stage _n_ turns on the first _n_ items, up to 5 stages |
| `stages` | list | no | | Explicit per-stage on/off map. Overrides `switches` for the stage map when present |
| `stage_names` | list | no | | Labels for each stage combination (index `0` is Off) |
| `direct_control` | boolean | no | `true` | `true`: card turns entities on/off. `false`: only updates the helpers |
| `show_switches` | boolean | no | `true` | Show a chip for each visible entity |
| `show_stage_labels` | boolean | no | `true` | Show the muted stage names under the buttons |

Provide at least one of `entity`, `switches`, or `stages`.

Limits: **5 stages** besides Power, on one row. **6 entity chips** per row; extra chips wrap and are split evenly (7 → 4+3).

### `switches` item

```yaml
- entity: switch.patio_fan   # required
  name: Fan                  # optional entity chip tooltip
  icon: mdi:fan              # optional
  hide: true                 # optional; still controlled, not shown as a chip
```

Or just `switch.patio_fan`.

### `stages` item

```yaml
- name: Evening              # optional
  switches:                  # map or list of entity + on/off
    light.sofa: on
    switch.soundbar: on
```

## How the control behaves

1. The leftmost **Power** button turns the group on or off. Turning it off turns every card entity off and leaves the last stage in the helper (and in this browser) so turning it back on restores that stage.
2. Only the Power button and the stage buttons (or their labels) change the group. Clicks on the bar around them do nothing.
3. Choosing a stage writes `input_number.set_value` (and the optional power helper), then applies that stage’s on/off mix when `direct_control` is enabled. Roster entities omitted from the stage are turned off.
4. The entity chips under the bar toggle that one entity. If the new mix is not a configured stage, the progress stays put. If it matches a stage, the bar (and power) update to that stage.
5. Individual chip toggles are not remembered across Power off. Memory is the last stage only.

`direct_control: false` still updates the helpers, but the card will not turn entities on or off.

## Staged Lights Card

A lights card with three exclusive rows:

1. **RGB** — Power button labeled RGB, a 1–100% brightness slider (no stage text), then a row of quick color presets. The last control is a custom color picker. Only RGB-capable lights can be added here.
2. **Warm** — Power button labeled Warm, plus 2–4 intensity stages: Dim, Soft, Medium, Bright (fewer labels when you use fewer stages). Lights or switches.
3. **White / sun** — the same intensity stages for cool or daylight lights or switches.

Only one of RGB, Warm, or White can be on at a time. Entity chips stay hidden unless you turn on **Show entity buttons**. Then they sit together at the bottom, not per row.

All of that state is stored in **one** `input_text` helper as a short JSON string. You do not create a helper per slider.

```yaml
input_text:
  living_lights:
    name: Living lights
    max: 255
```

```yaml
type: custom:staged-lights-card
title: Living room
entity: input_text.living_lights
rgb:
  - light.sofa_rgb
  - light.cabinet_rgb
warm:
  - light.floor_lamp
  - light.reading
white:
  - light.ceiling
  - light.desk
```

The stored payload looks like `{"r":{"o":1,"b":180,"c":"#ff8a1d"},"w":{"o":0,"s":2},"n":{"o":0,"s":1}}`. If the helper is missing, the card still remembers the last values in this browser.

Power off keeps the last row, RGB brightness and color, and Warm/White intensity. Turning that row back on restores it and turns the other two rows off.

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | `custom:staged-lights-card` |
| `title` | string | no | Card heading |
| `entity` | string | recommended | `input_text` that stores the JSON state |
| `stages` | number | no | Warm/White intensity stages, `2`–`4`. Default is the largest of those rows, at least 2 |
| `rgb` | list | no | RGB-capable lights for the color row |
| `warm` | list | no | Lights or switches for the Warm row |
| `white` | list | no | Lights or switches for the White row |
| `direct_control` | boolean | no | Default `true`. `false` only writes the helper |
| `show_switches` | boolean | no | Default `false`. Show every entity once at the bottom |

RGB items must be color lights. Warm/White items are a light or switch entity id, or `{ entity, name, icon, hide }` like Staged Switch.

## Development

```bash
npm install
npm test
npm run build
npm run watch
npm run deploy
```

`npm test` runs the unit tests. `npm run watch` rebuilds `dist/staged-switch-card.js` as you edit. Open `preview.html` for a dashboard-style preview (screenshot plus live cards). `npm run deploy` copies the bundle to Home Assistant at `ha:/config/www/`.

Layout:

- `src/shared/` — helpers reused by every card in this package
- `src/cards/staged-switch/` — staged switch card
- `src/cards/staged-lights/` — staged lights card
- `src/index.ts` — bundle entry; import another card module here to add it

Requirements: Node.js 20 or newer.

## Publishing a HACS release

HACS loads `staged-switch-card.js` from GitHub release assets (`hacs.json`).

1. Update `version` in `package.json` and `PACKAGE_VERSION` in `src/shared/const.ts`.
2. Commit and tag, for example `v0.0.3-beta`.
3. Push the tag. The release workflow builds the bundle and attaches `staged-switch-card.js`.

## License

Copyright (C) 2026 raj47i

This project is free software under the [GNU General Public License v3.0 or later](LICENSE).

You can use, share, and change it. A note or thanks is enough if you just use it. If you publish a modified version or something based on this card, you must also release that work as open source under the same license and provide the source. See the [GNU GPL](https://www.gnu.org/licenses/gpl-3.0.html) for the full terms.

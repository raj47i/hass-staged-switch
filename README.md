# Staged Switch Card

A Home Assistant Lovelace card that combines several toggles into one staged control. Each position is a **stage**. Choosing a stage writes it to an `input_number` helper and turns the mapped entities on or off together. The control looks like a progress bar, but it is a set of buttons — it is not a draggable slider.

Use it when one control should represent a sequence, for example:

- Pool pump → heater → lights
- Hall light → reading lamp → accent lights
- Fan low / medium / high using three switches
- Irrigation zones that come on one after another

The plugin is a single frontend file (`staged-switch-card.js`) for [HACS](https://hacs.xyz/).

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

```yaml
resources:
  - url: /local/staged-switch-card.js
    type: module
```

### 2. Create the stage helper

The slider is backed by an `input_number`. Create it under **Settings → Devices & services → Helpers → Create helper → Number**, or in YAML.

Set `min` to `0`, `step` to `1`, and `max` to the last stage index.

For three devices in cumulative mode there are **four** stages (Off plus one per device), so `max` is `3`:

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

If `min` is not `0`, the card still maps slider positions onto that range when it writes `input_number.set_value`.

### 3. Add the card to a dashboard

1. Edit the dashboard → **Add card**.
2. Choose **Custom: Staged Switch Card** (or paste YAML).
3. Pick the helper in **Stage helper**.
4. Add the entities you want to combine (see below).
5. Save.

You can also open **Show code editor** and paste any of the examples in this README.

## Combine multiple entities

The card has two ways to group entities. Use **cumulative** when later stages should keep earlier ones on. Use **explicit stages** when each position needs its own on/off mix.

Supported entity types: `switch`, `light`, `fan`, `input_boolean`, and anything else that accepts `homeassistant.turn_on` / `turn_off`.

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

| Slider | Label | Fan | String lights | Heater |
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

Add as many entities as you need. Four devices → helper `max: 4` (Off + 4 stages). Five devices → `max: 5`.

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

| Slider | Label | Sofa | Reading | Cabinet | Soundbar |
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

List every entity you care about on **every** stage. An entity omitted from a stage is left unchanged.

If both `stages` and `switches` are set, `stages` wins.

### Several independent combinations

One card is one combination (one slider, one helper, one set of entities). For two groups, add two helpers and two cards:

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

Give each card its own `input_number` so the sliders do not fight.

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

If you already have automations that listen to the helper, keep the slider on the card but do not let the card touch the entities:

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

The card only calls `input_number.set_value`. Your automation decides what turns on.

## Visual editor

1. Edit the dashboard and add **Staged Switch Card**, or click **Edit** on an existing card.
2. Set the title, the `input_number` stage helper, and an optional `input_boolean` power helper.
3. Choose **Cumulative switches** or **Explicit stage map**.
4. Click **Add switch** (or **Add stage**) and pick entities. Repeat for every entity in the combination.
5. Edit **Stage names** so each combination has its own label (Off / Fan / Heater, and so on).
6. In explicit mode, set each row to **On** or **Off** for that stage.
7. Use the checkboxes to show or hide entity buttons and stage labels, or to disable direct switch control.

YAML is still available from **Show code editor**.

## Configuration reference

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | string | yes | | `custom:staged-switch-card` |
| `title` | string | no | `Staged Switch Control` | Card heading |
| `entity` | string | recommended | | `input_number` that stores the current stage |
| `power_entity` | string | no | | Optional `input_boolean` that stores group on/off. The stage helper keeps the last stage when the group is off |
| `switches` | list | no | | Entities to combine in order. Stage `0` is all off; stage _n_ turns on the first _n_ items |
| `stages` | list | no | | Explicit per-stage on/off map. Overrides `switches` when present |
| `stage_names` | list | no | | Labels for each stage combination (index `0` is Off) |
| `direct_control` | boolean | no | `true` | `true`: card turns entities on/off. `false`: only updates the helpers |
| `show_switches` | boolean | no | `true` | Show a button for each controlled entity |
| `show_stage_labels` | boolean | no | `true` | Show the muted stage names under the control |

Provide at least one of `entity`, `switches`, or `stages`.

### `switches` item

```yaml
- entity: switch.patio_fan   # required
  name: Fan                  # optional entity button name
  icon: mdi:fan              # optional
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

1. The leftmost power button turns the group on or off. Turning it off leaves the last stage in the helper so turning it back on restores that combination.
2. The square stage buttons are the only way to change the progress. Clicks on the bar around them only toggle power.
3. Choosing a stage writes `input_number.set_value` (and the optional power helper), then turns that stage’s entities on or off when `direct_control` is enabled.
4. The entity buttons under the bar toggle that one entity. If the new mix is not a configured stage, the progress bar stays put. If it matches a stage, the bar (and power) update to that stage.
5. An entity omitted from an explicit stage is left unchanged when that stage is applied, and is ignored when matching the current mix.

`direct_control: false` still updates the helpers, but the card will not turn entities on or off.

## Development

```bash
npm install
npm test
npm run build
npm run watch
```

`npm test` runs the stage-resolution unit tests. `npm run watch` rebuilds `dist/staged-switch-card.js` as you edit.

Requirements: Node.js 20 or newer.

## Publishing a HACS release

HACS loads `staged-switch-card.js` from GitHub release assets (`hacs.json`).

1. Update `version` in `package.json` and `CARD_VERSION` in `src/const.ts`.
2. Commit and tag, for example `v1.0.0`.
3. Push the tag. The release workflow builds the bundle and attaches `staged-switch-card.js`.

## License

MIT

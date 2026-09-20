#!/bin/sh
set -e
cd "$(dirname "$0")/.."

echo "Rewriting Lovelace card types / resource URLs on Home Assistant."
echo "HA scenes (ssl_/ssm_/sst_/sla_) are not touched."

if ssh ha 'command -v python3 >/dev/null 2>&1'; then
  scp scripts/migrate_ha_ids.py ha:/tmp/migrate_ha_ids.py
  ssh ha 'python3 /tmp/migrate_ha_ids.py /config'
  echo "Done. Refresh the browser. Backups are *.pre-scene-studio next to rewritten files."
  exit 0
fi

echo "Home Assistant SSH has no python3; migrating a local copy and writing it back."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/config/.storage"
scp 'ha:/config/.storage/lovelace*' "$tmp/config/.storage/"

# Copy only YAML that already contains a legacy token. Never pull secrets.
ssh ha 'grep -rl --include="*.yaml" \
  -e "custom:staged-lights-mini-card" \
  -e "custom:staged-lights-card" \
  -e "custom:staged-switch-card" \
  -e "/local/staged-switch-loader.js" \
  -e "/local/staged-switch-version.json" \
  -e "/local/staged-switch-card.js" \
  -e "/hacsfiles/hass-staged-switch/staged-switch-card.js" \
  /config 2>/dev/null \
  | grep -v "/.storage/" \
  | grep -v "/deps/" \
  | grep -v "/custom_components/" \
  | grep -v "/esphome/" \
  | grep -v "/secrets.yaml$" \
  || true' > "$tmp/yaml-list.txt"

while IFS= read -r remote; do
  [ -n "$remote" ] || continue
  rel="${remote#/config/}"
  mkdir -p "$tmp/config/$(dirname "$rel")"
  scp "ha:$remote" "$tmp/config/$rel"
done < "$tmp/yaml-list.txt"

python3 scripts/migrate_ha_ids.py "$tmp/config"

wrote=0
find "$tmp/config" -type f -name '*.pre-scene-studio' -print | while IFS= read -r backup; do
  original="${backup%.pre-scene-studio}"
  rel="${original#$tmp/config/}"
  echo "Writing /config/$rel"
  scp "$original" "ha:/config/$rel"
  scp "$backup" "ha:/config/${rel}.pre-scene-studio"
  wrote=1
done

echo "Done. Refresh the browser. Backups are *.pre-scene-studio next to rewritten files."

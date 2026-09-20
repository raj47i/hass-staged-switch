#!/bin/sh
set -e
cd "$(dirname "$0")/.."
npm run build
version="$(date +%s)"
ssh ha 'mkdir -p /config/www'
scp dist/hass-scene-studio.js ha:/config/www/hass-scene-studio.js
# Keep the previous filenames so an unmigrated Lovelace resource still loads.
scp dist/hass-scene-studio.js ha:/config/www/staged-switch-card.js
scp scripts/ha-loader.js ha:/config/www/scene-studio-loader.js
scp scripts/ha-loader.js ha:/config/www/staged-switch-loader.js
printf '{"v":%s}\n' "$version" | ssh ha 'cat > /config/www/scene-studio-version.json'
printf '{"v":%s}\n' "$version" | ssh ha 'cat > /config/www/staged-switch-version.json'
echo "Deployed version ${version}."
echo "Resource should be /local/scene-studio-loader.js (JavaScript Module)."
echo "Old /local/staged-switch-loader.js still works until you migrate Lovelace."
echo "Scene-set HA scenes (ssl_/ssm_/sst_/sla_) are unchanged."
echo "Optional: npm run migrate-ha  # rewrite dashboard card types and resource URLs"

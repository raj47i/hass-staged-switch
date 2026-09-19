#!/bin/sh
set -e
cd "$(dirname "$0")/.."
npm run build
version="$(date +%s)"
ssh ha 'mkdir -p /config/www'
scp dist/staged-switch-card.js ha:/config/www/staged-switch-card.js
scp scripts/ha-loader.js ha:/config/www/staged-switch-loader.js
printf '{"v":%s}\n' "$version" | ssh ha 'cat > /config/www/staged-switch-version.json'
echo "Deployed version ${version}."
echo "Resource should be /local/staged-switch-loader.js (JavaScript Module), then just refresh."

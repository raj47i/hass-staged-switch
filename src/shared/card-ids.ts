export const BUNDLE_FILE = "hass-scene-studio.js";
export const LOADER_FILE = "scene-studio-loader.js";
export const VERSION_FILE = "scene-studio-version.json";

export const ROOM_SWITCHES_CARD = "scene-studio-room-switches-card";
export const ROOM_SWITCHES_CARD_LEGACY = "staged-switch-card";
export const ROOM_LIGHTS_CARD = "scene-studio-room-lights-card";
export const ROOM_LIGHTS_CARD_LEGACY = "staged-lights-card";
export const ROOM_LIGHTS_MINI_CARD = "scene-studio-room-lights-mini-card";
export const ROOM_LIGHTS_MINI_CARD_LEGACY = "staged-lights-mini-card";

export const lovelaceType = (name: string): string => `custom:${name}`;

export const CARD_ID_REWRITES: ReadonlyArray<readonly [string, string]> = [
  [ROOM_SWITCHES_CARD_LEGACY, ROOM_SWITCHES_CARD],
  [ROOM_LIGHTS_CARD_LEGACY, ROOM_LIGHTS_CARD],
  [ROOM_LIGHTS_MINI_CARD_LEGACY, ROOM_LIGHTS_MINI_CARD],
];

export const storageKeyAliases = (key: string): string[] => {
  const aliases = CARD_ID_REWRITES.flatMap(([legacy, next]) => {
    const prefix = `${next}:`;
    return key.startsWith(prefix) ? [`${legacy}:${key.slice(prefix.length)}`] : [];
  });
  return [key, ...aliases];
};

export const LEGACY_ID_REWRITES: ReadonlyArray<readonly [string, string]> = [
  [`custom:${ROOM_LIGHTS_MINI_CARD_LEGACY}`, `custom:${ROOM_LIGHTS_MINI_CARD}`],
  [`custom:${ROOM_LIGHTS_CARD_LEGACY}`, `custom:${ROOM_LIGHTS_CARD}`],
  [`custom:${ROOM_SWITCHES_CARD_LEGACY}`, `custom:${ROOM_SWITCHES_CARD}`],
  ["/local/staged-switch-loader.js", `/local/${LOADER_FILE}`],
  ["/local/staged-switch-version.json", `/local/${VERSION_FILE}`],
  ["/local/staged-switch-card.js", `/local/${BUNDLE_FILE}`],
  [
    "/hacsfiles/hass-staged-switch/staged-switch-card.js",
    `/hacsfiles/hass-staged-switch/${BUNDLE_FILE}`,
  ],
];

export const rewriteLegacyIds = (text: string): string =>
  LEGACY_ID_REWRITES.reduce((next, [from, to]) => next.split(from).join(to), text);

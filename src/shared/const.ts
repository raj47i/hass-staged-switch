export const PACKAGE_VERSION = "0.0.8-beta";
export const PROJECT_TITLE = "Hass Scene Studio";
export const PACKAGE_TITLE = "Scene Studio";
export const pickerName = (name: string): string => `${PACKAGE_TITLE} - ${name}`;
export const ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/i;
export const CONTROL_DOMAINS = ["switch", "light", "fan", "input_boolean"];
export const MAX_ENTITY_BUTTONS_PER_ROW = 6;
export const DOCUMENTATION_URL = "https://github.com/raj47i/hass-staged-switch";

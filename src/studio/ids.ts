import {
  ADVANCED_LIGHT_PREFIX,
  LIGHT_SCENE_PREFIX,
  MINIMAL_LIGHT_PREFIX,
  SCENE_ID_PREFIX,
} from "./const";
import type { StudioSetKind } from "./types";

const SWITCH_SCENE_ID = new RegExp(`^${SCENE_ID_PREFIX}(.+)_(\\d{2,})$`);
const LIGHT_SCENE_ID = new RegExp(
  `^${LIGHT_SCENE_PREFIX}(.+)_(off|rgb0?|w\\d+|n\\d+)$`,
);
const MINIMAL_SCENE_ID = new RegExp(
  `^${MINIMAL_LIGHT_PREFIX}(.+)_(off|rgb0?|t\\d+)$`,
);
const ADVANCED_SCENE_ID = new RegExp(`^${ADVANCED_LIGHT_PREFIX}(.+)_(\\d{2,})$`);

export const slugify = (name?: string | null): string => {
  const slug = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "scenes";
};

const stripScene = (value: string): string =>
  value.startsWith("scene.") ? value.slice("scene.".length) : value;

export const normalizeStudioSceneId = (
  value: string | undefined | null,
): string | undefined => {
  if (!value) {
    return undefined;
  }
  const id = stripScene(value);
  return parseStudioSceneId(id) ? id : undefined;
};

export const uniqueStudioSceneIds = (
  ids: Iterable<string | undefined | null>,
): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of ids) {
    const id = normalizeStudioSceneId(value);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  return next;
};

export const sceneId = (slug: string, index: number): string =>
  `${SCENE_ID_PREFIX}${slug}_${String(index).padStart(2, "0")}`;

export const parseSceneId = (
  value: string | undefined,
): { slug: string; index: number } | undefined => {
  if (!value) {
    return undefined;
  }
  const match = SWITCH_SCENE_ID.exec(stripScene(value));
  if (!match) {
    return undefined;
  }
  return { slug: match[1] ?? "", index: Number.parseInt(match[2] ?? "0", 10) };
};

export const lightSceneId = (slug: string, slot: string): string =>
  `${LIGHT_SCENE_PREFIX}${slug}_${slot}`;

export const parseLightSceneId = (
  value: string | undefined,
): { slug: string; slot: string } | undefined => {
  if (!value) {
    return undefined;
  }
  const match = LIGHT_SCENE_ID.exec(stripScene(value));
  if (!match) {
    return undefined;
  }
  return { slug: match[1] ?? "", slot: match[2] ?? "off" };
};

export const minimalSceneId = (slug: string, slot: string): string =>
  `${MINIMAL_LIGHT_PREFIX}${slug}_${slot}`;

export const parseMinimalSceneId = (
  value: string | undefined,
): { slug: string; slot: string } | undefined => {
  if (!value) {
    return undefined;
  }
  const match = MINIMAL_SCENE_ID.exec(stripScene(value));
  if (!match) {
    return undefined;
  }
  return { slug: match[1] ?? "", slot: match[2] ?? "off" };
};

export const parseLookSceneId = (
  value: string | undefined,
): { kind: "light" | "minimal"; slug: string; slot: string } | undefined => {
  const minimal = parseMinimalSceneId(value);
  if (minimal) {
    return { kind: "minimal", ...minimal };
  }
  const light = parseLightSceneId(value);
  if (light) {
    return { kind: "light", ...light };
  }
  return undefined;
};

export const lookSceneId = (
  kind: "light" | "minimal",
  slug: string,
  slot: string,
): string => (kind === "minimal" ? minimalSceneId(slug, slot) : lightSceneId(slug, slot));

export const advancedSceneId = (slug: string, index: number): string =>
  `${ADVANCED_LIGHT_PREFIX}${slug}_${String(index).padStart(2, "0")}`;

export const parseAdvancedSceneId = (
  value: string | undefined,
): { slug: string; index: number } | undefined => {
  if (!value) {
    return undefined;
  }
  const match = ADVANCED_SCENE_ID.exec(stripScene(value));
  if (!match) {
    return undefined;
  }
  return { slug: match[1] ?? "", index: Number.parseInt(match[2] ?? "0", 10) };
};

export const parseStudioSceneId = (
  value: string | undefined,
): { kind: StudioSetKind; slug: string } | undefined => {
  const look = parseLookSceneId(value);
  if (look) {
    return { kind: look.kind, slug: look.slug };
  }
  const advanced = parseAdvancedSceneId(value);
  if (advanced) {
    return { kind: "advanced", slug: advanced.slug };
  }
  const staged = parseSceneId(value);
  if (staged) {
    return { kind: "switch", slug: staged.slug };
  }
  return undefined;
};

export const isStudioSceneId = (value: string | undefined): boolean =>
  Boolean(parseStudioSceneId(value));

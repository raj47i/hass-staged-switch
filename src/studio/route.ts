import { STUDIO_DASHBOARD_PATH } from "./const";
import type { StudioSetKind, StudioWizardStep } from "./types";

export const STUDIO_VIEW_PATH = "studio";

export const WIZARD_STEPS: Record<StudioSetKind, StudioWizardStep[]> = {
  light: ["name", "entities", "groups", "edit", "review"],
  minimal: ["name", "entities", "groups", "edit", "review"],
  advanced: ["name", "entities", "groups", "edit", "review"],
  switch: ["name", "entities", "stages", "review"],
};

const KIND_PATH: Record<StudioSetKind, string> = {
  light: "light",
  minimal: "minimal",
  advanced: "advanced",
  switch: "switch",
};

const KIND_ALIASES: Record<string, StudioSetKind> = {
  light: "light",
  lights: "light",
  simple: "light",
  minimal: "minimal",
  advanced: "advanced",
  switch: "switch",
  switches: "switch",
};

const ALL_STEPS: StudioWizardStep[] = [
  "name",
  "entities",
  "groups",
  "stages",
  "edit",
  "review",
];

export type StudioRoute =
  | { view: "list" }
  | { view: "step"; step?: StudioWizardStep; index?: number }
  | {
      view: "wizard";
      kind: StudioSetKind;
      step: StudioWizardStep;
      slug?: string;
      creating: boolean;
    };

export const resolveWizardStep = (
  steps: readonly StudioWizardStep[],
  step?: StudioWizardStep,
): StudioWizardStep => {
  const mapped =
    step === "stages" && steps.includes("edit") && !steps.includes("stages")
      ? "edit"
      : step;
  return mapped && steps.includes(mapped) ? mapped : (steps[0] ?? "name");
};

export const wizardStepAt = (
  kind: StudioSetKind,
  route: Extract<StudioRoute, { view: "step" }>,
): StudioWizardStep => {
  const steps = WIZARD_STEPS[kind];
  if (route.index && route.index > 0) {
    return steps[route.index - 1] ?? steps[0] ?? "name";
  }
  return resolveWizardStep(steps, route.step);
};

export const parseStudioKind = (value?: string): StudioSetKind | undefined =>
  KIND_ALIASES[(value ?? "").trim().toLowerCase()];

export const parseStudioStep = (
  value?: string,
  kind?: StudioSetKind,
): StudioWizardStep => {
  const raw = (value ?? "").trim().toLowerCase();
  const allowed = kind ? WIZARD_STEPS[kind] : ALL_STEPS;
  if (/^\d+$/.test(raw)) {
    return allowed[Number(raw) - 1] ?? allowed[0] ?? "name";
  }
  if (kind === "advanced" && raw === "stages") {
    return "edit";
  }
  return allowed.includes(raw as StudioWizardStep)
    ? (raw as StudioWizardStep)
    : (allowed[0] ?? "name");
};

export const parseStudioTail = (tail = ""): StudioRoute => {
  const parts = tail.split("/").filter(Boolean);
  if (!parts.length) {
    return { view: "list" };
  }
  if (parts[0] === "new") {
    const kind = parseStudioKind(parts[1]);
    if (!kind) {
      return { view: "list" };
    }
    return {
      view: "wizard",
      kind,
      step: parseStudioStep(parts[2], kind),
      creating: true,
    };
  }
  if (parts[0] === "edit") {
    const kind = parseStudioKind(parts[1]);
    const slug = (parts[2] ?? "").trim();
    if (!kind || !slug) {
      return { view: "list" };
    }
    return {
      view: "wizard",
      kind,
      step: parseStudioStep(parts[3], kind),
      slug,
      creating: false,
    };
  }
  if (parts.length === 1) {
    const raw = parts[0] ?? "";
    if (/^\d+$/.test(raw)) {
      return { view: "step", index: Number(raw) };
    }
    if (ALL_STEPS.includes(raw as StudioWizardStep)) {
      return { view: "step", step: raw as StudioWizardStep };
    }
  }
  return { view: "list" };
};

export const serializeStudioTail = (route: StudioRoute): string => {
  if (route.view !== "wizard") {
    return "";
  }
  const kind = KIND_PATH[route.kind];
  if (route.creating || !route.slug) {
    return `new/${kind}/${route.step}`;
  }
  return `edit/${kind}/${route.slug}/${route.step}`;
};

export const studioDashboardRoot = (pathname = ""): string | undefined => {
  const match = pathname.match(
    new RegExp(`^(.*)/${STUDIO_DASHBOARD_PATH}(?=/|$)`),
  );
  return match?.[0];
};

export const parseStudioLocation = (
  pathname = "/",
  hash = "",
): StudioRoute => {
  const root = studioDashboardRoot(pathname);
  const after = root
    ? pathname.slice(root.length).replace(/^\//, "")
    : "";
  const parts = after.split("/").filter(Boolean);
  if (parts[0] === STUDIO_VIEW_PATH) {
    parts.shift();
  }
  const fromPath = parseStudioTail(parts.join("/"));
  if (fromPath.view !== "list") {
    return fromPath;
  }
  return parseStudioTail(hash.replace(/^#\/?/, ""));
};

export const studioHref = (
  route: StudioRoute,
  pathname = `/${STUDIO_DASHBOARD_PATH}/${STUDIO_VIEW_PATH}`,
): string => {
  const tail = serializeStudioTail(route);
  const root = studioDashboardRoot(pathname);
  if (!root) {
    const base = pathname.split("#")[0] || "/";
    return tail ? `${base}#/${tail}` : base;
  }
  const prefix = `${root}/${STUDIO_VIEW_PATH}`;
  return tail ? `${prefix}/${tail}` : prefix;
};

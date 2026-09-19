import { DEFAULT_OFF_LABEL, ENTITY_ID_PATTERN, MAX_DERIVED_STAGES } from "./const";
import type {
  HassEntity,
  HomeAssistant,
  ResolvedStage,
  StageConfig,
  StagedSwitchCardConfig,
  SwitchEntityConfig,
  SwitchState,
  SwitchTarget,
} from "./types";

export const fireEvent = (
  node: HTMLElement,
  type: string,
  detail?: unknown,
): void => {
  node.dispatchEvent(
    new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
};

export const isValidEntityId = (entityId?: string): boolean =>
  Boolean(entityId && ENTITY_ID_PATTERN.test(entityId));

export const domainOf = (entityId?: string): string =>
  entityId?.split(".", 1)[0] ?? "";

const DOMAIN_ICONS: Record<string, string> = {
  switch: "mdi:toggle-switch",
  light: "mdi:lightbulb",
  fan: "mdi:fan",
  input_boolean: "mdi:toggle-switch",
  cover: "mdi:window-shutter",
  climate: "mdi:thermostat",
  media_player: "mdi:cast",
  lock: "mdi:lock",
};

export const entityIcon = (
  target: Pick<SwitchTarget, "entity" | "icon">,
  stateObj?: HassEntity,
): string =>
  target.icon ||
  stateObj?.attributes.icon ||
  DOMAIN_ICONS[domainOf(target.entity)] ||
  "mdi:power";

const isOn = (value: string | undefined): boolean =>
  value === "on" || value === "true" || value === "1";

export const normalizeState = (value: unknown): SwitchState =>
  isOn(String(value).toLowerCase()) ? "on" : "off";

export const friendlyNameFromEntity = (entityId: string): string => {
  const objectId = entityId.split(".")[1] ?? entityId;
  return objectId
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const normalizeSwitch = (
  value: string | SwitchEntityConfig,
): SwitchEntityConfig => {
  if (typeof value === "string") {
    return { entity: value, name: friendlyNameFromEntity(value) };
  }
  return {
    entity: value.entity,
    name: value.name ?? friendlyNameFromEntity(value.entity),
    icon: value.icon,
  };
};

const targetsFromStageSwitches = (
  switches: StageConfig["switches"],
): SwitchTarget[] => {
  if (!switches) {
    return [];
  }

  if (Array.isArray(switches)) {
    return switches
      .map((item) => {
        if (typeof item === "string") {
          return {
            entity: item,
            name: friendlyNameFromEntity(item),
            state: "on" as const,
          };
        }
        return {
          entity: item.entity,
          name: item.name ?? friendlyNameFromEntity(item.entity),
          icon: item.icon,
          state: normalizeState(item.state),
        };
      })
      .filter((item) => isValidEntityId(item.entity));
  }

  return Object.entries(switches)
    .filter(([entity]) => isValidEntityId(entity))
    .map(([entity, state]) => ({
      entity,
      name: friendlyNameFromEntity(entity),
      state: normalizeState(state),
    }));
};

export const configuredStageName = (
  config: StagedSwitchCardConfig,
  index: number,
): string | undefined => {
  const named = config.stage_names?.[index];
  return typeof named === "string" && named.trim() ? named.trim() : undefined;
};

const explicitSwitchName = (
  config: StagedSwitchCardConfig,
  entityId: string,
): string | undefined => {
  const raw = (config.switches ?? []).find((item) =>
    typeof item === "string" ? item === entityId : item.entity === entityId,
  );
  if (!raw || typeof raw === "string") {
    return undefined;
  }
  return raw.name?.trim() || undefined;
};

const applyStageNames = (
  config: StagedSwitchCardConfig,
  stages: ResolvedStage[],
): ResolvedStage[] =>
  stages.map((stage) => {
    const named = configuredStageName(config, stage.index);
    return named ? { ...stage, name: named } : stage;
  });

export const resolveStages = (
  config: StagedSwitchCardConfig,
  slider?: HassEntity,
): ResolvedStage[] => {
  if (config.stages?.length) {
    return applyStageNames(
      config,
      config.stages.map((stage, index) => ({
        index,
        name: stage.name?.trim() || `Stage ${index}`,
        icon: stage.icon,
        targets: targetsFromStageSwitches(stage.switches),
      })),
    );
  }

  const switches = (config.switches ?? [])
    .map(normalizeSwitch)
    .filter((item) => isValidEntityId(item.entity));

  if (!switches.length) {
    const min = Number(slider?.attributes.min ?? 0);
    const max = Number(slider?.attributes.max ?? 0);
    const start = Number.isFinite(min) ? min : 0;
    let end = Number.isFinite(max) && max >= start ? max : start;
    if (end - start > MAX_DERIVED_STAGES) {
      end = start + MAX_DERIVED_STAGES;
    }
    const stages: ResolvedStage[] = [];
    for (let value = start; value <= end; value += 1) {
      stages.push({
        index: stages.length,
        name: value === start ? DEFAULT_OFF_LABEL : `Stage ${value}`,
        targets: [],
      });
    }
    return applyStageNames(config, stages);
  }

  const stages: ResolvedStage[] = [
    {
      index: 0,
      name: DEFAULT_OFF_LABEL,
      targets: switches.map((item) => ({
        ...item,
        state: "off" as const,
      })),
    },
  ];

  switches.forEach((item, index) => {
    stages.push({
      index: index + 1,
      name: explicitSwitchName(config, item.entity) ?? `Stage ${index + 1}`,
      icon: item.icon,
      targets: switches.map((switchItem, switchIndex) => ({
        ...switchItem,
        state: switchIndex <= index ? ("on" as const) : ("off" as const),
      })),
    });
  });

  return applyStageNames(config, stages);
};

export const uniqueEntities = (stages: ResolvedStage[]): SwitchTarget[] => {
  const seen = new Map<string, SwitchTarget>();
  stages.forEach((stage) => {
    stage.targets.forEach((target) => {
      if (isValidEntityId(target.entity) && !seen.has(target.entity)) {
        seen.set(target.entity, { ...target });
      }
    });
  });
  return Array.from(seen.values());
};

export const partitionTargets = (
  targets: SwitchTarget[],
): { on: string[]; off: string[] } => {
  const on: string[] = [];
  const off: string[] = [];
  targets.forEach((target) => {
    if (!isValidEntityId(target.entity)) {
      return;
    }
    if (target.state === "on") {
      on.push(target.entity);
    } else {
      off.push(target.entity);
    }
  });
  return { on, off };
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const parseStageIndex = (
  raw: string | number | undefined,
  maxIndex: number,
): number => {
  const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? 0));
  if (Number.isNaN(value)) {
    return 0;
  }
  return clamp(Math.round(value), 0, Math.max(0, maxIndex));
};

export const relevantEntityIds = (config?: StagedSwitchCardConfig): string[] => {
  if (!config) {
    return [];
  }
  const ids = new Set<string>();
  if (isValidEntityId(config.entity)) {
    ids.add(config.entity!);
  }
  if (isValidEntityId(config.power_entity)) {
    ids.add(config.power_entity!);
  }
  uniqueEntities(resolveStages(config)).forEach((target) => ids.add(target.entity));
  return Array.from(ids);
};

export const relevantHassChanged = (
  oldHass: HomeAssistant | undefined,
  hass: HomeAssistant | undefined,
  entityIds: string[],
): boolean => {
  if (!oldHass || !hass) {
    return true;
  }
  return entityIds.some((entityId) => oldHass.states[entityId] !== hass.states[entityId]);
};

export const cardStorageKey = (config?: StagedSwitchCardConfig): string =>
  `staged-switch-card:${config?.entity || config?.title || "default"}`;

export const readStoredPower = (key: string): boolean | undefined => {
  try {
    const stored = globalThis.localStorage?.getItem(`${key}:power`);
    if (stored === "off") {
      return false;
    }
    if (stored === "on") {
      return true;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

export const writeStoredPower = (key: string, on: boolean): void => {
  try {
    globalThis.localStorage?.setItem(`${key}:power`, on ? "on" : "off");
  } catch {
    // Ignore quota / private-mode failures; HA entity persistence still applies.
  }
};

export const readStoredStage = (key: string): number | undefined => {
  try {
    const stored = globalThis.localStorage?.getItem(`${key}:stage`);
    if (stored == null || stored === "") {
      return undefined;
    }
    const value = Number(stored);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const writeStoredStage = (key: string, index: number): void => {
  try {
    globalThis.localStorage?.setItem(`${key}:stage`, String(index));
  } catch {
    // Ignore quota / private-mode failures; the slider helper still persists.
  }
};

export const allOffTargets = (stages: ResolvedStage[]): SwitchTarget[] =>
  uniqueEntities(stages).map((target) => ({ ...target, state: "off" as const }));

export const stageDesiredStates = (
  stage: ResolvedStage,
  entities: SwitchTarget[] = uniqueEntities([stage]),
): Record<string, SwitchState> => {
  const desired: Record<string, SwitchState> = {};
  entities.forEach((target) => {
    desired[target.entity] = "off";
  });
  stage.targets.forEach((target) => {
    if (isValidEntityId(target.entity)) {
      desired[target.entity] = target.state;
    }
  });
  return desired;
};

export const matchingStageIndex = (
  stages: ResolvedStage[],
  states: Record<string, SwitchState>,
): number | undefined => {
  if (!uniqueEntities(stages).length) {
    return undefined;
  }

  let match: { index: number; specified: number } | undefined;
  stages.forEach((stage) => {
    const desired = stageDesiredStates(stage);
    const specified = Object.keys(desired);
    if (!specified.length) {
      return;
    }
    const same = specified.every(
      (entityId) => (states[entityId] ?? "off") === desired[entityId],
    );
    if (same && (!match || specified.length >= match.specified)) {
      match = { index: stage.index, specified: specified.length };
    }
  });
  return match?.index;
};

export const entityStateLabel = (state?: string): string => {
  if (!state || state === "unavailable" || state === "unknown") {
    return state || "missing";
  }
  return state === "on" ? "on" : "off";
};

import {
  friendlyNameFromEntity,
  isValidEntityId,
  normalizeState,
  normalizeSwitch,
  switchEntry,
} from "../../shared/entities";
import { clamp } from "../../shared/hass";
import type { HassEntity, SwitchState, SwitchTarget } from "../../shared/types";
import { DEFAULT_OFF_LABEL, MAX_RESOLVED_STAGES, MAX_STAGES } from "./const";
import type { ResolvedStage, StageConfig, StagedSwitchCardConfig } from "./types";

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
): string | undefined =>
  switchEntry(config, entityId)?.name?.trim() || undefined;

const applyStageNames = (
  config: StagedSwitchCardConfig,
  stages: ResolvedStage[],
): ResolvedStage[] =>
  stages.map((stage) => {
    const named = configuredStageName(config, stage.index);
    return named ? { ...stage, name: named } : stage;
  });

export const limitResolvedStages = (stages: ResolvedStage[]): ResolvedStage[] =>
  stages.slice(0, MAX_RESOLVED_STAGES).map((stage, index) => ({
    ...stage,
    index,
  }));

export const extraStagesHidden = (config?: StagedSwitchCardConfig): boolean =>
  Boolean(config?.stages && config.stages.length > MAX_RESOLVED_STAGES);

export const resolveStages = (
  config: StagedSwitchCardConfig,
  slider?: HassEntity,
): ResolvedStage[] => {
  if (config.stages?.length) {
    return limitResolvedStages(
      applyStageNames(
        config,
        config.stages.map((stage, index) => ({
          index,
          name: stage.name?.trim() || `Stage ${index}`,
          icon: stage.icon,
          targets: targetsFromStageSwitches(stage.switches),
        })),
      ),
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
    if (end - start > MAX_STAGES) {
      end = start + MAX_STAGES;
    }
    const stages: ResolvedStage[] = [];
    for (let value = start; value <= end; value += 1) {
      stages.push({
        index: stages.length,
        name: value === start ? DEFAULT_OFF_LABEL : `Stage ${value}`,
        targets: [],
      });
    }
    return limitResolvedStages(applyStageNames(config, stages));
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

  switches.slice(0, MAX_STAGES).forEach((item, index) => {
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

  return limitResolvedStages(applyStageNames(config, stages));
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

export const rosterEntities = (
  config?: StagedSwitchCardConfig,
): SwitchTarget[] =>
  (config?.switches ?? [])
    .map(normalizeSwitch)
    .filter((item) => isValidEntityId(item.entity))
    .map((item) => ({
      entity: item.entity,
      name: item.name,
      icon: item.icon,
      state: "off" as const,
    }));

export const cardEntities = (
  config?: StagedSwitchCardConfig,
  stages: ResolvedStage[] = config ? resolveStages(config) : [],
): SwitchTarget[] => {
  const seen = new Map<string, SwitchTarget>();
  rosterEntities(config).forEach((target) => seen.set(target.entity, target));
  uniqueEntities(stages).forEach((target) => {
    if (!seen.has(target.entity)) {
      seen.set(target.entity, { ...target });
    }
  });
  return Array.from(seen.values());
};

export const relevantEntityIds = (config?: StagedSwitchCardConfig): string[] => {
  if (!config) {
    return [];
  }
  const ids = new Set<string>();
  if (isValidEntityId(config.entity)) {
    ids.add(config.entity);
  }
  if (isValidEntityId(config.power_entity)) {
    ids.add(config.power_entity);
  }
  cardEntities(config).forEach((target) => ids.add(target.entity));
  return Array.from(ids);
};

export const allOffTargets = (
  stages: ResolvedStage[],
  config?: StagedSwitchCardConfig,
): SwitchTarget[] =>
  cardEntities(config, stages).map((target) => ({
    ...target,
    state: "off" as const,
  }));

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

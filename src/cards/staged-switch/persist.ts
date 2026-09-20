import {
  cardStorageKey as scopedStorageKey,
  readStoredNumber,
  readStoredOnOff,
  writeStoredNumber,
  writeStoredOnOff,
} from "../../shared/persist";
import { CARD_NAME } from "./const";
import type { StagedSwitchCardConfig } from "./types";

export const cardStorageKey = (config?: StagedSwitchCardConfig): string =>
  scopedStorageKey(CARD_NAME, config?.studio || config?.entity || config?.title);

export const readStoredPower = (key: string): boolean | undefined =>
  readStoredOnOff(key, "power");

export const writeStoredPower = (key: string, on: boolean): void =>
  writeStoredOnOff(key, on, "power");

export const readStoredStage = (key: string): number | undefined =>
  readStoredNumber(key, "stage");

export const writeStoredStage = (key: string, index: number): void =>
  writeStoredNumber(key, index, "stage");

import { MAX_ENTITY_BUTTONS_PER_ROW } from "./const";

export const distributeEvenly = (
  count: number,
  maxPerRow = MAX_ENTITY_BUTTONS_PER_ROW,
): number[] => {
  if (count <= 0) {
    return [];
  }
  const rows = Math.ceil(count / maxPerRow);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) =>
    index < extra ? base + 1 : base,
  );
};

export const chunkEvenly = <T,>(
  items: T[],
  maxPerRow = MAX_ENTITY_BUTTONS_PER_ROW,
): T[][] => {
  const sizes = distributeEvenly(items.length, maxPerRow);
  let offset = 0;
  return sizes.map((size) => {
    const chunk = items.slice(offset, offset + size);
    offset += size;
    return chunk;
  });
};

/** At most 3 items per row, and never a leftover single once there are 2+ items. */
export const packGroupRowSizes = (count: number): number[] => {
  if (count <= 0) {
    return [];
  }
  if (count <= 3) {
    return [count];
  }
  const rem = count % 3;
  const threes = Math.floor(count / 3);
  if (rem === 0) {
    return Array.from({ length: threes }, () => 3);
  }
  if (rem === 2) {
    return [...Array.from({ length: threes }, () => 3), 2];
  }
  return [...Array.from({ length: threes - 1 }, () => 3), 2, 2];
};

export const packGroupRows = <T,>(items: T[]): T[][] => {
  const sizes = packGroupRowSizes(items.length);
  let offset = 0;
  return sizes.map((size) => {
    const chunk = items.slice(offset, offset + size);
    offset += size;
    return chunk;
  });
};

export const rowFillPercent = (
  rowIndexes: number[],
  currentIndex: number,
): number => {
  if (currentIndex <= 0 || !rowIndexes.length) {
    return 0;
  }
  const first = rowIndexes[0]!;
  const last = rowIndexes[rowIndexes.length - 1]!;
  if (currentIndex < first) {
    return 0;
  }
  if (currentIndex > last) {
    return 100;
  }
  const position = rowIndexes.indexOf(currentIndex);
  return ((position + 1) / rowIndexes.length) * 100;
};

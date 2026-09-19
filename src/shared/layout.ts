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

export type TitleAlign = "left" | "center" | "right";

export const TITLE_ALIGN_OPTIONS: ReadonlyArray<{
  value: TitleAlign;
  label: string;
}> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Middle" },
  { value: "right", label: "Right" },
];

export const normalizeTitleAlign = (value?: string): TitleAlign => {
  if (value === "center" || value === "middle") {
    return "center";
  }
  return value === "right" ? "right" : "left";
};

export const storedTitleAlign = (value?: string): TitleAlign | undefined => {
  const align = normalizeTitleAlign(value);
  return align === "left" ? undefined : align;
};

export const titleAlignStyle = (value?: string): string => {
  const align = normalizeTitleAlign(value);
  return align === "left" ? "" : `text-align:${align}`;
};

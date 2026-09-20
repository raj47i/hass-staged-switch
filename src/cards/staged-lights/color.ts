import { clamp } from "../../shared/hass";

const expandHex = (hex: string): string | undefined => {
  const value = hex.replace("#", "").trim();
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  return /^[0-9a-f]{6}$/i.test(full) ? full : undefined;
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const full = expandHex(hex);
  if (!full) {
    return [255, 152, 0];
  }
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
};

export const rgbToHex = (rgb: [number, number, number] | number[]): string =>
  `#${[0, 1, 2]
    .map((index) => {
      const channel = Number(rgb[index]);
      return clamp(
        Number.isFinite(channel) ? Math.round(channel) : 0,
        0,
        255,
      ).toString(16).padStart(2, "0");
    })
    .join("")}`;

export const hueToHex = (hue: number): string => {
  const h = ((hue % 360) + 360) % 360;
  const sector = h / 60;
  const x = 1 - Math.abs((sector % 2) - 1);
  const rgb =
    sector < 1
      ? [1, x, 0]
      : sector < 2
        ? [x, 1, 0]
        : sector < 3
          ? [0, 1, x]
          : sector < 4
            ? [0, x, 1]
            : sector < 5
              ? [x, 0, 1]
              : [1, 0, x];
  return rgbToHex([rgb[0]! * 255, rgb[1]! * 255, rgb[2]! * 255]);
};

export const hexToHue = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  return Math.round(((hue * 60) + 360) % 360);
};

export const normalizeHex = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  const hex = value.startsWith("#") ? value : `#${value}`;
  if (!expandHex(hex)) {
    return fallback;
  }
  return rgbToHex(hexToRgb(hex));
};

import { color as d3Color } from "d3";

export function parseRgb(value: string | undefined | null): [number, number, number] {
  const rgb = value ? d3Color(value)?.rgb() : null;
  if (!rgb) return [0.55, 0.55, 0.5];
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255];
}

export function rgbBytes(value: string | undefined | null): [number, number, number] {
  const [r, g, b] = parseRgb(value);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

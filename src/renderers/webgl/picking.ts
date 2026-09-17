export const PICK_KIND = {
  none: 0,
  burg: 1,
  relief: 2,
  marker: 3,
  river: 4,
  route: 5
} as const;

export type PickKind = (typeof PICK_KIND)[keyof typeof PICK_KIND];

export interface GpuHit {
  kind: Exclude<PickKind, 0>;
  id: number;
}

const KIND_SCALE = 40;

/** Pack a feature kind + 16-bit id into an RGB byte triple for an id buffer */
export function encodePick(kind: PickKind, id: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(65535, id | 0));
  return [kind * KIND_SCALE, (clamped >> 8) & 255, clamped & 255];
}

export function decodePick(r: number, g: number, b: number): GpuHit | null {
  const kind = Math.round(r / KIND_SCALE) as PickKind;
  if (!kind) return null;
  return { kind, id: (g << 8) | b };
}

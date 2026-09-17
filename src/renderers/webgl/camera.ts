import { viewport } from "@/components/viewport";

/** Map point (graph space) → CSS pixels, matching `#viewbox` translate(x y) scale(k) */
export function mapToScreen(x: number, y: number, view = viewport): [number, number] {
  return [x * view.scale + view.x, y * view.scale + view.y];
}

/** CSS pixels → map point */
export function screenToMap(x: number, y: number, view = viewport): [number, number] {
  return [(x - view.x) / view.scale, (y - view.y) / view.scale];
}

export function applyWorldTransform(
  group: { position: { set: (x: number, y: number, z: number) => void }; scale: { setScalar: (k: number) => void } },
  view = viewport
): void {
  group.position.set(view.x, view.y, 0);
  group.scale.setScalar(view.scale);
}

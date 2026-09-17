import type { Layer } from "@/components/layers";
import { MapGL } from "@/renderers/webgl/map-gl";

export function drawTexture(layer: Layer): void {
  if (MapGL.skipSvgDraw("texture")) return void MapGL.invalidate();
  const element = layer.getEl();
  const { href, x, y } = styles.texture.options;
  if (!href) return void element.replaceChildren();

  element.innerHTML = /* html */ `<image preserveAspectRatio="xMidYMid slice"
    x="${x}" y="${y}" width="${Math.max(options.map.graph.width - x, 0)}" height="${Math.max(options.map.graph.height - y, 0)}" href="${href}"></image>`;
}

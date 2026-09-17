import { MapGL } from "@/renderers/webgl/map-gl";
import { ensureEl, getIsolines } from "@/utils";
import { buildFillPaths } from "./isoline-fills";

export function drawReligions(): void {
  if (MapGL.skipSvgDraw("religions")) return void MapGL.invalidate();
  TIME && console.time("drawReligions");
  const { cells, religions } = pack;

  const isolines = getIsolines(pack, cellId => cells.religion[cellId], { fill: true, waterGap: true });
  ensureEl("relig").innerHTML = buildFillPaths("religion", isolines, index => religions[index].color!);

  TIME && console.timeEnd("drawReligions");
}

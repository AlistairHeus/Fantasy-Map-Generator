import { MapGL } from "@/renderers/webgl/map-gl";
import { ensureEl, getIsolines } from "@/utils";
import { buildFillPaths } from "./isoline-fills";

export function drawCultures(): void {
  if (MapGL.skipSvgDraw("cultures")) return void MapGL.invalidate();
  TIME && console.time("drawCultures");
  const { cells, cultures } = pack;

  const isolines = getIsolines(pack, cellId => cells.culture[cellId], { fill: true, waterGap: true });
  ensureEl("cults").innerHTML = buildFillPaths("culture", isolines, index => cultures[index].color!);

  TIME && console.timeEnd("drawCultures");
}

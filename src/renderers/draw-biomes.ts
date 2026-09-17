import { MapGL } from "@/renderers/webgl/map-gl";
import { ensureEl, getIsolines } from "@/utils";
import { buildFillPaths } from "./isoline-fills";

export function drawBiomes(): void {
  if (MapGL.skipSvgDraw("biomes")) return void MapGL.invalidate();
  TIME && console.time("drawBiomes");

  const isolines = getIsolines(pack, cellId => pack.cells.biome[cellId], { fill: true, waterGap: true });
  ensureEl("biomes").innerHTML = buildFillPaths("biome", isolines, index => pack.biomes[index].color);

  TIME && console.timeEnd("drawBiomes");
}

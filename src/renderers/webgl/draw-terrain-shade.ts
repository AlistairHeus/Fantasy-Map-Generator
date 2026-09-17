import { MapGL } from "@/renderers/webgl/map-gl";

export function drawTerrainShade(): void {
  TIME && console.time("drawTerrainShade");
  void MapGL.ensure().then(ok => {
    if (!ok) return;
    MapGL.invalidate();
    MapGL.render();
  });
  TIME && console.timeEnd("drawTerrainShade");
}

export function removeTerrainShade(): void {
  MapGL.invalidate();
  MapGL.applyCoverage();
  MapGL.render();
}

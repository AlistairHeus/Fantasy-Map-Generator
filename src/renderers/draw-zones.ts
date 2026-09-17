import type { Zone } from "@/generators/zones-generator";
import { MapGL } from "@/renderers/webgl/map-gl";
import { ensureEl, getVertexPath } from "@/utils";

// not read off the editor's select: the paint editor destroys that dialog mid-redraw (#1810)
export const zonesFilter = { type: "all" };

export function drawZones(): void {
  if (MapGL.skipSvgDraw("zones")) return void MapGL.invalidate();
  const { type: filterBy } = zonesFilter;
  const isFiltered = filterBy !== "all";
  const visibleZones = pack.zones.filter(
    ({ hidden, cells, type }) => !hidden && cells.length && (!isFiltered || type === filterBy)
  );

  ensureEl("zones").innerHTML = visibleZones.map(drawZone).join("");
}

function drawZone({ i, cells, type, color }: Zone): string {
  const path = getVertexPath(cells, pack);
  return /* html */ `<path id="zone${i}" data-id="${i}" data-type="${type}" d="${path}" fill="${color}" />`;
}

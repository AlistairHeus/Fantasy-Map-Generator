import { interpolateBlues, interpolateSpectral } from "d3";
import type * as THREEType from "three";
import type { LayerId } from "@/components/layers";
import { parseRgb } from "./color";
import { fanTriangles, linePositions, polylineStrip } from "./geometry";
import { encodePick, PICK_KIND } from "./picking";

type Three = typeof import("three");

const FILL_LAYERS = [
  "states",
  "provinces",
  "cultures",
  "religions",
  "zones",
  "cells",
  "temperature",
  "precipitation",
  "population"
] as const;

export function buildFillMeshes(Three: Three, group: THREEType.Group): void {
  for (const id of FILL_LAYERS) {
    if (!window.Layers?.isOn(id)) continue;
    const mesh = fillMesh(Three, id);
    if (mesh) group.add(mesh);
  }
}

function fillMesh(Three: Three, id: (typeof FILL_LAYERS)[number]): THREEType.Object3D | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const { cells } = pack;
  const land = (cellId: number) => cells.h[cellId] >= 20;

  const pushCell = (cellId: number, rgb: [number, number, number]) => {
    const ring = Pack.getPolygon(cellId);
    if (ring.length < 3) return;
    const fan = fanTriangles(cells.p[cellId], ring);
    for (let i = 0; i < fan.length; i += 3) {
      positions.push(fan[i], fan[i + 1], fan[i + 2]);
      colors.push(rgb[0], rgb[1], rgb[2]);
    }
  };

  if (id === "cells") {
    const rgb: [number, number, number] = [0.15, 0.15, 0.15];
    const linePos: number[] = [];
    for (const cellId of cells.i) {
      if (!land(cellId)) continue;
      const ring = Pack.getPolygon(cellId);
      if (ring.length < 2) continue;
      linePos.push(...linePositions([...ring, ring[0]]));
    }
    return lineMesh(Three, linePos, rgb, 0.35);
  }

  if (id === "temperature") return temperatureMesh(Three);
  if (id === "precipitation") return precipitationMesh(Three);
  if (id === "population") return populationMesh(Three);

  if (id === "zones") {
    for (const zone of pack.zones) {
      if (zone.hidden || !zone.cells.length) continue;
      const rgb = parseRgb(zone.color);
      for (const cellId of zone.cells) {
        if (!land(cellId)) continue;
        pushCell(cellId, rgb);
      }
    }
  } else {
    for (const cellId of cells.i) {
      if (!land(cellId)) continue;
      const rgb = cellColor(id, cellId);
      if (!rgb) continue;
      pushCell(cellId, rgb);
    }
  }

  if (!positions.length) return null;
  return coloredMesh(Three, positions, colors, true, 0.4);
}

function cellColor(id: (typeof FILL_LAYERS)[number], cellId: number): [number, number, number] | null {
  const { cells } = pack;
  if (id === "states") {
    const stateId = cells.state[cellId];
    return stateId ? parseRgb(pack.states[stateId]?.color) : null;
  }
  if (id === "provinces") {
    const provinceId = cells.province[cellId];
    return provinceId ? parseRgb(pack.provinces[provinceId]?.color) : null;
  }
  if (id === "cultures") {
    const cultureId = cells.culture[cellId];
    return cultureId ? parseRgb(pack.cultures[cultureId]?.color) : null;
  }
  if (id === "religions") {
    const religionId = cells.religion[cellId];
    return religionId ? parseRgb(pack.religions[religionId]?.color) : null;
  }
  return null;
}

function temperatureMesh(Three: Three): THREEType.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const { cells } = grid;
  for (const cellId of cells.i) {
    const t = (cells.temp[cellId] + 50) / 100;
    const rgb = parseRgb(interpolateSpectral(1 - Math.max(0, Math.min(1, t))));
    const ring = Grid.getPolygon(cellId);
    if (ring.length < 3) continue;
    const fan = fanTriangles(grid.points[cellId], ring);
    for (let i = 0; i < fan.length; i += 3) {
      positions.push(fan[i], fan[i + 1], fan[i + 2]);
      colors.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  if (!positions.length) return null;
  return coloredMesh(Three, positions, colors, true, 0.45);
}

function precipitationMesh(Three: Three): THREEType.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const { cells, points } = grid;
  let maxPrec = 1;
  for (const cellId of cells.i) if (cells.prec[cellId] > maxPrec) maxPrec = cells.prec[cellId];
  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20 || !cells.prec[cellId]) continue;
    const rgb = parseRgb(interpolateBlues(cells.prec[cellId] / maxPrec));
    const size = Math.max(Math.sqrt(cells.prec[cellId] / 4), 0.6);
    pushSprite(positions, colors, points[cellId][0], points[cellId][1], size * 2, rgb);
  }
  if (!positions.length) return null;
  return coloredMesh(Three, positions, colors);
}

function populationMesh(Three: Three): THREEType.Group {
  const group = new Three.Group();
  const rural: number[] = [];
  const urban: number[] = [];
  for (const cellId of pack.cells.i) {
    const pop = pack.cells.pop[cellId];
    if (pop <= 0) continue;
    const [x, y] = pack.cells.p[cellId];
    rural.push(x, y, 0, x, y - pop / 5, 0);
  }
  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed) continue;
    const height = ((burg.population || 0) / 5) * options.map.units.population.urbanization.rate;
    urban.push(burg.x, burg.y, 0, burg.x, burg.y - height, 0);
  }
  if (rural.length)
    group.add(lineMesh(Three, rural, parseRgb(styles.population?.rural?.attrs?.stroke ?? "#00ff00"), 0.85));
  if (urban.length)
    group.add(lineMesh(Three, urban, parseRgb(styles.population?.urban?.attrs?.stroke ?? "#ff0000"), 0.9));
  return group;
}

export function buildLineMeshes(Three: Three, group: THREEType.Group, pickGroup: THREEType.Group): void {
  if (window.Layers?.isOn("rivers")) {
    group.add(riverMesh(Three));
    pickGroup.add(riverPickMesh(Three));
  }
  if (window.Layers?.isOn("routes")) {
    group.add(routeMesh(Three));
    pickGroup.add(routePickMesh(Three));
  }
  if (window.Layers?.isOn("borders")) group.add(borderMesh(Three));
  if (window.Layers?.isOn("coastline")) group.add(coastMesh(Three));
}

function riverMesh(Three: Three): THREEType.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const rgb = parseRgb(styles.rivers?.attrs?.fill ?? "#5d97c9");
  for (const river of pack.rivers) {
    if (!river.cells || river.cells.length < 2) continue;
    const points = Rivers.addMeandering(river.cells, river.points);
    const { widthFactor, sourceWidth } = river;
    const widthAt = (index: number) =>
      Rivers.getOffset({ flux: points[index][2], pointIndex: index, widthFactor, startingWidth: sourceWidth });
    const strip = polylineStrip(points, widthAt);
    for (let i = 0; i < strip.length; i += 3) {
      positions.push(strip[i], strip[i + 1], strip[i + 2]);
      colors.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  return coloredMesh(Three, positions, colors);
}

function riverPickMesh(Three: Three): THREEType.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const river of pack.rivers) {
    if (!river.cells || river.cells.length < 2) continue;
    const points = Rivers.addMeandering(river.cells, river.points);
    const { widthFactor, sourceWidth } = river;
    const widthAt = (index: number) =>
      Rivers.getOffset({ flux: points[index][2], pointIndex: index, widthFactor, startingWidth: sourceWidth }) * 1.4;
    const strip = polylineStrip(points, widthAt);
    const [pr, pg, pb] = encodePick(PICK_KIND.river, river.i);
    for (let i = 0; i < strip.length; i += 3) {
      positions.push(strip[i], strip[i + 1], strip[i + 2]);
      colors.push(pr / 255, pg / 255, pb / 255);
    }
  }
  return coloredMesh(Three, positions, colors, false);
}

function routeMesh(Three: Three): THREEType.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const route of pack.routes) {
    if (!route.points || route.points.length < 2) continue;
    const width = styles.routes?.groups?.[route.group]?.attrs?.["stroke-width"] ?? 0.6;
    const rgb = parseRgb(styles.routes?.groups?.[route.group]?.attrs?.stroke ?? "#9b5a2d");
    const strip = polylineStrip(route.points, () => Math.max(width, 0.4));
    for (let i = 0; i < strip.length; i += 3) {
      positions.push(strip[i], strip[i + 1], strip[i + 2]);
      colors.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  return coloredMesh(Three, positions, colors);
}

function routePickMesh(Three: Three): THREEType.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const route of pack.routes) {
    if (!route.points || route.points.length < 2) continue;
    const width = Math.max(styles.routes?.groups?.[route.group]?.attrs?.["stroke-width"] ?? 0.6, 0.8);
    const strip = polylineStrip(route.points, () => width * 1.5);
    const [pr, pg, pb] = encodePick(PICK_KIND.route, route.i);
    for (let i = 0; i < strip.length; i += 3) {
      positions.push(strip[i], strip[i + 1], strip[i + 2]);
      colors.push(pr / 255, pg / 255, pb / 255);
    }
  }
  return coloredMesh(Three, positions, colors, false);
}

function borderMesh(Three: Three): THREEType.Group {
  const group = new Three.Group();
  const { cells, vertices } = pack;
  const isLand = (cellId: number) => cells.h[cellId] >= 20;
  const statePos: number[] = [];
  const provincePos: number[] = [];
  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    const stateId = cells.state[cellId];
    if (!stateId || !isLand(cellId)) continue;
    for (const neib of cells.c[cellId]) {
      if (!isLand(neib)) continue;
      const shared = cells.v[cellId].filter(v => vertices.c[v].includes(neib));
      if (shared.length < 2) continue;
      const a = vertices.p[shared[0]];
      const b = vertices.p[shared[1]];
      if (cells.state[neib] < stateId) statePos.push(a[0], a[1], 0, b[0], b[1], 0);
      else if (cells.state[neib] === stateId && cells.province[cellId] > cells.province[neib]) {
        provincePos.push(a[0], a[1], 0, b[0], b[1], 0);
      }
    }
  }
  if (statePos.length) {
    group.add(lineMesh(Three, statePos, parseRgb(styles.borders?.stateBorders?.attrs?.stroke ?? "#56566d"), 0.95));
  }
  if (provincePos.length) {
    group.add(lineMesh(Three, provincePos, parseRgb(styles.borders?.provinceBorders?.attrs?.stroke ?? "#a5a5c0"), 0.7));
  }
  return group;
}

function coastMesh(Three: Three): THREEType.LineSegments {
  const positions: number[] = [];
  for (const feature of pack.features) {
    if (!feature?.vertices || feature.type === "ocean") continue;
    const ring = feature.vertices.map(v => pack.vertices.p[v]);
    if (ring.length < 2) continue;
    positions.push(...linePositions([...ring, ring[0]]));
  }
  return lineMesh(Three, positions, parseRgb(styles.coastline?.sea_island?.attrs?.stroke ?? "#2a231b"), 0.85);
}

export function buildSpriteMeshes(Three: Three, group: THREEType.Group, pickGroup: THREEType.Group): void {
  if (window.Layers?.isOn("burgIcons")) addBurgs(Three, group, pickGroup);
  if (window.Layers?.isOn("relief")) addRelief(Three, group, pickGroup);
  if (window.Layers?.isOn("markers")) addMarkers(Three, group, pickGroup);
}

function addBurgs(Three: Three, group: THREEType.Group, pickGroup: THREEType.Group): void {
  const positions: number[] = [];
  const colors: number[] = [];
  const pickPos: number[] = [];
  const pickCol: number[] = [];
  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed) continue;
    const size = burg.capital ? 2.4 : 1.6;
    const rgb: [number, number, number] = burg.capital ? [0.15, 0.1, 0.08] : [0.2, 0.16, 0.12];
    pushSprite(positions, colors, burg.x, burg.y, size, rgb);
    const [pr, pg, pb] = encodePick(PICK_KIND.burg, burg.i);
    pushSprite(pickPos, pickCol, burg.x, burg.y, size * 1.4, [pr / 255, pg / 255, pb / 255]);
  }
  group.add(coloredMesh(Three, positions, colors));
  pickGroup.add(coloredMesh(Three, pickPos, pickCol, false));
}

function addRelief(Three: Three, group: THREEType.Group, pickGroup: THREEType.Group): void {
  const positions: number[] = [];
  const colors: number[] = [];
  const pickPos: number[] = [];
  const pickCol: number[] = [];
  for (const [index, icon] of (pack.relief || []).entries()) {
    const size = Math.max(icon.s * 0.35, 1.2);
    pushSprite(positions, colors, icon.x + icon.s / 2, icon.y + icon.s / 2, size, [0.28, 0.32, 0.22]);
    const [pr, pg, pb] = encodePick(PICK_KIND.relief, index);
    pushSprite(pickPos, pickCol, icon.x + icon.s / 2, icon.y + icon.s / 2, size, [pr / 255, pg / 255, pb / 255]);
  }
  group.add(coloredMesh(Three, positions, colors));
  pickGroup.add(coloredMesh(Three, pickPos, pickCol, false));
}

function addMarkers(Three: Three, group: THREEType.Group, pickGroup: THREEType.Group): void {
  const positions: number[] = [];
  const colors: number[] = [];
  const pickPos: number[] = [];
  const pickCol: number[] = [];
  for (const marker of pack.markers) {
    if (marker.hidden) continue;
    const size = Math.max((marker.size || 1) * 1.2, 1.5);
    pushSprite(positions, colors, marker.x, marker.y, size, parseRgb(marker.fill || "#c0392b"));
    const [pr, pg, pb] = encodePick(PICK_KIND.marker, marker.i);
    pushSprite(pickPos, pickCol, marker.x, marker.y, size, [pr / 255, pg / 255, pb / 255]);
  }
  group.add(coloredMesh(Three, positions, colors));
  pickGroup.add(coloredMesh(Three, pickPos, pickCol, false));
}

function pushSprite(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  size: number,
  rgb: [number, number, number]
): void {
  const h = size / 2;
  const quad = [x - h, y - h, x + h, y - h, x + h, y + h, x - h, y - h, x + h, y + h, x - h, y + h];
  for (let i = 0; i < quad.length; i += 2) {
    positions.push(quad[i], quad[i + 1], 0);
    colors.push(rgb[0], rgb[1], rgb[2]);
  }
}

function coloredMesh(
  Three: Three,
  positions: number[],
  colors: number[],
  transparent = true,
  opacity = 1
): THREEType.Mesh {
  const geometry = new Three.BufferGeometry();
  geometry.setAttribute("position", new Three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Three.Float32BufferAttribute(colors, 3));
  const material = new Three.MeshBasicMaterial({
    vertexColors: true,
    transparent: transparent || opacity < 1,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: Three.DoubleSide
  });
  const mesh = new Three.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function lineMesh(
  Three: Three,
  positions: number[],
  rgb: [number, number, number],
  alpha: number
): THREEType.LineSegments {
  const geometry = new Three.BufferGeometry();
  geometry.setAttribute("position", new Three.Float32BufferAttribute(positions, 3));
  const material = new Three.LineBasicMaterial({
    color: new Three.Color(rgb[0], rgb[1], rgb[2]),
    transparent: alpha < 1,
    opacity: alpha,
    depthWrite: false
  });
  const lines = new Three.LineSegments(geometry, material);
  lines.frustumCulled = false;
  return lines;
}

export function gpuFillIds(): readonly LayerId[] {
  return FILL_LAYERS;
}

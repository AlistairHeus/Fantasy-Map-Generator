import { closeDialogs } from "@/components/dialog/dialog-helpers";
import { tip } from "@/components/tooltips";
import { Coastline } from "@/generators/coastline-generator";
import type { Feature, FeatureType } from "@/generators/features-generator";
import { savedMessage } from "@/services/platform";
import { downloadFile, getFileName } from "@/utils";

/** FMGb v1 prefix is unchanged so older mesh readers still work. Terrain extras follow as FMGx chunks. */
export const BINARY_MESH_VERSION = 2;
const FEATURE_TYPE_CODE: Record<FeatureType, number> = { ocean: 0, lake: 1, island: 2 };

class BinaryWriter {
  private buffer = new ArrayBuffer(1024 * 1024);
  private view = new DataView(this.buffer);
  private bytes = new Uint8Array(this.buffer);
  offset = 0;

  private ensure(extra: number): void {
    const needed = this.offset + extra;
    if (needed <= this.buffer.byteLength) return;
    let size = this.buffer.byteLength;
    while (size < needed) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(this.bytes);
    this.buffer = next;
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
  }

  u8(value: number): void {
    this.ensure(1);
    this.view.setUint8(this.offset++, value & 0xff);
  }

  i8(value: number): void {
    this.ensure(1);
    this.view.setInt8(this.offset++, value);
  }

  u16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  i16(value: number): void {
    this.ensure(2);
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }

  u32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  i32(value: number): void {
    this.ensure(4);
    this.view.setInt32(this.offset, value, true);
    this.offset += 4;
  }

  f32(value: number): void {
    this.ensure(4);
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
  }

  fourCC(code: string): void {
    for (let i = 0; i < 4; i++) this.u8((code.charCodeAt(i) || 32) & 0xff);
  }

  string(value: string): void {
    const encoded = new TextEncoder().encode(value ?? "");
    this.u32(encoded.length);
    this.ensure(encoded.length);
    this.bytes.set(encoded, this.offset);
    this.offset += encoded.length;
  }

  channelU8(source: ArrayLike<number> | undefined, count: number): void {
    for (let i = 0; i < count; i++) this.u8(source?.[i] ?? 0);
  }

  channelI8(source: ArrayLike<number> | undefined, count: number): void {
    for (let i = 0; i < count; i++) this.i8(source?.[i] ?? 0);
  }

  channelU16(source: ArrayLike<number> | undefined, count: number): void {
    for (let i = 0; i < count; i++) this.u16(source?.[i] ?? 0);
  }

  channelI16(source: ArrayLike<number> | undefined, count: number): void {
    for (let i = 0; i < count; i++) this.i16(source?.[i] ?? 0);
  }

  channelU32(source: ArrayLike<number> | undefined, count: number): void {
    for (let i = 0; i < count; i++) this.u32(source?.[i] ?? 0);
  }

  channelF32(source: ArrayLike<number> | undefined, count: number): void {
    for (let i = 0; i < count; i++) this.f32(source?.[i] ?? 0);
  }

  bytesFrom(source: Uint8Array): void {
    this.ensure(source.length);
    this.bytes.set(source, this.offset);
    this.offset += source.length;
  }

  toBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }
}

function writeChunk(file: BinaryWriter, id: string, write: (chunk: BinaryWriter) => void): void {
  const chunk = new BinaryWriter();
  write(chunk);
  file.fourCC(id);
  file.u32(chunk.offset);
  file.bytesFrom(new Uint8Array(chunk.toBuffer()));
}

function at(source: ArrayLike<number> | undefined, index: number, fallback = 0): number {
  return source?.[index] ?? fallback;
}

function riverPoints(river: {
  cells?: number[];
  points?: [number, number][];
  widthFactor?: number;
  sourceWidth?: number;
}) {
  const cells = river.cells ?? [];
  if (cells.length < 2) return [] as [number, number, number][];
  const points = river.points && river.points.length === cells.length ? river.points : null;
  try {
    return Rivers?.addMeandering?.(cells, points) ?? [];
  } catch {
    return cells
      .filter(cell => cell >= 0)
      .map(cell => [pack.cells.p[cell][0], pack.cells.p[cell][1], at(pack.cells.fl, cell)] as [number, number, number]);
  }
}

function writeMapChunk(chunk: BinaryWriter, verticesCount: number, cellsCount: number): void {
  chunk.f32(options.map.graph.width);
  chunk.f32(options.map.graph.height);
  chunk.u32(verticesCount);
  chunk.u32(cellsCount);
  chunk.u16(grid.cellsX ?? 0);
  chunk.u16(grid.cellsY ?? 0);
  chunk.f32(grid.spacing ?? 0);
  chunk.f32(options.map.units.height.exponent);
  chunk.string(String(options.map.seed ?? ""));
  chunk.string(options.map.units.height.unit ?? "m");
}

function writeCellExtras(chunk: BinaryWriter, cellsCount: number): void {
  const cells = pack.cells;
  chunk.channelI8(cells.t, cellsCount);
  chunk.channelU32(cells.f, cellsCount);
  chunk.channelU16(cells.r, cellsCount);
  chunk.channelU16(cells.fl, cellsCount);
  chunk.channelU16(cells.conf, cellsCount);
  chunk.channelU32(cells.haven, cellsCount);
  chunk.channelU8(cells.harbor, cellsCount);
  chunk.channelU16(cells.culture, cellsCount);
  chunk.channelU16(cells.religion, cellsCount);
  chunk.channelU16(cells.burg, cellsCount);
  chunk.channelF32(cells.pop, cellsCount);
  chunk.channelI16(cells.s, cellsCount);
  chunk.channelU16(cells.area, cellsCount);
  chunk.channelU32(cells.g, cellsCount);
  for (let i = 0; i < cellsCount; i++) chunk.u8(cells.b?.[i] ? 1 : 0);
  chunk.channelU16(cells.good, cellsCount);
  chunk.channelU16(cells.market, cellsCount);
}

function writeCellCenters(chunk: BinaryWriter, cellsCount: number): void {
  for (let i = 0; i < cellsCount; i++) {
    const point = pack.cells.p[i];
    chunk.f32(point?.[0] ?? 0);
    chunk.f32(point?.[1] ?? 0);
  }
}

function writeNeighbors(chunk: BinaryWriter, cellsCount: number): void {
  for (let i = 0; i < cellsCount; i++) {
    const neighbors = pack.cells.c[i] ?? [];
    chunk.u8(Math.min(neighbors.length, 255));
    for (let j = 0; j < neighbors.length && j < 255; j++) chunk.u32(neighbors[j]);
  }
}

function writeGridClimate(chunk: BinaryWriter): void {
  const n = grid.cells.h?.length ?? grid.points?.length ?? 0;
  chunk.u32(n);
  chunk.u16(grid.cellsX ?? 0);
  chunk.u16(grid.cellsY ?? 0);
  chunk.f32(grid.spacing ?? 0);
  chunk.channelI8(grid.cells.temp, n);
  chunk.channelU8(grid.cells.prec, n);
  chunk.channelU8(grid.cells.h, n);
  chunk.channelI8(grid.cells.t, n);
  chunk.channelU32(grid.cells.f, n);
  for (let i = 0; i < n; i++) {
    const point = grid.points?.[i];
    chunk.f32(point?.[0] ?? 0);
    chunk.f32(point?.[1] ?? 0);
  }
}

function writeRivers(chunk: BinaryWriter): void {
  const rivers = pack.rivers ?? [];
  chunk.u32(rivers.length);
  for (const river of rivers) {
    const cells = river.cells ?? [];
    const points = riverPoints(river);
    chunk.u32(river.i ?? 0);
    chunk.u32(river.source ?? 0);
    chunk.u32(river.mouth ?? 0);
    chunk.u32(river.parent ?? 0);
    chunk.u32(river.basin ?? 0);
    chunk.f32(river.length ?? 0);
    chunk.f32(river.discharge ?? 0);
    chunk.f32(river.width ?? 0);
    chunk.f32(river.widthFactor ?? 0);
    chunk.f32(river.sourceWidth ?? 0);
    chunk.u32(cells.length);
    for (const cell of cells) chunk.i32(cell);
    chunk.u32(points.length);
    for (const [x, y, flux] of points) {
      chunk.f32(x);
      chunk.f32(y);
      chunk.f32(flux);
    }
  }
}

function writeCoasts(chunk: BinaryWriter): void {
  const features = (pack.features ?? []).filter(
    (feature): feature is Feature => Boolean(feature) && typeof feature === "object"
  );
  chunk.u32(features.length);
  for (const feature of features) {
    let points: [number, number][] = [];
    let origIndices: number[] = [];
    let path = "";
    try {
      const shape = Coastline.getFeatureShape(feature);
      points = shape.points;
      origIndices = shape.origIndices;
      path = Coastline.getFeaturePath(feature);
    } catch {
      points = (feature.vertices ?? []).map(vertex => pack.vertices.p[vertex]).filter(Boolean);
      origIndices = points.map((_, index) => index);
    }

    chunk.u32(feature.i ?? 0);
    chunk.u8(FEATURE_TYPE_CODE[feature.type] ?? 255);
    chunk.u8(feature.land ? 1 : 0);
    chunk.u8(feature.border ? 1 : 0);
    chunk.f32(feature.height ?? 0);
    chunk.string(feature.subtype ?? "");
    chunk.string(feature.group ?? "");
    chunk.u32(points.length);
    for (const [x, y] of points) {
      chunk.f32(x);
      chunk.f32(y);
    }
    chunk.u32(origIndices.length);
    for (const index of origIndices) chunk.u32(index);
    chunk.string(path);
  }
}

function parseHexColor(color: string | undefined): [number, number, number] {
  const match = color?.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!match) return [0, 0, 0];
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}

function writeBiomes(chunk: BinaryWriter): void {
  const biomes = pack.biomes ?? [];
  chunk.u32(biomes.length);
  for (const biome of biomes) {
    const [r, g, b] = parseHexColor(biome?.color);
    chunk.u32(biome?.i ?? 0);
    chunk.u8(r);
    chunk.u8(g);
    chunk.u8(b);
    chunk.u8(Math.max(0, Math.min(255, Math.round((biome?.habitability ?? 0) * 2.55))));
    chunk.string(biome?.name ?? "");
  }
}

function writeStates(chunk: BinaryWriter): void {
  const states = pack.states ?? [];
  chunk.u32(states.length);
  for (const state of states) {
    const [r, g, b] = parseHexColor(state?.color);
    chunk.u32(state?.i ?? 0);
    chunk.u8(r);
    chunk.u8(g);
    chunk.u8(b);
    chunk.string(state?.name ?? "");
  }
}

function writeBurgs(chunk: BinaryWriter): void {
  const burgs = pack.burgs ?? [];
  chunk.u32(burgs.length);
  for (const burg of burgs) {
    chunk.u32(burg?.i ?? 0);
    chunk.f32(burg?.x ?? 0);
    chunk.f32(burg?.y ?? 0);
    chunk.u32(burg?.cell ?? 0);
    chunk.u32(burg?.state ?? 0);
    chunk.u8(burg?.capital ? 1 : 0);
    chunk.string(burg?.name ?? "");
  }
}

function writeRoutes(chunk: BinaryWriter): void {
  const routes = pack.routes ?? [];
  chunk.u32(routes.length);
  for (const route of routes) {
    chunk.u32(route?.i ?? 0);
    chunk.string(route?.group ?? "");
    chunk.string(route?.name ?? "");
    const points = route?.points ?? [];
    chunk.u32(points.length);
    for (const p of points) {
      chunk.f32(p?.[0] ?? 0);
      chunk.f32(p?.[1] ?? 0);
    }
  }
}

/**
 * Build an FMGb mesh file: v1 mesh + cell fields, then FMGx chunks for climate,
 * rivers, vector coasts, and the remaining pack/grid channels terrain tools need.
 */
export function buildBinaryMesh(): ArrayBuffer {
  const verticesCount = pack.vertices.p.length;
  const cellsCount = pack.cells.i.length;

  const file = new BinaryWriter();
  file.fourCC("FMGb");
  file.u32(verticesCount);
  file.u32(cellsCount);

  for (let i = 0; i < verticesCount; i++) {
    file.f32(pack.vertices.p[i][0]);
    file.f32(pack.vertices.p[i][1]);
  }

  for (let i = 0; i < cellsCount; i++) {
    const vertices = pack.cells.v[i];
    for (let j = 0; j < vertices.length; j++) file.u32(vertices[j]);
  }

  for (let i = 0; i < cellsCount; i++) file.u8(pack.cells.v[i].length);
  file.channelU8(pack.cells.h, cellsCount);
  file.channelU8(pack.cells.biome, cellsCount);
  file.channelU16(pack.cells.state, cellsCount);
  file.channelU16(pack.cells.province, cellsCount);

  const chunks: [string, (chunk: BinaryWriter) => void][] = [
    ["MAP ", write => writeMapChunk(write, verticesCount, cellsCount)],
    ["CELX", write => writeCellExtras(write, cellsCount)],
    ["CXY ", write => writeCellCenters(write, cellsCount)],
    ["CNBR", write => writeNeighbors(write, cellsCount)],
    ["GRID", writeGridClimate],
    ["RIVR", writeRivers],
    ["COAS", writeCoasts],
    ["BIOM", writeBiomes],
    ["STAT", writeStates],
    ["BURG", writeBurgs],
    ["ROUT", writeRoutes]
  ];

  file.fourCC("FMGx");
  file.u16(BINARY_MESH_VERSION);
  file.u16(chunks.length);
  for (const [id, write] of chunks) writeChunk(file, id, write);

  return file.toBuffer();
}

function exportToBinary(): void {
  if (customization) {
    tip("Data cannot be exported when edit mode is active, please exit the mode and retry", false, "error");
    return;
  }
  closeDialogs("#alert");

  TIME && console.time("exportToBinary");

  try {
    const blob = new Blob([buildBinaryMesh()], { type: "application/octet-stream" });
    const fileName = `${getFileName("Mesh")}.bin`;
    downloadFile(blob, fileName, "application/octet-stream");
    tip(savedMessage(fileName), true, "success", 7000);
  } catch (error) {
    ERROR && console.error(error);
    tip(`Binary export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 5000);
  } finally {
    TIME && console.timeEnd("exportToBinary");
  }
}

export const ExportBinary = { exportToBinary, buildBinaryMesh };

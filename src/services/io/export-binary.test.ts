import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Coastline } from "@/generators/coastline-generator";
import { BINARY_MESH_VERSION, buildBinaryMesh } from "./export-binary";

const decoder = new TextDecoder();

class BinaryReader {
  constructor(
    private view: DataView,
    public offset = 0
  ) {}

  u8() {
    return this.view.getUint8(this.offset++);
  }

  i8() {
    return this.view.getInt8(this.offset++);
  }

  u16() {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32() {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i32() {
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32() {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  fourCC() {
    return String.fromCharCode(this.u8(), this.u8(), this.u8(), this.u8());
  }

  string() {
    const length = this.u32();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return decoder.decode(bytes);
  }

  skip(bytes: number) {
    this.offset += bytes;
  }
}

function parseChunks(buffer: ArrayBuffer) {
  const reader = new BinaryReader(new DataView(buffer));
  expect(reader.fourCC()).toBe("FMGb");
  const verticesCount = reader.u32();
  const cellsCount = reader.u32();

  let indicesCount = 0;
  for (let i = 0; i < cellsCount; i++) indicesCount += pack.cells.v[i].length;
  reader.skip(verticesCount * 8 + indicesCount * 4 + cellsCount * 7);

  expect(reader.fourCC()).toBe("FMGx");
  const version = reader.u16();
  const chunkCount = reader.u16();
  const chunks = new Map<string, DataView>();
  for (let i = 0; i < chunkCount; i++) {
    const id = reader.fourCC();
    const size = reader.u32();
    chunks.set(id, new DataView(buffer, reader.offset, size));
    reader.skip(size);
  }
  return { verticesCount, cellsCount, version, chunks };
}

beforeEach(() => {
  options.map.graph.width = 100;
  options.map.graph.height = 80;
  options.map.seed = "climate-test";
  options.map.units.height.exponent = 2;
  options.map.units.height.unit = "m";

  globalThis.pack = {
    vertices: {
      p: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ]
    },
    cells: {
      i: [0, 1],
      v: [
        [0, 1, 2],
        [0, 2, 3]
      ],
      p: [
        [5, 3],
        [5, 7]
      ],
      c: [[1], [0]],
      h: new Uint8Array([40, 18]),
      biome: new Uint8Array([6, 0]),
      state: new Uint16Array([1, 0]),
      province: new Uint16Array([2, 0]),
      t: new Int8Array([1, -1]),
      f: new Uint16Array([1, 2]),
      r: new Uint16Array([3, 0]),
      fl: new Uint16Array([80, 12]),
      conf: new Uint16Array([0, 0]),
      haven: new Uint16Array([1, 0]),
      harbor: new Uint8Array([2, 0]),
      culture: new Uint16Array([1, 0]),
      religion: new Uint16Array([1, 0]),
      burg: new Uint16Array([0, 0]),
      pop: new Float32Array([1.5, 0]),
      s: new Int16Array([10, 0]),
      area: new Uint16Array([20, 22]),
      g: new Uint16Array([0, 1]),
      b: [false, true],
      good: new Uint16Array([0, 0]),
      market: new Uint16Array([0, 0])
    },
    rivers: [
      {
        i: 3,
        source: 0,
        mouth: 1,
        parent: 3,
        basin: 3,
        length: 12,
        discharge: 80,
        width: 0.4,
        widthFactor: 1,
        sourceWidth: 0.05,
        cells: [0, 1]
      }
    ],
    features: [
      0,
      {
        i: 1,
        type: "island",
        land: true,
        border: false,
        height: 40,
        subtype: "continent",
        group: "sea_island",
        vertices: [0, 1, 2, 3]
      }
    ],
    biomes: [{ i: 6, name: "Temperate deciduous forest", color: "#33442e", habitability: 100 }]
  } as unknown as typeof pack;

  globalThis.grid = {
    cellsX: 2,
    cellsY: 1,
    spacing: 10,
    points: [
      [5, 3],
      [15, 3]
    ],
    cells: {
      h: new Uint8Array([40, 12]),
      temp: new Int8Array([-6, 16]),
      prec: new Uint8Array([8, 22]),
      t: new Int8Array([1, -1]),
      f: new Uint16Array([1, 2])
    }
  } as unknown as typeof grid;

  globalThis.Rivers = {
    addMeandering: () => [
      [5, 3, 80],
      [5, 7, 80]
    ]
  } as unknown as typeof Rivers;

  vi.spyOn(Coastline, "getFeatureShape").mockReturnValue({
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ],
    origIndices: [0, 1, 2, 3]
  });
  vi.spyOn(Coastline, "getFeaturePath").mockReturnValue("M0,0L10,0L10,10L0,10Z");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildBinaryMesh", () => {
  it("keeps the v1 mesh prefix so older readers still find heights and biomes", () => {
    const buffer = buildBinaryMesh();
    const view = new DataView(buffer);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("FMGb");
    expect(view.getUint32(4, true)).toBe(4);
    expect(view.getUint32(8, true)).toBe(2);

    const verticesSize = 4 * 8;
    const indicesSize = 6 * 4;
    const countsSize = 2;
    const heightsAt = 12 + verticesSize + indicesSize + countsSize;
    expect(view.getUint8(heightsAt)).toBe(40);
    expect(view.getUint8(heightsAt + 1)).toBe(18);
    expect(view.getUint8(heightsAt + 2)).toBe(6);
  });

  it("appends climate, rivers, and vector coasts after the v1 body", () => {
    const { version, chunks } = parseChunks(buildBinaryMesh());
    expect(version).toBe(BINARY_MESH_VERSION);
    expect([...chunks.keys()]).toEqual(["MAP ", "CELX", "CXY ", "CNBR", "GRID", "RIVR", "COAS", "BIOM"]);

    const climate = new BinaryReader(chunks.get("GRID")!);
    expect(climate.u32()).toBe(2);
    climate.skip(8);
    expect(climate.i8()).toBe(-6);
    expect(climate.i8()).toBe(16);
    climate.skip(2);
    expect(climate.u8()).toBe(40);
    expect(climate.u8()).toBe(12);

    const extras = new BinaryReader(chunks.get("CELX")!);
    extras.skip(2 + 8);
    expect(extras.u16()).toBe(3);
    expect(extras.u16()).toBe(0);
    expect(extras.u16()).toBe(80);
    expect(extras.u16()).toBe(12);

    const rivers = new BinaryReader(chunks.get("RIVR")!);
    expect(rivers.u32()).toBe(1);
    expect(rivers.u32()).toBe(3);
    rivers.skip(16 + 20);
    expect(rivers.u32()).toBe(2);
    expect(rivers.i32()).toBe(0);
    expect(rivers.i32()).toBe(1);
    expect(rivers.u32()).toBe(2);
    expect(rivers.f32()).toBe(5);
    expect(rivers.f32()).toBe(3);
    expect(rivers.f32()).toBe(80);

    const coasts = new BinaryReader(chunks.get("COAS")!);
    expect(coasts.u32()).toBe(1);
    expect(coasts.u32()).toBe(1);
    expect(coasts.u8()).toBe(2);
    coasts.skip(2 + 4);
    expect(coasts.string()).toBe("continent");
    expect(coasts.string()).toBe("sea_island");
    expect(coasts.u32()).toBe(4);
    coasts.skip(4 * 8 + 4 + 4 * 4);
    expect(coasts.string()).toBe("M0,0L10,0L10,10L0,10Z");
  });
});

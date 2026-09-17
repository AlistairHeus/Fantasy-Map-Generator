import { describe, expect, it } from "vitest";
import { parseMapJson, wrapMapFile } from "@/services/io/map-file";
import { mapToScreen, screenToMap } from "./camera";
import { decodePick, encodePick, PICK_KIND } from "./picking";

describe("map camera", () => {
  it("round-trips map and screen space with the svg viewbox transform", () => {
    const view = { width: 800, height: 600, scale: 2, x: 40, y: -10 };
    const [sx, sy] = mapToScreen(10, 20, view);
    expect([sx, sy]).toEqual([60, 30]);
    expect(screenToMap(sx, sy, view)).toEqual([10, 20]);
  });
});

describe("gpu picking", () => {
  it("encodes and decodes a feature id", () => {
    const [r, g, b] = encodePick(PICK_KIND.river, 1234);
    expect(decodePick(r, g, b)).toEqual({ kind: PICK_KIND.river, id: 1234 });
  });

  it("returns null for empty pixels", () => {
    expect(decodePick(0, 0, 0)).toBeNull();
  });
});

describe("json map file", () => {
  it("wraps crlf records in the fmg-json envelope", () => {
    const wrapped = wrapMapFile('1.0.0|license\r\n{"seed":"1"}', "1.0.0");
    const parsed = JSON.parse(wrapped);
    expect(parsed.format).toBe("fmg-json");
    expect(parsed.records).toEqual(["1.0.0|license", '{"seed":"1"}']);
    expect(parseMapJson(wrapped)?.records).toEqual(parsed.records);
  });
});

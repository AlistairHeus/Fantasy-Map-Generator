import type * as THREEType from "three";
import { clampTextureResolution } from "@/data/view-3d-options";
import { generateSatelliteTexture } from "@/renderers/draw-satellite-texture";
import * as ErosionBake from "@/renderers/erosion-bake";

/** Field bake like 3D; 2D supersamples further because we look straight down at the map */
function textureBudget(renderer: THREEType.WebGLRenderer): { bake: number; output: number } {
  const max = renderer.capabilities.maxTextureSize;
  const output = Math.min(clampTextureResolution(options.app.threeD.resolutionScale || 4096), max);
  const bake = output >= 4096 ? 2048 : 1024;
  return { bake, output };
}

export async function bakeTerrainTexture(renderer: THREEType.WebGLRenderer): Promise<THREEType.Texture | null> {
  try {
    const { bake, output } = textureBudget(renderer);
    const result = await ErosionBake.bake(renderer, {
      strength: options.app.threeD.erosion ? options.app.threeD.erosionStrength : 0,
      riverDepth: options.app.threeD.erosionRiverDepth,
      octaves: options.app.threeD.erosionOctaves,
      bakeResolution: bake
    });
    if (!result) return null;

    return generateSatelliteTexture(renderer, result, {
      scale: options.app.threeD.scale,
      maxOutput: output,
      maxSupersample: 4
    });
  } catch (error) {
    ERROR && console.error("Terrain bake failed:", error);
    return null;
  }
}

export function makeTerrainQuad(Three: typeof import("three"), texture: THREEType.Texture | null): THREEType.Mesh {
  const { width, height } = options.map.graph;
  const geometry = new Three.PlaneGeometry(width, height, 1, 1);
  geometry.translate(width / 2, height / 2, 0);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  if (texture) {
    texture.generateMipmaps = false;
    texture.minFilter = Three.LinearFilter;
    texture.magFilter = Three.LinearFilter;
    texture.needsUpdate = true;
  }
  const material = new Three.MeshBasicMaterial({
    map: texture ?? undefined,
    color: texture ? 0xffffff : 0x6b8f4e,
    side: Three.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  const mesh = new Three.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

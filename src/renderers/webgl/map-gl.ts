import type * as THREEType from "three";
import type { LayerId } from "@/components/layers";
import { viewport } from "@/components/viewport";
import { applyWorldTransform } from "./camera";
import { loadThree } from "./load-three";
import { decodePick, type GpuHit } from "./picking";
import { bakeTerrainTexture, makeTerrainQuad } from "./terrain";
import { buildFillMeshes, buildLineMeshes, buildSpriteMeshes, disposeVectorTextures, gpuFillIds } from "./vectors";

const COVERED: ReadonlySet<string> = new Set(["texture", "heightmap", "biomes", "ocean"]);
const GPU_LINES: ReadonlySet<string> = new Set(["rivers", "routes", "borders", "coastline"]);
const GPU_SPRITES: ReadonlySet<string> = new Set(["relief", "burgIcons", "markers"]);

let canvas: HTMLCanvasElement | null = null;
let renderer: THREEType.WebGLRenderer | null = null;
let scene: THREEType.Scene | null = null;
let pickScene: THREEType.Scene | null = null;
let camera: THREEType.OrthographicCamera | null = null;
let world: THREEType.Group | null = null;
let pickWorld: THREEType.Group | null = null;
let Three: typeof import("three") | null = null;
let paused = false;
let dirty = true;
let frameId = 0;
let bakeToken = 0;
let pickTarget: THREEType.WebGLRenderTarget | null = null;
let terrainMesh: THREEType.Mesh | null = null;

export const MapGL = {
  init,
  ensure,
  resize,
  syncCamera,
  pause,
  resume,
  isPaused: () => paused,
  isReady: () => Boolean(renderer),
  isActive,
  usesGpu,
  covers,
  skipSvgDraw,
  invalidate,
  render,
  pick,
  capture,
  applyCoverage,
  dispose
};

function isActive(): boolean {
  return Boolean(renderer) && !paused && Boolean(window.Layers?.isOn("terrainShade"));
}

function usesGpu(id: LayerId | string): boolean {
  if (!isActive()) return false;
  if (id === "terrainShade") return true;
  if (COVERED.has(id)) return false;
  if ((gpuFillIds() as readonly string[]).includes(id)) return true;
  if (GPU_LINES.has(id) || GPU_SPRITES.has(id)) return true;
  return false;
}

function covers(id: LayerId | string): boolean {
  return isActive() && COVERED.has(id);
}

function skipSvgDraw(id: LayerId | string): boolean {
  if (covers(id)) return true;
  if (!isActive()) return false;
  return (gpuFillIds() as readonly string[]).includes(id);
}

function init(): void {
  if (canvas || typeof document === "undefined") return;
  canvas = document.createElement("canvas");
  canvas.id = "mapgl";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.pointerEvents = "none";
  syncDom();
  resize();
}

function syncDom(): void {
  if (!canvas) return;
  const map = document.getElementById("map");
  if (!map) return;
  if (canvas.parentElement !== document.body || canvas.nextElementSibling !== map) {
    document.body.insertBefore(canvas, map);
  }
}

async function ensure(): Promise<boolean> {
  init();
  if (renderer) return true;
  Three = await loadThree();
  if (!Three || !canvas) return false;

  renderer = new Three.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x14344d, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if ("outputColorSpace" in renderer && Three.SRGBColorSpace) renderer.outputColorSpace = Three.SRGBColorSpace;
  scene = new Three.Scene();
  pickScene = new Three.Scene();
  world = new Three.Group();
  pickWorld = new Three.Group();
  scene.add(world);
  pickScene.add(pickWorld);
  camera = new Three.OrthographicCamera(0, 1, 0, 1, -100, 100);
  camera.position.z = 10;
  resize();
  dirty = true;
  return true;
}

function resize(): void {
  if (!canvas) init();
  if (!canvas) return;
  const width = Math.max(1, viewport.width || window.innerWidth);
  const height = Math.max(1, viewport.height || window.innerHeight);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  renderer?.setSize(width, height, false);
  if (pickTarget) {
    pickTarget.dispose();
    pickTarget = null;
  }
  if (Three && renderer) {
    const ratio = renderer.getPixelRatio();
    pickTarget = new Three.WebGLRenderTarget(Math.round(width * ratio), Math.round(height * ratio), {
      depthBuffer: false,
      stencilBuffer: false
    });
  }
  if (camera) {
    camera.left = 0;
    camera.right = width;
    camera.top = 0;
    camera.bottom = height;
    camera.updateProjectionMatrix();
  }
  syncCamera();
  if (isActive()) schedule();
}

function syncCamera(): void {
  if (world) applyWorldTransform(world);
  if (pickWorld) applyWorldTransform(pickWorld);
  if (isActive()) schedule();
}

function pause(): void {
  paused = true;
  if (canvas) canvas.style.display = "none";
  applyCoverage();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
}

function resume(): void {
  paused = false;
  if (canvas) canvas.style.display = "";
  dirty = true;
  applyCoverage();
  if (window.Layers?.isOn("terrainShade")) void ensure().then(() => schedule());
}

function invalidate(): void {
  dirty = true;
  if (isActive()) schedule();
}

function schedule(): void {
  if (frameId || paused) return;
  frameId = requestAnimationFrame(() => {
    frameId = 0;
    render();
  });
}

function clearGroup(group: THREEType.Group | null): void {
  if (!group) return;
  for (const child of [...group.children]) {
    if ("children" in child && (child as THREEType.Group).children?.length) clearGroup(child as THREEType.Group);
    group.remove(child);
    const mesh = child as THREEType.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREEType.Material | THREEType.Material[] | undefined;
    if (Array.isArray(material)) for (const item of material) item.dispose();
    else material?.dispose();
  }
}

async function rebuild(): Promise<void> {
  if (!Three || !world || !pickWorld || !renderer) return;
  clearGroup(world);
  clearGroup(pickWorld);
  terrainMesh = null;

  const token = ++bakeToken;
  const texture = await bakeTerrainTexture(renderer);
  if (token !== bakeToken || !world || !renderer) return;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x14344d, 1);

  terrainMesh = makeTerrainQuad(Three, texture);
  world.add(terrainMesh);
  buildFillMeshes(Three, world);
  buildLineMeshes(Three, world, pickWorld);
  await buildSpriteMeshes(Three, world, pickWorld, () => token === bakeToken);
  if (token !== bakeToken) return;
  dirty = false;
}

function render(): void {
  if (!renderer || paused) {
    applyCoverage();
    return;
  }
  if (!isActive() || !scene || !camera) {
    applyCoverage();
    renderer.clear();
    return;
  }
  syncDom();
  applyCoverage();
  if (dirty)
    void rebuild().then(() => {
      if (!paused && renderer && scene && camera) renderer.render(scene, camera);
    });
  else renderer.render(scene, camera);
}

function applyCoverage(): void {
  const map = document.getElementById("map");
  if (map instanceof SVGElement) map.style.backgroundColor = isActive() ? "transparent" : "";

  const hide = (id: string, on: boolean) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = on ? "0" : "";
    el.style.pointerEvents = on ? "none" : "";
    if (!el.getAttribute("style")) el.removeAttribute("style");
  };

  hide("ocean", covers("ocean"));
  hide("texture", covers("texture"));
  hide("terrs", covers("heightmap"));
  hide("biomes", covers("biomes"));
  hide("landmass", isActive());

  const ghost = (elementId: string, layerId: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    const on = usesGpu(layerId);
    el.style.opacity = on ? "0" : "";
    el.style.pointerEvents = on ? "all" : "";
    if (!el.getAttribute("style")) el.removeAttribute("style");
  };

  ghost("rivers", "rivers");
  ghost("routes", "routes");
  ghost("borders", "borders");
  ghost("coastline", "coastline");
  ghost("regions", "states");
  ghost("provs", "provinces");
  ghost("cults", "cultures");
  ghost("relig", "religions");
  ghost("zones", "zones");
  ghost("cells", "cells");
  ghost("temperature", "temperature");
  ghost("prec", "precipitation");
  ghost("population", "population");
  ghost("terrain", "relief");
  ghost("icons", "burgIcons");
  ghost("markers", "markers");
}

function pick(event: MouseEvent): GpuHit | null {
  if (!isActive() || !renderer || !pickScene || !camera || !canvas || !pickTarget) return null;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

  const pixelRatio = renderer.getPixelRatio();
  const buffer = new Uint8Array(4);
  renderer.setRenderTarget(pickTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(pickScene, camera);
  renderer.readRenderTargetPixels(
    pickTarget,
    Math.floor(x * pixelRatio),
    Math.floor((rect.height - y) * pixelRatio),
    1,
    1,
    buffer
  );
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x14344d, 1);
  return decodePick(buffer[0], buffer[1], buffer[2]);
}

function capture(fullGraph = false): HTMLCanvasElement | null {
  if (!isActive() || !canvas || !renderer || !scene || !camera || !world) return null;
  if (!fullGraph) {
    render();
    return canvas;
  }

  const { width, height } = options.map.graph;
  renderer.setSize(width, height, false);
  camera.left = 0;
  camera.right = width;
  camera.top = 0;
  camera.bottom = height;
  camera.updateProjectionMatrix();
  world.position.set(0, 0, 0);
  world.scale.setScalar(1);
  if (pickWorld) {
    pickWorld.position.set(0, 0, 0);
    pickWorld.scale.setScalar(1);
  }
  renderer.render(scene, camera);

  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  copy.getContext("2d")?.drawImage(canvas, 0, 0, width, height);
  resize();
  return copy;
}

function dispose(): void {
  bakeToken++;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  clearGroup(world);
  clearGroup(pickWorld);
  disposeVectorTextures();
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
  scene = null;
  pickScene = null;
  camera = null;
  world = null;
  pickWorld = null;
  terrainMesh = null;
  pickTarget?.dispose();
  pickTarget = null;
  canvas?.remove();
  canvas = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => init());
}

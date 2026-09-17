import { expect, test } from "@playwright/test";
import { waitForMap } from "./wait-for-map";

test.use({
  launchOptions: {
    args: ["--enable-unsafe-swiftshader"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  }
});

test.describe("WebGL hybrid 2D map", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/?seed=mapgl-hybrid&width=1280&height=720");
    await waitForMap(page);
  });

  test("natural terrain draws under the svg and follows pan/zoom", async ({ page }) => {
    const hasWebGL = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    });
    test.skip(!hasWebGL, "WebGL is not available in this environment");

    await page.evaluate(() => (window as any).showOptions());
    await page.locator("#mapLayers > li[data-layer='terrainShade']").click();

    const canvas = page.locator("#mapgl");
    await expect(canvas).toBeAttached({ timeout: 60000 });
    await expect(canvas).toHaveCSS("pointer-events", "none");

    await page.waitForFunction(() => (window as any).Layers.isOn("terrainShade") && Boolean(document.getElementById("mapgl")), {
      timeout: 60000
    });

    const oceanHidden = await page.locator("#ocean").evaluate(el => (el as HTMLElement).style.opacity === "0");
    expect(oceanHidden).toBe(true);

    const map = page.locator("#map");
    const box = await map.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(300);
    await expect(canvas).toBeAttached();

    const burg = page.locator("#burgIcons use[id^='burg']").first();
    if (await burg.count()) await burg.click({ force: true });

    await page.evaluate(() => (window as any).Layers.hide("terrainShade"));
    await page.waitForTimeout(200);
    const oceanShown = await page.locator("#ocean").evaluate(el => (el as HTMLElement).style.opacity !== "0");
    expect(oceanShown).toBe(true);
  });
});

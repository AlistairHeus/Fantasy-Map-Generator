let Three: typeof import("three") | null = null;
let loadPromise: Promise<typeof import("three") | null> | null = null;

/** Load the vendored three.js bundle once and share it between the 2D MapGL view and the 3D scene */
export function loadThree(): Promise<typeof import("three") | null> {
  if (Three) return Promise.resolve(Three);
  if (typeof window !== "undefined" && window.THREE) {
    Three = window.THREE as unknown as typeof import("three");
    return Promise.resolve(Three);
  }
  if (!loadPromise) {
    loadPromise = new Promise(resolve => {
      if (typeof document === "undefined") return resolve(null);
      const script = document.createElement("script");
      script.src = "libs/three.min.js";
      document.head.append(script);
      script.onload = () => {
        Three = window.THREE as unknown as typeof import("three");
        resolve(Three);
      };
      script.onerror = () => resolve(null);
    });
  }
  return loadPromise;
}

export function getThree(): typeof import("three") | null {
  return Three;
}

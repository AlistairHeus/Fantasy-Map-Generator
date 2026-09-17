/** Fan-triangulate a polygon around its centroid. Returns packed xyz triplets */
export function fanTriangles(center: [number, number], ring: ArrayLike<number>[]): number[] {
  const positions: number[] = [];
  const n = ring.length;
  if (n < 3) return positions;
  const [cx, cy] = center;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    positions.push(cx, cy, 0, a[0], a[1], 0, b[0], b[1], 0);
  }
  return positions;
}

/** Expand a polyline into a triangle strip (miter-ish) in xyz triplets */
export function polylineStrip(points: ArrayLike<number>[], widthAt: (index: number) => number): number[] {
  const positions: number[] = [];
  if (points.length < 2) return positions;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * widthAt(i);
    const ny = (dx / len) * widthAt(i);
    const mx = (-dy / len) * widthAt(i + 1);
    const my = (dx / len) * widthAt(i + 1);

    positions.push(
      a[0] - nx,
      a[1] - ny,
      0,
      a[0] + nx,
      a[1] + ny,
      0,
      b[0] - mx,
      b[1] - my,
      0,
      a[0] + nx,
      a[1] + ny,
      0,
      b[0] + mx,
      b[1] + my,
      0,
      b[0] - mx,
      b[1] - my,
      0
    );
  }
  return positions;
}

export function linePositions(points: ArrayLike<number>[]): number[] {
  const positions: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    positions.push(a[0], a[1], 0, b[0], b[1], 0);
  }
  return positions;
}

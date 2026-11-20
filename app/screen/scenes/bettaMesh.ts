import {
  BufferGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  SphereGeometry,
  SplineCurve,
  Vector2,
} from "three";

type Point = [number, number];

const bodyProfile: Point[] = [
  [-0.43, 0.019], [-0.35, 0.028], [-0.26, 0.045], [-0.13, 0.077],
  [0.03, 0.107], [0.16, 0.111], [0.28, 0.087], [0.36, 0.058], [0.425, 0.032], [0.448, 0],
];
const profile = new SplineCurve(bodyProfile.map(([x, radius]) => new Vector2(radius, x)));

function makeBody(lengthSegments: number, radialSegments: number) {
  const geometry = new LatheGeometry(profile.getPoints(lengthSegments), radialSegments)
    .rotateZ(-Math.PI / 2)
    .rotateX(Math.PI / 2)
    .scale(1, 1, 0.61);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    const progress = (positions.getX(i) + 0.43) / 0.878;
    positions.setY(i, positions.getY(i) + progress * progress * 0.06);
    uv.setXY(i, progress, uv.getX(i));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export const body = makeBody(56, 40);
export const distantBody = makeBody(19, 14);

/** Fan UVs run from the attachment at v=0 to the scalloped outer edge at v=1. */
function fin(start: Point, end: Point, rim: Point[], rays = 48, rings = 14) {
  const curve = new SplineCurve(rim.map(([x, y]) => new Vector2(x, y)));
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rings; row++) {
    const radius = row / rings;
    for (let col = 0; col <= rays; col++) {
      const angle = col / rays;
      const tip = curve.getPoint(angle);
      const rootX = start[0] + (end[0] - start[0]) * angle;
      const rootY = start[1] + (end[1] - start[1]) * angle;
      const rimRipple = 1 + 0.018 * Math.sin(angle * 143) * radius ** 4;
      const fold = Math.sin(angle * 37 + radius * 3) * 0.017 + Math.cos(angle * 12) * 0.026;
      vertices.push(
        rootX + (tip.x - rootX) * radius * rimRipple,
        rootY + (tip.y - rootY) * radius * rimRipple,
        fold * radius,
      );
      uvs.push(angle, radius);

      if (row < rings && col < rays) {
        const current = row * (rays + 1) + col;
        const next = current + rays + 1;
        indices.push(current, current + 1, next, next, current + 1, next + 1);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type FinProfile = [Point, Point, Point[]];

const tail: FinProfile = [[-0.39, 0.018], [-0.39, -0.017], [
  [-0.48, 0.045], [-0.64, 0.22], [-0.82, 0.30], [-0.99, 0.25],
  [-1.09, 0.14], [-1.08, -0.02], [-1.02, -0.19], [-0.89, -0.34],
  [-0.73, -0.38], [-0.56, -0.31], [-0.48, -0.17], [-0.40, -0.044],
]];
const dorsal: FinProfile = [[0.17, 0.065], [-0.42, 0.015], [
  [0.12, 0.133], [0.06, 0.206], [-0.06, 0.246], [-0.23, 0.248],
  [-0.37, 0.193], [-0.46, 0.103], [-0.46, 0.025],
]];
const anal: FinProfile = [[0.20, -0.062], [-0.40, -0.014], [
  [0.16, -0.11], [0.11, -0.21], [0.01, -0.29], [-0.16, -0.37],
  [-0.34, -0.38], [-0.52, -0.32], [-0.53, -0.24], [-0.46, -0.11], [-0.44, -0.028],
]];
const ventral = fin([0.23, -0.064], [0.19, -0.063], [
  [0.21, -0.084], [0.165, -0.161], [0.072, -0.24], [0.114, -0.158], [0.155, -0.088],
]);
const pectoral = fin([0.175, -0.031], [0.15, -0.025], [
  [0.18, -0.056], [0.105, -0.122], [0.048, -0.123], [0.027, -0.083], [0.092, -0.050],
]);

export const fins = [tail, dorsal, anal].map((spec) => fin(...spec));
export const distantFins = [tail, dorsal, anal].map((spec) => fin(...spec, 18, 6));
export const pairedFins = [ventral, pectoral];
export const eyeball = new SphereGeometry(1, 16, 10);

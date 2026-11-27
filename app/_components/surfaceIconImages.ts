import { BufferGeometry, Float32BufferAttribute } from "three";

/** The icon pictures in /public/surface-icons (white background cut away, outlines kept). */
export const ICON_IMAGES = {
  happy: [109, 109],
  heart: [113, 105],
  laugh: [109, 109],
  mad: [109, 109],
  message: [426, 124],
  person: [78, 120],
  sad: [110, 109],
  serious: [109, 110],
  share: [133, 134],
} as const;

export type SurfaceIconKind = keyof typeof ICON_IMAGES;
export const ICON_KINDS = Object.keys(ICON_IMAGES) as SurfaceIconKind[];

export const iconAspect = (kind: SurfaceIconKind) => ICON_IMAGES[kind][0] / ICON_IMAGES[kind][1];
export const iconUrl = (kind: SurfaceIconKind) => `/surface-icons/${kind}.png`;

const LAYERS = 7;
/** Panel thickness relative to the icon's height. */
const THICKNESS = 0.1;

/**
 * The picture stacked a few times through a thin depth, back to front, so it
 * reads as a cut-out panel with an edge. 1 unit tall, centred on the origin;
 * `layer` is 1 on the front face and below 1 for the edge layers behind it.
 */
export function iconGeometry(kind: SurfaceIconKind) {
  const w = iconAspect(kind) / 2;
  const position: number[] = [];
  const uv: number[] = [];
  const layer: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < LAYERS; i++) {
    const t = i / (LAYERS - 1);
    const z = (t - 0.5) * THICKNESS;
    const base = i * 4;
    position.push(-w, -0.5, z, w, -0.5, z, w, 0.5, z, -w, 0.5, z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    layer.push(t, t, t, t);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setAttribute("layer", new Float32BufferAttribute(layer, 1));
  geometry.setIndex(index);
  return geometry;
}

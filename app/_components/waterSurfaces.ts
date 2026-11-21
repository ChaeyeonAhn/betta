// The bed and the underside of the surface are intersected in world space.
// Every colour, ripple and etched line is generated from these height fields.
export const waterSurfaces = /* glsl */ `
  float wsHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float wsNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wsHash(i), wsHash(i + vec2(1.0, 0.0)), u.x),
               mix(wsHash(i + vec2(0.0, 1.0)), wsHash(i + vec2(1.0)), u.x), u.y);
  }

  float wsFbm(vec2 p) {
    float value = 0.55 * wsNoise(p);
    p = mat2(1.72, -1.13, 1.13, 1.72) * p + 7.31;
    value += 0.27 * wsNoise(p);
    p = mat2(1.72, -1.13, 1.13, 1.72) * p + 3.17;
    return value + 0.13 * wsNoise(p);
  }

  float wsBed(vec2 p) {
    vec2 broad = p * vec2(0.58, 0.94);
    float turn = wsNoise(broad * 0.61) * 4.4;
    float swale = sin(p.y * 2.85 + p.x * 0.83 + turn);
    float shoulder = sin(p.y * 4.6 - p.x * 0.42 + turn * 0.73);
    return -1.15 + 0.145 * swale + 0.055 * shoulder
           + 0.12 * (wsFbm(p * vec2(0.85, 1.25)) - 0.45);
  }

  float wsRoof(vec2 p, float t, vec2 travel) {
    vec2 q = p + travel * 0.035;
    float warp = wsNoise(q * 0.65 + vec2(t * 0.045, -t * 0.033));
    float a = sin(q.x * 3.6 + q.y * 4.4 - t * 0.73 + warp * 2.4);
    float b = sin(q.x * 8.3 - q.y * 2.9 + t * 0.96 + warp);
    float c = sin(q.x * 17.7 + q.y * 13.2 - t * 1.10 + a * 0.7);
    float d = sin(q.x * 33.0 - q.y * 41.0 + t * 1.17 + b * 0.38);
    return 1.05 + 0.052 * a + 0.026 * b + 0.013 * c + 0.005 * d;
  }

  // The line width follows the pixel footprint before distant strokes merge.
  float wsLine(float phase, float width) {
    float band = abs(fract(phase) - 0.5);
    float footprint = max(0.002, fwidth(phase));
    return (1.0 - smoothstep(width, width + footprint, band))
           * (1.0 - smoothstep(0.20, 0.65, footprint));
  }

  vec3 wsFloorInk(vec3 hit, vec3 ray, float distance, float t, vec2 flow, vec2 travel) {
    vec2 p = hit.xz;
    float epsilon = 0.023;
    float height = wsBed(p);
    vec2 slope = vec2(wsBed(p + vec2(epsilon, 0.0)) - height,
                      wsBed(p + vec2(0.0, epsilon)) - height) / epsilon;
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 light = normalize(vec3(0.68, 0.63, 0.31));
    float diffuse = max(0.0, dot(normal, light));
    float occlusion = clamp((height - wsBed(p + vec2(0.19, 0.11))) * 3.0 + 0.72, 0.35, 1.0);
    float mound = smoothstep(-0.105, 0.17, height + 1.15);
    float wash = diffuse * occlusion * (0.68 + mound * 0.32);
    // A diagonal wash is the bounced light below the upper-right opening.
    // Its shape is broad enough for normal shading to describe each mound.
    float path = (p.x - 0.9 - (p.y + 2.8) * 0.46) / 2.2;
    float pool = exp(-path * path) * (0.82 + 0.18 * sin(t * 0.37 + p.x * 0.9));
    vec3 ink = mix(vec3(0.025, 0.055, 0.115), vec3(0.190, 0.302, 0.425), wash);
    ink += vec3(0.15, 0.225, 0.30) * pool * wash;

    // Tightly spaced drypoint strokes bend around each physical swale.
    // They collect on its shoulder and dissolve in shadow or in the distance.
    // The cross-slope coordinate stays monotonic. Bending depends on x only,
    // so no point can turn into a closed contour or a wood-grain knot.
    float bend = wsNoise(vec2(p.x * 0.56, 17.7));
    float phase = (p.y + 0.17 * sin(p.x * 0.91 + bend * 1.1) + 0.11 * bend) * 36.0;
    float footprint = fwidth(phase);
    float trace = wsLine(phase, 0.052);
    float grain = wsNoise(p * vec2(14.0, 23.0));
    float dryInk = smoothstep(0.18, 0.68, grain) * (1.0 - smoothstep(0.23, 0.66, footprint));
    ink += vec3(0.17, 0.25, 0.31) * trace * dryInk * (0.08 + wash * 0.60);
    ink *= 0.94 + 0.06 * grain;

    // The light patch on the dune is driven by the actual surface ripple
    // normal above it. A changing refracted direction opens and closes light
    // on the mound's face instead of describing an additional drawn contour.
    vec2 above = p + vec2(0.92, 0.53);
    float roof = wsRoof(above, t, travel);
    vec2 roofSlope = vec2(wsRoof(above + vec2(0.028, 0.0), t, travel) - roof,
                          wsRoof(above + vec2(0.0, 0.028), t, travel) - roof) / 0.028;
    vec3 roofNormal = normalize(vec3(-roofSlope.x, 1.0, -roofSlope.y));
    vec3 refracted = refract(normalize(vec3(-0.43, -0.86, -0.24)), roofNormal, 0.75);
    float incidence = dot(normal, -refracted);
    float transmission = smoothstep(0.72, 0.98, incidence);
    float raised = smoothstep(-0.035, 0.13, height + 1.15);
    ink += vec3(0.12, 0.19, 0.25) * transmission * raised * pool * wash;

    // Focusing follows the curvature of the water along the incoming beam.
    // A compressed bundle of rays leaves a narrow pale runnel on the sand.
    // Sideways defocusing and the grain interrupt it before it can form a grid.
    vec2 beamStep = vec2(0.043, 0.024);
    float forwardRoof = wsRoof(above + beamStep, t, travel);
    float backwardRoof = wsRoof(above - beamStep, t, travel);
    float curvature = (forwardRoof + backwardRoof - 2.0 * roof) / dot(beamStep, beamStep);
    float compression = 1.0 - curvature * 0.19;
    float focusWidth = max(0.38, fwidth(compression));
    float focus = 1.0 - smoothstep(0.0, focusWidth * 2.6, abs(compression));
    float alongRidge = wsNoise(p * vec2(3.3, 15.5) + travel * 0.014);
    float shoulder = (1.0 - smoothstep(0.05, 0.25, abs(slope.y - 0.08)))
                     * smoothstep(-0.035, 0.10, height + 1.15);
    float breakup = smoothstep(0.30, 0.76, alongRidge + grain * 0.15);
    float near = 1.0 - smoothstep(3.0, 5.4, distance);
    float glint = focus * breakup * shoulder * diffuse * pool * near;
    ink += vec3(0.25, 0.33, 0.37) * glint;
    ink += vec3(0.045, 0.081, 0.112) * focus * transmission * shoulder * breakup * pool * near;

    vec2 sandUv = p * 112.0;
    float sandPixel = max(length(dFdx(sandUv)), length(dFdy(sandUv)));
    float sand = (wsNoise(sandUv) - 0.5) * (1.0 - smoothstep(0.35, 1.30, sandPixel));
    ink += vec3(0.025, 0.035, 0.044) * sand * (0.4 + wash + glint);
    return ink;
  }

  vec3 wsRoofInk(vec3 hit, vec3 ray, float distance, float t, vec2 travel) {
    vec2 p = hit.xz;
    float epsilon = 0.013;
    float height = wsRoof(p, t, travel);
    vec2 slope = vec2(wsRoof(p + vec2(epsilon, 0.0), t, travel) - height,
                      wsRoof(p + vec2(0.0, epsilon), t, travel) - height) / epsilon;
    float smallCreases = wsNoise(p * vec2(14.0, 22.0) + vec2(t * 0.071, -t * 0.051));
    float facetPhase = p.x * 17.8 - p.y * 23.0 + t * 0.63 + smallCreases * 1.1;
    float facetFilter = 1.0 - smoothstep(0.20, 0.70, fwidth(facetPhase));
    float fracture = wsLine(facetPhase, 0.11) * facetFilter;
    float ripple = wsNoise(p * vec2(6.2, 9.0) + vec2(t * 0.17, t * -0.09));
    vec2 toSource = (p - vec2(1.95, -2.24)) / vec2(0.67, 0.65);
    float core = exp(-dot(toSource, toSource) * 1.2);
    vec2 aroundSource = (p - vec2(1.95, -2.24)) / vec2(1.65, 1.2);
    float halo = exp(-dot(aroundSource, aroundSource));
    float glint = smoothstep(-0.12, 0.34, slope.x * 0.8 - slope.y * 0.63);
    float flecks = smoothstep(0.32, 0.69, smallCreases + slope.y * 0.38);
    float engraving = wsLine((p.y + height * 0.35 + 0.1 * sin(p.x * 1.7)) * 48.0, 0.045);
    vec3 ink = vec3(0.025, 0.055, 0.115);
    ink += vec3(0.045, 0.09, 0.15) * (0.20 + 0.80 * ripple);
    ink += vec3(0.15, 0.24, 0.33) * engraving * (0.18 + 0.45 * glint);
    ink += vec3(0.27, 0.41, 0.53) * halo * flecks * glint;
    ink += vec3(0.63, 0.77, 0.85) * halo * fracture * (0.18 + 0.82 * flecks) * glint;
    ink += vec3(1.15, 1.30, 1.32) * core * (0.27 + 0.73 * glint) * (0.23 + 0.77 * flecks);
    return ink;
  }

  vec3 waterInk(vec3 ray, float t, vec2 flow, vec2 travel, bool deepWater) {
    ray = normalize(ray);
    vec3 deep = vec3(0.018, 0.033, 0.080);
    float lightOffset = (ray.x - 0.40) / 0.35;
    float scatter = exp(-lightOffset * lightOffset) * smoothstep(-0.10, 0.55, ray.y);
    vec3 water = deep + vec3(0.009, 0.022, 0.040) * scatter;
    if (deepWater) {
      float remainingLight = smoothstep(-0.55, 0.20, ray.y);
      water = mix(vec3(0.003, 0.008, 0.019), deep, remainingLight);
      water += vec3(0.009, 0.022, 0.040) * scatter;
    }
    if (!deepWater && ray.y < -0.035) {
      float distance = -1.15 / ray.y;
      for (int i = 0; i < 4; i++) {
        vec3 hit = ray * distance;
        float correction = (wsBed(hit.xz) - hit.y) / min(-0.035, ray.y);
        distance = max(0.0, distance + clamp(correction, -0.4, 0.4));
      }
      vec3 hit = ray * distance;
      float visibility = exp(-distance * 0.19) * smoothstep(0.035, 0.19, -ray.y);
      return mix(water, wsFloorInk(hit, ray, distance, t, flow, travel), visibility);
    }
    if (ray.y > 0.035) {
      float distance = 1.05 / ray.y;
      for (int i = 0; i < 4; i++) {
        vec3 hit = ray * distance;
        float correction = (wsRoof(hit.xz, t, travel) - hit.y) / max(0.035, ray.y);
        distance = max(0.0, distance + clamp(correction, -0.3, 0.3));
      }
      vec3 hit = ray * distance;
      float visibility = exp(-distance * 0.20) * smoothstep(0.035, 0.19, ray.y);
      return mix(water, wsRoofInk(hit, ray, distance, t, travel), visibility);
    }
    return water;
  }
`;

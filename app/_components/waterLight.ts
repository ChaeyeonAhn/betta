// Procedural scattered moonlight for the underwater volume. The entry-point
// pattern is evaluated in world space, so a shaft keeps its shape through depth.
export const waterLight = /* glsl */ `
  float wlHash(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    h += dot(h, h.yzx + 33.33);
    return fract((h.x + h.y) * h.z);
  }

  float wlNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wlHash(i), wlHash(i + vec2(1., 0.)), u.x),
               mix(wlHash(i + vec2(0., 1.)), wlHash(i + 1.), u.x), u.y);
  }

  // Analytic closest approach between a camera ray and a refracted strand.
  // Localising integration around this crossing keeps fine shafts readable.
  float wlStrand(vec3 ray, vec3 source, vec3 direction, float width, float end) {
    float parallel = dot(ray, direction);
    float along = (dot(ray, source) - parallel * dot(direction, source))
                / max(.035, 1. - parallel * parallel);
    float down = parallel * along - dot(direction, source);
    vec3 separation = ray * along - source - direction * down;
    float radius = width * (1. + max(down, 0.) * .54);
    float soft = max(radius, length(fwidth(separation)) * .8);
    float profile = exp(-dot(separation, separation) / (soft * soft));
    float visible = smoothstep(-.035, .10, down) * (1. - smoothstep(end - .04, end + .10, along));
    float extinction = exp(-max(down, 0.) * 1.78 - max(along, 0.) * .12);
    return profile * visible * extinction;
  }

  vec3 waterScattering(vec3 ray, float t, vec2 flow, vec2 travel, bool deepWater) {
    ray = normalize(ray);
    vec3 source = vec3(1.95, 1.05, -2.24);
    source.xz += flow * vec2(.026, .012);
    float end = 10.;
    if (ray.y > .0001) end = min(end, 1.05 / ray.y);
    if (!deepWater && ray.y < -.0001) end = min(end, -1.15 / ray.y);

    vec3 center = normalize(vec3(-.43 + flow.x * .018, -.86, -.24));
    float broad = wlStrand(ray, source, center, .42, end);
    float penumbra = wlStrand(ray, source, center, .73, end);
    float shafts = 0.;
    for (int i = 0; i < 14; i++) {
      float id = float(i);
      vec2 random = vec2(wlHash(vec2(id + 5., 9.7)), wlHash(vec2(id + 8., 13.3)));
      vec3 entry = source;
      entry.xz += (random - .5) * vec2(.89, .55);
      vec3 direction = normalize(center + vec3((random.x - .5) * .33, 0., (random.y - .5) * .16));
      float aperture = wlNoise(vec2(id * 7.3 + travel.x * .003, t * .17 + random.y * 5.));
      float width = mix(.010, .043, random.x * random.x);
      float rayWash = wlStrand(ray, entry, direction, width, end);
      shafts += rayWash * (.34 + .66 * aperture) * mix(.16, .44, random.y);
    }

    // The bright mouth of the light well feathers into a coherent blue wash.
    vec3 sunRay = normalize(source);
    vec2 aperture = ray.xy / -ray.z - sunRay.xy / -sunRay.z;
    float mouth = exp(-dot(aperture / vec2(.19, .074), aperture / vec2(.19, .074)));
    float shimmer = wlNoise(aperture * vec2(47., 19.) + vec2(t * .10, t * .027));
    vec3 radiance = vec3(.23,.40,.62) * (broad * .12 + penumbra * .031)
                  + vec3(.52,.68,.84) * shafts
                  + vec3(.49,.66,.84) * mouth * (.035 + .065 * shimmer);
    vec3 grainPoint = ray * 4.1 + vec3(.021 * t, .009 * t, 0.);
    float ink = wlNoise(grainPoint.xy * 174. + grainPoint.z * 13.);
    radiance *= .82 + .32 * ink;
    return radiance * (deepWater ? smoothstep(-.50, .18, ray.y) : 1.);
  }
`;

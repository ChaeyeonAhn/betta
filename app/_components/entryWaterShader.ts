import { waterSurfaces } from "./waterSurfaces";
import { ENTRY_DIP, ENTRY_EYE, ENTRY_PITCH, ENTRY_RAY, glslFloat as f } from "./waterEntry";

export const entryWaterShader = /* glsl */ `
  uniform float waterTime;
  uniform float diveProgress;
  varying vec2 waterUv;

  ${waterSurfaces}

  float relativeHeight(vec3 point, float t) {
    return point.y - wsRoof(point.xz, t, vec2(0.0));
  }

  vec4 poolSurface(vec3 eye, vec3 ray, float t) {
    if (ray.y >= -0.02) return vec4(0.0);

    // Search only where the waves can exist, and stop at the far wall of the pool.
    float farWall = (-0.90 - eye.z) / ray.z;
    float first = max(0.0, (1.16 - eye.y) / ray.y);
    float last = min(farWall, (0.95 - eye.y) / ray.y);
    if (last <= first) return vec4(0.0);

    float farHeight = relativeHeight(eye + last * ray, t);
    float footprint = min(0.03, max(0.004, fwidth(farHeight)));
    float coverage = 1.0 - smoothstep(-footprint, footprint, farHeight);
    if (coverage <= 0.0) return vec4(0.0);

    for (int step = 0; step < 7; step++) {
      float middle = (first + last) * 0.5;
      float height = relativeHeight(eye + middle * ray, t);
      if (height > 0.0) first = middle;
      else last = middle;
    }
    vec3 hit = eye + (first + last) * 0.5 * ray;
    vec2 p = hit.xz;
    float epsilon = 0.038;
    vec2 slope = vec2(
      wsRoof(p + vec2(epsilon, 0.0), t, vec2(0.0)) - wsRoof(p - vec2(epsilon, 0.0), t, vec2(0.0)),
      wsRoof(p + vec2(0.0, epsilon), t, vec2(0.0)) - wsRoof(p - vec2(0.0, epsilon), t, vec2(0.0))
    ) / (2.0 * epsilon);
    vec3 normal = normalize(vec3(-slope.x * 0.48, 1.0, -slope.y * 0.48));

    // Sample the pale room in the reflected direction. Its broad ceiling panel
    // and right-hand light stretch into glints along the angled wave faces.
    vec3 reflected = reflect(ray, normal);
    vec3 light = normalize(vec3(0.60, 0.68, -0.46));
    float highlight = max(0.0, dot(reflected, light));
    float side = smoothstep(-0.7, 0.8, reflected.x);
    float ceiling = smoothstep(-0.10, 0.84, reflected.y);
    vec3 room = mix(vec3(0.38, 0.50, 0.60), vec3(0.89, 0.93, 0.94), ceiling * 0.67 + side * 0.18);
    float incidence = clamp(dot(-ray, normal), 0.0, 1.0);
    float fresnel = 0.025 + 0.975 * pow(1.0 - incidence, 5.0);
    vec3 transmitted = refract(ray, normal, 1.0 / 1.333);
    vec3 bedRay = normalize(vec3(transmitted.x, min(transmitted.y, -0.12), transmitted.z));
    vec3 through = wsFloorFrom(
      hit - vec3(0.0, 0.025, 0.0), bedRay, t, vec2(0.0), vec2(0.0), vec3(0.018, 0.033, 0.080)
    );
    vec3 water = mix(through * 0.76 + vec3(0.065, 0.095, 0.13), room, 0.25 + fresnel * 0.62);
    water += vec3(0.75, 0.81, 0.85) * (pow(highlight, 15.0) * 0.26 + pow(highlight, 45.0) * 0.44);
    return vec4(water, coverage);
  }

  void main() {
    vec3 ray = normalize(vec3((waterUv - 0.5) * vec2(${f(ENTRY_RAY[0])}, ${f(ENTRY_RAY[1])}), -1.0));
    float t = waterTime;
    if (diveProgress >= 1.0) {
      gl_FragColor = vec4(waterInk(ray, t, vec2(0.0), vec2(0.0), false), 1.0);
      return;
    }

    float move = smoothstep(0.0, 1.0, diveProgress);
    vec3 eye = mix(vec3(${ENTRY_EYE.map(f).join(", ")}), vec3(0.0), move);
    float pitch = mix(${f(ENTRY_PITCH)}, 0.0, move) - ${f(ENTRY_DIP)} * sin(3.14159 * move);
    float c = cos(pitch);
    float s = sin(pitch);
    ray.yz = mat2(c, s, -s, c) * ray.yz;

    // Select the medium a short distance in front of each pixel's ray. At the
    // waterline different parts of the lens cross at different moments.
    float relative = relativeHeight(eye + ray * 0.095, t);
    float immersion = 1.0 - smoothstep(-0.042, 0.025, relative);
    if (immersion <= 0.0) {
      gl_FragColor = poolSurface(eye, ray, t);
      return;
    }

    vec3 submergedEye = eye;
    submergedEye.y = min(eye.y, wsRoof(eye.xz, t, vec2(0.0)) - 0.015);
    vec3 underwater = wsWaterFrom(submergedEye, ray, t, vec2(0.0), vec2(0.0), false);
    if (immersion >= 1.0) {
      gl_FragColor = vec4(underwater, 1.0);
      return;
    }

    vec4 surface = poolSurface(eye, ray, t);
    float opacity = mix(surface.a, 1.0, immersion);
    float transmission = immersion / max(opacity, 0.001);
    // A thin refracted highlight passes across the lens at contact.
    float meniscus = (1.0 - smoothstep(0.0, 0.023, abs(relative))) * 0.20;
    vec3 contact = mix(surface.rgb, underwater, transmission) + vec3(0.48, 0.60, 0.66) * meniscus;
    gl_FragColor = vec4(contact, opacity);
  }
`;

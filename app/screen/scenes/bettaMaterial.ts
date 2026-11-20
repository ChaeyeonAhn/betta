import { Color, DoubleSide, MeshStandardMaterial, SRGBColorSpace, type Texture } from "three";

type MaterialStyle = {
  hue: number;
  saturation: number;
  finLength: number;
  pattern: number;
  seed: number;
  filler: boolean;
};

export function createBettaMaterial(atlas: Texture, style: MaterialStyle, fin: boolean) {
  const time = { value: 0 };
  const uniforms = {
    bettaTime: time,
    bettaAtlas: { value: atlas },
    bettaColor: { value: new Color().setHSL(style.hue, 0.58 + style.saturation * 0.29, 0.48, SRGBColorSpace) },
    bettaStrength: { value: 0.44 + style.saturation * 0.43 },
    bettaFinLength: { value: 0.72 + style.finLength * 0.4 },
    bettaFin: { value: Number(fin) },
    bettaPattern: { value: style.pattern },
    bettaSeed: { value: style.seed },
    bettaFiller: { value: Number(style.filler) },
  };
  const material = new MeshStandardMaterial({
    roughness: fin ? 0.54 : 0.37,
    metalness: style.filler ? 0 : 0.12,
    transparent: fin,
    depthWrite: !fin,
    side: fin ? DoubleSide : undefined,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        varying vec2 bettaUv;
        uniform float bettaTime;
        uniform float bettaFin;
        uniform float bettaFinLength;
      `)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        bettaUv = uv;
        // The base of each fin stays attached. A wave rolls toward the rim.
        float radius = bettaUv.y;
        float wave = bettaTime - radius * 4.8 + bettaUv.x * 2.1 + position.x * 2.0;
        #ifdef USE_INSTANCING
          wave += dot(instanceMatrix[3].xyz, vec3(0.025, 0.016, 0.013));
        #endif
        float flex = radius * radius * bettaFin;
        transformed.x += (bettaFinLength - 1.0) * radius * bettaFin * (position.x - 0.15);
        transformed.y += flex * (position.y * (bettaFinLength - 1.0) + sin(wave + 0.9) * 0.019);
        transformed.z += flex * (sin(wave) * 0.098 + sin(wave * 1.55 + 0.4) * 0.028);
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 bettaUv;
        uniform sampler2D bettaAtlas;
        uniform vec3 bettaColor;
        uniform float bettaStrength;
        uniform float bettaFin;
        uniform float bettaPattern;
        uniform float bettaSeed;
        uniform float bettaFiller;

        float bettaHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float bettaNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          vec2 t = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(bettaHash(cell), bettaHash(cell + vec2(1.0, 0.0)), t.x),
            mix(bettaHash(cell + vec2(0.0, 1.0)), bettaHash(cell + 1.0), t.x),
            t.y
          );
        }

        float markings(vec2 uv) {
          vec2 offset = vec2(bettaSeed * 19.0, bettaSeed * 7.0);
          float noise = bettaNoise(uv * vec2(6.0, 8.0) + offset);
          if (bettaPattern < 0.5) {
            return smoothstep(0.42, 0.53, noise + 0.14 * bettaNoise(uv * 18.0 + offset));
          }
          if (bettaPattern < 1.5) {
            float band = uv.y + (noise - 0.5) * 0.18;
            float finBand = smoothstep(0.23, 0.36, band) * (1.0 - smoothstep(0.62, 0.75, band));
            return mix(0.48 + 0.27 * noise, finBand, bettaFin);
          }
          float flecks = bettaNoise(uv * vec2(32.0, 28.0) + offset);
          return smoothstep(0.64, 0.79, flecks) * (0.48 + 0.60 * noise);
        }
      `)
      .replace("#include <map_fragment>", `
        // Left atlas tile wraps around the body. The right tile follows the fin rays.
        vec2 atlasUv = vec2(0.5 * bettaFin + 0.008 + bettaUv.x * 0.484, 0.02 + bettaUv.y * 0.96);
        vec3 atlasColor = texture2D(bettaAtlas, atlasUv).rgb;
        float mask = markings(bettaUv);
        vec3 pigment = atlasColor * (0.19 + 1.04 * bettaColor);
        vec3 albedo = mix(atlasColor, pigment, (0.14 + 0.86 * mask) * bettaStrength);
        float gill = exp(-900.0 * pow(abs(bettaUv.x - 0.77 + sin(bettaUv.y * 6.28) * 0.049), 2.0));
        albedo *= 1.0 - gill * (1.0 - bettaFin) * 0.18;
        float gray = dot(atlasColor, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= mix(albedo, vec3(gray * 0.135), bettaFiller);
        diffuseColor.a *= mix(1.0, 0.93 - smoothstep(0.13, 1.0, bettaUv.y) * 0.24, bettaFin);
      `)
      .replace("#include <opaque_fragment>", `
        outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))), bettaFiller);
        #include <opaque_fragment>
      `);
  };
  return { material, time };
}

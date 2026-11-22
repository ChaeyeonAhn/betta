import { Color, DoubleSide, MeshStandardMaterial, SRGBColorSpace, Vector4, type Texture } from "three";

/** Patches of other bettas' colour a body can carry (open stage, from swimming together). */
export const MAX_MARKS = 8;

/** A betta's body colour; also what it leaves on the bettas it swims with. */
export const bettaBodyColor = (hue: number, saturation: number, target = new Color()) =>
  target.setHSL(hue, 0.68 + saturation * 0.29, 0.51, SRGBColorSpace);

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
    bettaColor: { value: bettaBodyColor(style.hue, style.saturation) },
    /** Per mark: x = place along the body (0 tail … 1 nose), y = shift toward the back, z = how far it has come in (0 = none), w = size (1 = a fleck). */
    bettaMarks: { value: Array.from({ length: MAX_MARKS }, () => new Vector4()) },
    bettaMarkColors: { value: Array.from({ length: MAX_MARKS }, () => new Color()) },
    bettaAccent: { value: new Color().setHSL((style.hue + 0.58) % 1, 0.90, 0.52, SRGBColorSpace) },
    bettaStrength: { value: 0.44 + style.saturation * 0.43 },
    bettaFinLength: { value: 0.72 + style.finLength * 0.4 },
    bettaFin: { value: Number(fin) },
    bettaPattern: { value: style.pattern },
    bettaSeed: { value: style.seed },
    bettaFiller: { value: Number(style.filler) },
    /** Placeholders: seconds since the grid started filling; each instance fades in after its `fillerDelay`. */
    bettaElapsed: { value: 1e6 },
  };
  const material = new MeshStandardMaterial({
    roughness: 0.91,
    metalness: 0,
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
        uniform float bettaFiller;
        uniform float bettaElapsed;
        attribute float fillerDelay;
        varying float bettaFade;
      `)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        bettaUv = uv;
        bettaFade = bettaFiller > .5 ? clamp((bettaElapsed - fillerDelay) / 1.6, 0., 1.) : 1.;
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
        uniform vec3 bettaAccent;
        uniform float bettaStrength;
        uniform float bettaFin;
        uniform float bettaPattern;
        uniform float bettaSeed;
        uniform float bettaFiller;
        uniform vec4 bettaMarks[${MAX_MARKS}];
        uniform vec3 bettaMarkColors[${MAX_MARKS}];
        varying float bettaFade;

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
        float tooth = dot(atlasColor, vec3(0.28, 0.54, 0.18));
        vec2 uv = bettaUv;
        float wash = bettaNoise(uv * vec2(6., 3.) + bettaSeed * 17.);
        vec3 paper = mix(vec3(.80,.60,.53), vec3(1.,.90,.79), smoothstep(.15,.85,tooth));
        vec3 ink = vec3(.045,.008,.034) + bettaColor * .11;
        vec3 paint = mix(paper, bettaColor, bettaStrength * (.24 + .76 * mask));
        if (bettaFin > .5) {
          // UVs run from the fin root to its scalloped edge. Split the ribbons
          // along the rays so the printed marks bend with the membrane.
          float ribbon = uv.y + .18*sin(uv.x*14.+bettaSeed*7.) + .13*(wash-.5);
          paint = mix(paint, bettaColor, .82*smoothstep(.48,.54,ribbon));
          float fold = uv.x*16. + .62*sin(uv.y*3.4+uv.x*8.) + wash*.65;
          float streak = smoothstep(.63,.74,fract(fold*.39 + .24*sin(uv.y*6.))) * smoothstep(.43,.68,ribbon);
          paint = mix(paint, bettaAccent, streak * (.48+.48*mask));
          float line = abs(fract(fold)-.5);
          float aa = clamp(fwidth(fold), .012, .50);
          float ray = (1.-smoothstep(.018,.018+aa,line)) * (1.-smoothstep(.22,.49,aa));
          paint = mix(paint, ink, ray * (.48+.48*wash));
          paint = mix(paint, ink, .70*smoothstep(.974,1.,uv.y));
        } else {
          // Another betta's colour, a small ragged patch on both flanks
          // (the body's sides sit at v = .25 and .75; the back at .5).
          for (int i = 0; i < ${MAX_MARKS}; i++) {
            vec4 mark = bettaMarks[i];
            if (mark.z <= 0.) continue;
            float mx = (uv.x - mark.x) / (.09 * mark.w);
            float my = min(abs(uv.y - (.75 - mark.y)), abs(uv.y - (.25 + mark.y))) / (.12 * mark.w);
            float rag = (bettaNoise(uv * vec2(38., 30.) + float(i) * 5.3 + bettaSeed * 11.) - .5) * .6;
            float blob = 1. - smoothstep(.5, 1., length(vec2(mx, my)) + rag);
            paint = mix(paint, mix(paper, bettaMarkColors[i], .88), blob * mark.z);
          }
          vec2 scales = uv*vec2(21.,12.);
          scales.y += .5*mod(floor(scales.x),2.);
          vec2 local = fract(scales)-.5;
          float arc = abs(local.x-.19+local.y*local.y*1.9);
          float aa = max(.035, fwidth(scales.x));
          float stroke = (1.-smoothstep(.025,.025+aa,arc)) * (1.-smoothstep(.12,.48,aa));
          float gill = abs(uv.x-.77+.035*sin(uv.y*6.283));
          paint = mix(paint, ink, max(stroke*.53*(1.-smoothstep(.68,.84,uv.x)), .84*(1.-smoothstep(.005,.014,gill))));
        }
        diffuseColor.rgb *= mix(paint * (.86+.16*tooth), vec3(.027+.13*tooth), bettaFiller);
        diffuseColor.a *= mix(1., .97-.07*uv.y, bettaFin);
        if (bettaFade < .01) discard;
        diffuseColor.a *= bettaFade;
      `)
      .replace("#include <opaque_fragment>", `
        float contour = smoothstep(.06,.30,abs(normal.z));
        vec3 printed = diffuseColor.rgb * mix(.36, 1.04, contour);
        outgoingLight = mix(printed, outgoingLight, .16);
        outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(.2126,.7152,.0722))*.65), bettaFiller);
        #include <opaque_fragment>
      `);
  };
  return { material, time, uniforms };
}

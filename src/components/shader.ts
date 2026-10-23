export const vertexShader = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// One full-screen pass with two worlds in it, in the brand's black and gold.
// Night: molten gold smoke with the word DREAM melting inside it. Holding
// spreads "reality" outward from the press point: the same field, measured
// onto a gold network of nodes and lines, with the word set solid.
// Day: ivory stone, the page after waking.
export const fragmentShader = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uProgress;
uniform vec2 uPress;
uniform vec2 uPointer;
uniform float uDay;
uniform float uPulse;
uniform sampler2D uText;

out vec4 outColor;

const vec3 INK = vec3(0.043, 0.039, 0.031);
const vec3 BRONZE = vec3(0.290, 0.208, 0.063);
const vec3 GOLD = vec3(0.788, 0.635, 0.290);
const vec3 GOLD_HI = vec3(0.965, 0.871, 0.600);
const vec3 IVORY = vec3(0.949, 0.922, 0.867);

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);

float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    v += a * noise(p);
    p = ROT * p * 2.03 + 1.7;
    a *= 0.5;
  }
  return v;
}

// Domain-warped field (two levels of warp).
float field(vec2 p, float t, int octaves, out vec2 q, out vec2 r) {
  q = vec2(fbm(p + vec2(0.0, t), octaves), fbm(p + vec2(5.2, 1.3) - t, octaves));
  r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.7 * t, octaves),
           fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.5 * t, octaves));
  return fbm(p + 3.0 * r, octaves);
}

// Black → bronze → gold → pale gold, like light across brushed metal.
vec3 metal(float x) {
  vec3 c = mix(INK, BRONZE, smoothstep(0.0, 0.35, x));
  c = mix(c, GOLD, smoothstep(0.3, 0.7, x));
  return mix(c, GOLD_HI, smoothstep(0.72, 1.0, x));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = uTime * 0.05;

  vec2 press = (uPress - 0.5) * vec2(aspect, 1.0);
  vec2 pointer = (uPointer - 0.5) * vec2(aspect, 1.0);
  vec2 toPointer = p - pointer;
  float pull = exp(-dot(toPointer, toPointer) * 5.0);

  float ragged = (fbm(p * 3.0 + t * 4.0, 3) - 0.5) * 0.24;
  float dist = length(p - press) + ragged;
  float reach = length(vec2(aspect, 1.0)) + 0.4;

  vec3 night = INK;
  if (uDay < 0.999) {
    // Reality spreads from the press point.
    float radius = pow(uProgress, 1.3) * reach;
    float real = (1.0 - smoothstep(radius - 0.12, radius, dist)) * smoothstep(0.0, 0.03, uProgress);
    real = max(real, step(0.999, uProgress));
    float front = smoothstep(radius - 0.14, radius - 0.05, dist)
                * (1.0 - smoothstep(radius - 0.05, radius + 0.02, dist))
                * smoothstep(0.0, 0.03, uProgress) * (1.0 - smoothstep(0.97, 1.0, uProgress));

    // Dream: molten gold drifting through smoke.
    vec3 dream = INK;
    if (real < 0.999) {
      vec2 q, r;
      float f = field(p * 1.3 - toPointer * pull * 0.35, t, 4, q, r);
      float body = smoothstep(0.42, 0.95, f);
      float sheen = pow(1.0 - abs(sin(f * 10.0 + r.x * 5.0)), 10.0) * smoothstep(0.5, 0.85, f);
      dream = metal(body * 0.8) * (0.12 + 0.95 * body * body);
      dream += GOLD_HI * sheen * 0.35;
      dream = mix(dream, INK, smoothstep(0.6, 0.2, f) * 0.75);
    }

    // Reality: the same field, measured onto a network of nodes and lines.
    vec3 built = INK;
    if (real > 0.001) {
      float cells = 24.0;
      vec2 g = p * cells;
      vec2 vertex = floor(g + 0.5);
      vec2 cq, cr;
      float fv = field(vertex / cells * 1.3, t * 0.25, 3, cq, cr);
      float fl = field(p * 1.3, t * 0.25, 2, cq, cr);
      vec2 w = fwidth(g);
      vec2 dl = abs(fract(g + 0.5) - 0.5) / w;
      float diag = abs(fract(g.x - g.y + 0.5) - 0.5) / (w.x * 1.4);
      float lines = 1.0 - min(min(min(dl.x, dl.y), diag), 1.0);
      float nodeR = (0.04 + 0.16 * smoothstep(0.35, 0.8, fv)) * 1.0;
      float node = 1.0 - smoothstep(nodeR - w.x, nodeR + w.x, length(g - vertex));
      float lit = smoothstep(0.25, 0.75, fl);
      built = INK + metal(0.35 + 0.4 * fl) * 0.1;
      built = mix(built, metal(0.5 + 0.45 * lit), lines * (0.2 + 0.7 * lit));
      built = mix(built, GOLD_HI, node * (0.4 + 0.6 * smoothstep(0.35, 0.8, fv)));
    }

    night = mix(dream, built, real);

    // The logo: melted and out of focus in the dream, set solid where it's real.
    float dreaminess = 1.0 - real;
    vec2 warp = vec2(fbm(p * 2.6 + t * 3.0, 2), fbm(p * 2.6 + vec2(7.1, 3.3) - t * 3.0, 2)) - 0.5;
    vec2 tuv = uv + warp * 0.16 * dreaminess + toPointer * pull * 0.03 * dreaminess;
    float spread = dreaminess * 0.007;
    float mark = texture(uText, tuv, dreaminess * 0.8).a * 0.2;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + t * 2.0;
      mark += texture(uText, tuv + vec2(cos(a) / aspect, sin(a)) * spread, dreaminess * 0.8).a * 0.1;
    }
    // In the dream the mark glows as molten metal with a slow highlight
    // travelling across it; where it's real, it's the logo's own brushed gold.
    float sweep = pow(0.5 + 0.5 * sin((uv.x * 1.6 - uv.y * 2.4) * 3.14159 + uTime * 0.6), 6.0);
    vec3 molten = metal(0.62 + 0.3 * (uv.y - 0.4) * 2.5 + 0.35 * sweep);
    vec4 logo = texture(uText, uv);
    vec3 solid = logo.rgb + GOLD_HI * sweep * 0.18;
    vec3 markCol = mix(molten, solid, real);
    // A soft shadow behind the mark so it lifts off the molten field.
    float halo = texture(uText, tuv - vec2(0.0, 0.006), 5.0).a;
    night = mix(night, INK, clamp(halo * 1.8, 0.0, 1.0) * 0.65);
    night = mix(night, markCol, clamp(mark * mix(1.1, 1.0, real), 0.0, 1.0));

    night += front * GOLD_HI * 0.7;
    night += uPulse * 0.08 * GOLD;
    vec2 v = uv - 0.5;
    night *= 1.0 - 0.6 * dot(v, v) * dreaminess;
  }

  vec3 col = night;
  if (uDay > 0.001) {
    // Ivory stone with faint veining and the network lines just showing.
    float stone = fbm(p * 6.0, 3);
    vec3 day = IVORY * (0.955 + 0.07 * stone);
    day = mix(day, vec3(0.86, 0.80, 0.69), smoothstep(0.55, 0.85, fbm(p * 1.2 + vec2(t, -t), 3)) * 0.25);
    day = mix(day, GOLD_HI, smoothstep(0.6, 0.85, fbm(p * 0.9 - t * 0.6 + 4.0, 3)) * 0.18);
    vec2 g = p * 24.0;
    vec2 w = fwidth(g);
    vec2 dl = abs(fract(g + 0.5) - 0.5) / w;
    float diag = abs(fract(g.x - g.y + 0.5) - 0.5) / (w.x * 1.4);
    day = mix(day, GOLD, (1.0 - min(min(min(dl.x, dl.y), diag), 1.0)) * 0.07);
    day += uPulse * 0.03 * GOLD_HI;

    // Morning arrives from the same point the dream was woken from.
    float sunR = uDay * (reach + 0.5);
    float sun = (1.0 - smoothstep(sunR - 0.35, sunR, dist)) * smoothstep(0.0, 0.02, uDay);
    sun = max(sun, step(0.999, uDay));
    col = mix(night, day, sun);
  }

  col += (hash(gl_FragCoord.xy + floor(uTime * 24.0)) - 0.5) * 0.03;
  outColor = vec4(col, 1.0);
}
`;

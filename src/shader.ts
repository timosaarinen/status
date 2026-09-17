export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBeat;
  uniform float uSection;
  uniform vec2 uResolution;

  vec3 pal(float n) {
    n = mod(floor(n + 0.5), 16.0);
    if (n < 0.5) return vec3(0.000, 0.000, 0.000);
    if (n < 1.5) return vec3(1.000, 1.000, 1.000);
    if (n < 2.5) return vec3(0.506, 0.200, 0.220);
    if (n < 3.5) return vec3(0.459, 0.808, 0.784);
    if (n < 4.5) return vec3(0.557, 0.235, 0.592);
    if (n < 5.5) return vec3(0.337, 0.675, 0.302);
    if (n < 6.5) return vec3(0.180, 0.173, 0.608);
    if (n < 7.5) return vec3(0.929, 0.945, 0.443);
    if (n < 8.5) return vec3(0.557, 0.314, 0.161);
    if (n < 9.5) return vec3(0.333, 0.220, 0.000);
    if (n < 10.5) return vec3(0.769, 0.424, 0.443);
    if (n < 11.5) return vec3(0.290, 0.290, 0.290);
    if (n < 12.5) return vec3(0.482, 0.482, 0.482);
    if (n < 13.5) return vec3(0.663, 1.000, 0.624);
    if (n < 14.5) return vec3(0.439, 0.427, 0.922);
    return vec3(0.698, 0.698, 0.698);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }

  float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
  }

  float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
  }

  float scene(vec3 p) {
    float phase = mod(floor(uSection), 3.0);
    p.xz *= rot(uTime * 0.66);
    p.xy *= rot(uTime * 0.43);
    float box = sdBox(p, vec3(0.72));
    float torus = sdTorus(p, vec2(0.76, 0.24));
    float octa = sdOctahedron(p, 1.05);
    if (phase < 0.5) return box;
    if (phase < 1.5) return torus;
    return octa;
  }

  vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.012, 0.0);
    return normalize(vec3(
      scene(p + e.xyy) - scene(p - e.xyy),
      scene(p + e.yxy) - scene(p - e.yxy),
      scene(p + e.yyx) - scene(p - e.yyx)
    ));
  }

  vec3 objectLayer(vec2 uv) {
    vec3 ro = vec3(0.0, 0.0, 3.4);
    vec3 rd = normalize(vec3(uv, -1.8));
    float distanceTravelled = 0.0;
    float hit = 0.0;
    vec3 p = ro;
    for (int step = 0; step < 48; step += 1) {
      p = ro + rd * distanceTravelled;
      float distanceToSurface = scene(p);
      if (distanceToSurface < 0.012) {
        hit = 1.0;
        break;
      }
      distanceTravelled += distanceToSurface * 0.74;
      if (distanceTravelled > 6.0) break;
    }
    if (hit < 0.5) return vec3(0.0);
    vec3 n = normalAt(p);
    vec3 lightDirection = normalize(vec3(-0.7, 0.8, 1.2));
    float diffuse = max(0.0, dot(n, lightDirection));
    float rim = pow(1.0 - max(0.0, dot(n, -rd)), 2.2);
    float band = floor(diffuse * 5.0 + rim * 3.0 + uTime * 1.5);
    return pal(3.0 + band + uSection * 2.0);
  }

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.000001), 0.0, 1.0);
    return length(pa - ba * h);
  }

  vec3 starfield(vec2 uv) {
    // Classic 3D starfield: each star has a fixed X/Y and travels toward
    // the camera along Z. Perspective is the literal X/Z, Y/Z projection.
    const float nearZ = 0.28;
    const float farZ = 4.2;
    const float travelSpeed = 0.72;
    vec3 color = pal(6.0) * 0.055;

    for (int i = 0; i < 72; i += 1) {
      float fi = float(i);
      float seedX = hash21(vec2(fi + 11.0, 3.17));
      float seedY = hash21(vec2(fi + 53.0, 8.91));
      float seedZ = hash21(vec2(fi + 97.0, 1.73));

      // Wider X range compensates for the 16:10 display aspect. Stars are
      // deterministic; only Z changes with time.
      vec2 world = vec2(
        (seedX * 2.0 - 1.0) * 2.65,
        (seedY * 2.0 - 1.0) * 1.65
      );

      float zRange = farZ - nearZ;
      float z = nearZ + mod(seedZ * zRange - uTime * travelSpeed + zRange, zRange);
      float previousZ = min(farZ, z + 0.075 + (1.0 - z / farZ) * 0.10);

      vec2 projected = world / z;
      vec2 previousProjected = world / previousZ;

      float nearness = 1.0 - clamp((z - nearZ) / zRange, 0.0, 1.0);
      float radius = 0.006 + nearness * 0.014;
      float dotStar = 1.0 - smoothstep(radius, radius + 0.008, length(uv - projected));

      // A short radial tail appears only as stars get close. It is derived
      // from the same perspective projection, not a separate motion effect.
      float tailWidth = 0.0035 + nearness * 0.006;
      float tail = 1.0 - smoothstep(
        tailWidth,
        tailWidth + 0.006,
        sdSegment(uv, previousProjected, projected)
      );
      tail *= smoothstep(0.45, 0.95, nearness) * 0.62;

      float brightness = 0.30 + nearness * 0.85;
      vec3 starColor = nearness > 0.72 ? pal(1.0) : pal(14.0);
      color += starColor * max(dotStar, tail) * brightness;
    }

    // Music may brighten the stars, but never changes their trajectory.
    return color * (0.94 + uEnergy * 0.12);
  }

  vec3 copperBars(vec2 uv) {
    float y = uv.y;
    vec3 color = vec3(0.0);
    for (int i = 0; i < 4; i += 1) {
      float fi = float(i);
      float center = -0.58 + fi * 0.38 + sin(uTime * (0.72 + fi * 0.05) + fi * 1.7) * 0.12;
      float width = 0.026 + 0.006 * sin(uTime * 1.1 + fi);
      float stripe = 1.0 - smoothstep(width, width + 0.014, abs(y - center));
      float scan = floor((y - center) / max(width, 0.001) * 3.0);
      color += stripe * pal(8.0 + fi + scan + floor(uTime * 2.0));
    }
    return color;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = (frag * 2.0 - uResolution.xy) / uResolution.y;

    vec3 color = starfield(uv);
    color = max(color, copperBars(uv) * 0.82);

    vec3 objectColor = objectLayer(uv);
    color = max(color, objectColor * 0.92);

    float checker = mod(floor(frag.x) + floor(frag.y), 2.0);
    color *= 0.90 + checker * 0.10;

    float beatFlash = smoothstep(0.76, 1.0, uBeat) * 0.22;
    color += pal(1.0) * beatFlash;
    gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
  }
`;

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
  uniform float uBass;
  uniform float uSection;
  uniform float uTraceActive;
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

  float rand(inout vec2 state) {
    float value = hash21(state);
    state += vec2(17.17, 61.73) + value * 13.1;
    return value;
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

    // The oldschool background object now actually breathes with the bass drum.
    // Divide space by the scale, then scale the SDF distance back so marching
    // stays correct instead of merely distorting the surface.
    float bassPunch = pow(clamp(uBass, 0.0, 1.0), 1.25);
    float objectScale = 1.0 + bassPunch * 0.34;
    p /= objectScale;
    p.xz *= rot(uTime * 0.66);
    p.xy *= rot(uTime * 0.43);
    float box = sdBox(p, vec3(0.72));
    float torus = sdTorus(p, vec2(0.76, 0.24));
    float octa = sdOctahedron(p, 1.05);
    float distanceToObject = phase < 0.5 ? box : (phase < 1.5 ? torus : octa);
    return distanceToObject * objectScale;
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
    const float nearZ = 0.28;
    const float farZ = 4.2;
    const float travelSpeed = 0.72;
    vec3 color = pal(6.0) * 0.055;

    for (int i = 0; i < 72; i += 1) {
      float fi = float(i);
      float seedX = hash21(vec2(fi + 11.0, 3.17));
      float seedY = hash21(vec2(fi + 53.0, 8.91));
      float seedZ = hash21(vec2(fi + 97.0, 1.73));
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

    return color * (0.94 + uEnergy * 0.12);
  }

  vec3 copperBars(vec2 uv) {
    float beat = clamp(uBeat, 0.0, 1.0);
    float punch = pow(smoothstep(0.08, 0.96, beat), 0.58);
    float hot = smoothstep(0.76, 1.0, beat);
    float lineY = floor(gl_FragCoord.y) / uResolution.y;
    vec3 color = vec3(0.0);

    for (int i = 0; i < 6; i += 1) {
      float fi = float(i);
      float phase = mod(uTime * (0.22 + fi * 0.008) + fi * 0.31, 2.0);
      float travel = 1.0 - abs(phase - 1.0);
      float center = mix(-1.08, 1.08, travel);
      float halfLines = 1.3 + mod(fi, 2.0) * 0.8 + punch * (2.8 + fi * 0.24);
      float distanceLines = abs((uv.y - center) * uResolution.y * 0.5);
      float body = 1.0 - step(halfLines + 0.5, distanceLines);
      if (body < 0.5) continue;

      float signedLine = floor((uv.y - center) * uResolution.y * 0.5);
      float band = abs(signedLine);
      float paletteKick = floor(punch * 7.0);
      float paletteIndex = 8.0 + fi * 1.7 + band + floor(uTime * 1.5) + paletteKick;
      vec3 stripeColor = pal(paletteIndex);
      float scan = mod(floor(lineY * uResolution.y) + fi, 2.0);
      stripeColor *= 0.72 + scan * 0.28;
      float core = 1.0 - step(0.55, band);
      stripeColor = mix(stripeColor, pal(1.0), core * hot);
      color = max(color, stripeColor * (0.72 + punch * 0.55));
      float echoDistance = abs(distanceLines - (halfLines + 1.5 + punch * 1.8));
      float echo = (1.0 - step(0.65, echoDistance)) * hot;
      color = max(color, pal(14.0 + fi) * echo * 0.82);
    }

    float flashLine = 1.0 - step(0.5, abs(gl_FragCoord.y - mod(floor(uTime * 50.0), uResolution.y)));
    color = max(color, pal(1.0) * flashLine * smoothstep(0.90, 1.0, beat));
    return min(color, vec3(1.0));
  }

  float sphereHit(vec3 ro, vec3 rd, vec3 center, float radius) {
    vec3 oc = ro - center;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return -1.0;
    h = sqrt(h);
    float nearHit = -b - h;
    float farHit = -b + h;
    if (nearHit > 0.002) return nearHit;
    if (farHit > 0.002) return farHit;
    return -1.0;
  }

  bool traceScene(
    vec3 ro,
    vec3 rd,
    out vec3 hitPosition,
    out vec3 hitNormal,
    out vec3 albedo,
    out vec3 emission,
    out float metallic
  ) {
    float bestT = 100000.0;
    bool found = false;
    vec3 bestNormal = vec3(0.0, 1.0, 0.0);
    vec3 bestAlbedo = vec3(0.7);
    vec3 bestEmission = vec3(0.0);
    float bestMetallic = 0.0;

    float pulse = 1.0 + pow(clamp(uBass, 0.0, 1.0), 1.35) * 0.10;

    vec3 c0 = vec3(-0.62, -0.25, 0.12);
    float r0 = 0.58 * pulse;
    float t0 = sphereHit(ro, rd, c0, r0);
    if (t0 > 0.0 && t0 < bestT) {
      bestT = t0;
      vec3 p0 = ro + rd * t0;
      bestNormal = normalize(p0 - c0);
      bestAlbedo = vec3(0.88, 0.92, 1.0);
      bestEmission = vec3(0.0);
      bestMetallic = 1.0;
      found = true;
    }

    vec3 c1 = vec3(0.72, -0.42, -0.18);
    float r1 = 0.40;
    float t1 = sphereHit(ro, rd, c1, r1);
    if (t1 > 0.0 && t1 < bestT) {
      bestT = t1;
      vec3 p1 = ro + rd * t1;
      bestNormal = normalize(p1 - c1);
      bestAlbedo = vec3(0.18, 0.78, 0.74);
      bestEmission = vec3(0.0);
      bestMetallic = 0.0;
      found = true;
    }

    vec3 c2 = vec3(0.18, 1.72, -0.45);
    float r2 = 0.72;
    float t2 = sphereHit(ro, rd, c2, r2);
    if (t2 > 0.0 && t2 < bestT) {
      bestT = t2;
      vec3 p2 = ro + rd * t2;
      bestNormal = normalize(p2 - c2);
      bestAlbedo = vec3(1.0);
      bestEmission = vec3(4.0, 2.2, 0.65);
      bestMetallic = 0.0;
      found = true;
    }

    if (abs(rd.y) > 0.0001) {
      float floorT = (-0.86 - ro.y) / rd.y;
      if (floorT > 0.002 && floorT < bestT) {
        bestT = floorT;
        vec3 floorP = ro + rd * floorT;
        float checker = mod(floor(floorP.x * 2.0) + floor(floorP.z * 2.0), 2.0);
        bestNormal = vec3(0.0, 1.0, 0.0);
        bestAlbedo = mix(vec3(0.09, 0.08, 0.16), vec3(0.52, 0.18, 0.56), checker);
        bestEmission = vec3(0.0);
        bestMetallic = 0.0;
        found = true;
      }
    }

    if (abs(rd.z) > 0.0001) {
      float wallT = (-2.25 - ro.z) / rd.z;
      if (wallT > 0.002 && wallT < bestT) {
        bestT = wallT;
        bestNormal = vec3(0.0, 0.0, 1.0);
        bestAlbedo = vec3(0.08, 0.09, 0.22);
        bestEmission = vec3(0.0);
        bestMetallic = 0.0;
        found = true;
      }
    }

    if (!found) return false;
    hitPosition = ro + rd * bestT;
    hitNormal = bestNormal;
    albedo = bestAlbedo;
    emission = bestEmission;
    metallic = bestMetallic;
    return true;
  }

  vec3 cosineHemisphere(vec3 n, inout vec2 seed) {
    float u = rand(seed);
    float v = rand(seed);
    float angle = 6.28318530718 * u;
    float radius = sqrt(v);
    float x = cos(angle) * radius;
    float y = sin(angle) * radius;
    float z = sqrt(max(0.0, 1.0 - v));
    vec3 helper = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(helper, n));
    vec3 bitangent = cross(n, tangent);
    return normalize(tangent * x + bitangent * y + n * z);
  }

  vec3 pathTrace(vec3 ro, vec3 rd, inout vec2 seed) {
    vec3 radiance = vec3(0.0);
    vec3 throughput = vec3(1.0);

    for (int bounce = 0; bounce < 3; bounce += 1) {
      vec3 hitPosition;
      vec3 hitNormal;
      vec3 albedo;
      vec3 emission;
      float metallic;
      if (!traceScene(ro, rd, hitPosition, hitNormal, albedo, emission, metallic)) {
        float skyMix = 0.5 + 0.5 * rd.y;
        vec3 sky = mix(vec3(0.015, 0.018, 0.055), vec3(0.28, 0.34, 0.72), skyMix);
        radiance += throughput * sky;
        break;
      }

      radiance += throughput * emission;
      throughput *= albedo;
      ro = hitPosition + hitNormal * 0.008;

      if (metallic > 0.5) {
        vec3 perfect = reflect(rd, hitNormal);
        vec3 rough = cosineHemisphere(hitNormal, seed);
        rd = normalize(mix(perfect, rough, 0.055));
      } else {
        rd = cosineHemisphere(hitNormal, seed);
      }
    }

    return radiance;
  }

  vec3 nearestC64(vec3 color) {
    vec3 best = pal(0.0);
    float bestDistance = 1000.0;
    for (int i = 0; i < 16; i += 1) {
      vec3 candidate = pal(float(i));
      vec3 delta = color - candidate;
      float distanceSquared = dot(delta, delta);
      if (distanceSquared < bestDistance) {
        bestDistance = distanceSquared;
        best = candidate;
      }
    }
    return best;
  }

  float bayer4(vec2 p) {
    float x = mod(floor(p.x), 4.0);
    float y = mod(floor(p.y), 4.0);
    float index = x + y * 4.0;
    if (index < 0.5) return 0.0;
    if (index < 1.5) return 8.0;
    if (index < 2.5) return 2.0;
    if (index < 3.5) return 10.0;
    if (index < 4.5) return 12.0;
    if (index < 5.5) return 4.0;
    if (index < 6.5) return 14.0;
    if (index < 7.5) return 6.0;
    if (index < 8.5) return 3.0;
    if (index < 9.5) return 11.0;
    if (index < 10.5) return 1.0;
    if (index < 11.5) return 9.0;
    if (index < 12.5) return 15.0;
    if (index < 13.5) return 7.0;
    if (index < 14.5) return 13.0;
    return 5.0;
  }

  vec3 pathTracer64(vec2 uv) {
    vec3 sum = vec3(0.0);
    float frameSeed = floor(uTime * 50.0);
    vec3 roBase = vec3(sin(uTime * 0.10) * 0.13, 0.08, 3.25);

    for (int sampleIndex = 0; sampleIndex < 4; sampleIndex += 1) {
      vec2 seed = gl_FragCoord.xy + vec2(frameSeed * 0.71, float(sampleIndex) * 83.17 + frameSeed * 1.37);
      vec2 jitter = (vec2(rand(seed), rand(seed)) - 0.5) * (2.0 / uResolution.y);
      vec3 ro = roBase;
      vec3 rd = normalize(vec3(uv + jitter, -1.72));
      sum += pathTrace(ro, rd, seed);
    }

    vec3 color = sum * 0.25;
    color = color / (vec3(1.0) + color);
    color = pow(max(color, vec3(0.0)), vec3(0.45454545));

    // The renderer is modern; the output is absolutely not. Crush the traced
    // radiance back into the exact C64 palette with ordered 4x4 dithering.
    float dither = (bayer4(gl_FragCoord.xy) / 15.0 - 0.5) * 0.115;
    color = nearestC64(clamp(color + vec3(dither), 0.0, 1.0));

    float scanline = mod(floor(gl_FragCoord.y), 2.0);
    color *= 0.86 + scanline * 0.14;
    color += pal(1.0) * smoothstep(0.88, 1.0, uBeat) * 0.12;
    return min(color, vec3(1.0));
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = (frag * 2.0 - uResolution.xy) / uResolution.y;

    if (uTraceActive > 0.5) {
      gl_FragColor = vec4(pathTracer64(uv), 1.0);
      return;
    }

    vec3 color = starfield(uv);
    color = max(color, copperBars(uv));
    vec3 objectColor = objectLayer(uv);
    color = max(color, objectColor * 0.92);
    float checker = mod(floor(frag.x) + floor(frag.y), 2.0);
    color *= 0.90 + checker * 0.10;
    float beatFlash = smoothstep(0.76, 1.0, uBeat) * 0.22;
    color += pal(1.0) * beatFlash;
    gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
  }
`;

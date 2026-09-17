export const pathTrace2VertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const pathTrace2FragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBeat;
  uniform float uBass;
  uniform float uHigh;
  uniform vec2 uResolution;

  const float PART_START = 190.0;
  const float PART_DURATION = 26.0;

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

  vec3 catmullRom(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    return 0.5 * (
      2.0 * p1 +
      (-p0 + p2) * t +
      (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
      (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    );
  }

  vec3 cameraSpline(float progress) {
    vec3 p0 = vec3(-2.55, 0.18, 4.30);
    vec3 p1 = vec3(-1.70, 0.52, 3.15);
    vec3 p2 = vec3(-0.38, 0.08, 2.45);
    vec3 p3 = vec3(1.08, 0.68, 2.10);
    vec3 p4 = vec3(2.18, 0.18, 2.95);
    vec3 p5 = vec3(1.18, 0.76, 4.08);
    vec3 p6 = vec3(-0.92, 0.28, 3.52);

    float scaled = clamp(progress, 0.0, 0.9999) * 4.0;
    float segment = floor(scaled);
    float t = fract(scaled);
    if (segment < 0.5) return catmullRom(p0, p1, p2, p3, t);
    if (segment < 1.5) return catmullRom(p1, p2, p3, p4, t);
    if (segment < 2.5) return catmullRom(p2, p3, p4, p5, t);
    return catmullRom(p3, p4, p5, p6, t);
  }

  vec3 targetSpline(float progress, float localTime) {
    vec3 q0 = vec3(-0.30, -0.10, -0.10);
    vec3 q1 = vec3(0.20, 0.10, -0.45);
    vec3 q2 = vec3(0.45, -0.08, -0.75);
    vec3 q3 = vec3(-0.05, 0.22, -0.35);
    vec3 q4 = vec3(-0.48, -0.02, -0.72);
    vec3 q5 = vec3(0.12, 0.12, -0.22);
    vec3 q6 = vec3(0.34, -0.06, -0.52);

    float scaled = clamp(progress, 0.0, 0.9999) * 4.0;
    float segment = floor(scaled);
    float t = fract(scaled);
    vec3 target;
    if (segment < 0.5) target = catmullRom(q0, q1, q2, q3, t);
    else if (segment < 1.5) target = catmullRom(q1, q2, q3, q4, t);
    else if (segment < 2.5) target = catmullRom(q2, q3, q4, q5, t);
    else target = catmullRom(q3, q4, q5, q6, t);

    target.y += pow(clamp(uBass, 0.0, 1.0), 1.2) * 0.10;
    target.x += sin(localTime * 0.47) * 0.05;
    return target;
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

    float t = max(0.0, uTime - PART_START);
    float bass = pow(clamp(uBass, 0.0, 1.0), 1.18);
    float beat = pow(clamp(uBeat, 0.0, 1.0), 0.62);
    float high = pow(clamp(uHigh, 0.0, 1.0), 0.80);

    // Chrome orb: wide figure-eight, with a very obvious kick-driven size pop.
    vec3 c0 = vec3(
      -0.48 + sin(t * 0.86) * 0.62,
      -0.24 + sin(t * 1.23 + 0.6) * 0.14 + bass * 0.18,
      -0.20 + sin(t * 0.43) * cos(t * 0.71) * 0.50
    );
    float r0 = 0.48 * (1.0 + bass * 0.34);
    float h0 = sphereHit(ro, rd, c0, r0);
    if (h0 > 0.0 && h0 < bestT) {
      bestT = h0;
      vec3 p = ro + rd * h0;
      bestNormal = normalize(p - c0);
      bestAlbedo = vec3(0.90, 0.94, 1.0);
      bestEmission = vec3(0.0);
      bestMetallic = 1.0;
      found = true;
    }

    // Cyan orb: counter-orbits and jumps on broad musical transients.
    vec3 c1 = vec3(
      0.54 + cos(t * 0.73 + 1.4) * 0.72,
      -0.43 + sin(t * 1.04 + 2.0) * 0.17 + beat * 0.19,
      -0.46 + sin(t * 0.61 + 0.3) * 0.61
    );
    float r1 = 0.35 * (1.0 + beat * 0.23);
    float h1 = sphereHit(ro, rd, c1, r1);
    if (h1 > 0.0 && h1 < bestT) {
      bestT = h1;
      vec3 p = ro + rd * h1;
      bestNormal = normalize(p - c1);
      bestAlbedo = vec3(0.12, 0.76, 0.72);
      bestEmission = vec3(0.0);
      bestMetallic = 0.0;
      found = true;
    }

    // Purple satellite: treble makes it flick and swell, adding a second
    // rhythmic layer that does not simply copy the kick drum.
    vec3 c3 = vec3(
      sin(t * 1.31 + 2.5) * 0.48,
      0.18 + cos(t * 1.77) * 0.22 + high * 0.12,
      -1.18 + cos(t * 0.93) * 0.38
    );
    float r3 = 0.22 * (1.0 + high * 0.38);
    float h3 = sphereHit(ro, rd, c3, r3);
    if (h3 > 0.0 && h3 < bestT) {
      bestT = h3;
      vec3 p = ro + rd * h3;
      bestNormal = normalize(p - c3);
      bestAlbedo = vec3(0.70, 0.20, 0.78);
      bestEmission = vec3(0.06, 0.0, 0.09) * high;
      bestMetallic = 0.0;
      found = true;
    }

    // Moving emissive orb: a musical light rig. Hits increase both its size
    // and radiance, so the lighting itself performs with the track.
    vec3 c2 = vec3(
      sin(t * 0.46) * 1.28,
      1.34 + sin(t * 0.79 + 0.7) * 0.27,
      -0.66 + cos(t * 0.52) * 0.72
    );
    float r2 = 0.34 + beat * 0.10;
    float h2 = sphereHit(ro, rd, c2, r2);
    if (h2 > 0.0 && h2 < bestT) {
      bestT = h2;
      vec3 p = ro + rd * h2;
      bestNormal = normalize(p - c2);
      bestAlbedo = vec3(1.0);
      float lightPunch = 1.0 + beat * 3.2 + high * 1.4 + uEnergy * 0.45;
      bestEmission = vec3(3.8, 1.65, 0.62) * lightPunch;
      bestMetallic = 0.0;
      found = true;
    }

    if (abs(rd.y) > 0.0001) {
      float floorT = (-0.92 - ro.y) / rd.y;
      if (floorT > 0.002 && floorT < bestT) {
        bestT = floorT;
        vec3 p = ro + rd * floorT;
        float checker = mod(floor(p.x * 2.0) + floor(p.z * 2.0), 2.0);
        float ripple = 0.5 + 0.5 * sin(length(p.xz) * 4.2 - t * 1.7);
        bestNormal = vec3(0.0, 1.0, 0.0);
        bestAlbedo = mix(
          vec3(0.055, 0.045, 0.115),
          vec3(0.52, 0.17, 0.56) * (0.80 + ripple * 0.20),
          checker
        );
        bestEmission = vec3(0.0);
        bestMetallic = 0.0;
        found = true;
      }
    }

    if (abs(rd.z) > 0.0001) {
      float wallT = (-2.85 - ro.z) / rd.z;
      if (wallT > 0.002 && wallT < bestT) {
        bestT = wallT;
        vec3 p = ro + rd * wallT;
        float bars = 0.5 + 0.5 * sin(p.x * 5.0 + t * 0.8 + bass * 2.0);
        bestNormal = vec3(0.0, 0.0, 1.0);
        bestAlbedo = mix(vec3(0.055, 0.065, 0.16), vec3(0.18, 0.08, 0.28), bars);
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
        vec3 sky = mix(vec3(0.012, 0.015, 0.050), vec3(0.25, 0.30, 0.67), skyMix);
        radiance += throughput * sky;
        break;
      }

      radiance += throughput * emission;
      throughput *= albedo;
      ro = hitPosition + hitNormal * 0.008;

      if (metallic > 0.5) {
        vec3 perfect = reflect(rd, hitNormal);
        vec3 rough = cosineHemisphere(hitNormal, seed);
        rd = normalize(mix(perfect, rough, 0.045 + uHigh * 0.025));
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

  vec3 renderPathTrace2(vec2 uv) {
    float localTime = max(0.0, uTime - PART_START);
    float progress = clamp(localTime / PART_DURATION, 0.0, 1.0);
    vec3 roBase = cameraSpline(progress);
    vec3 target = targetSpline(progress, localTime);
    vec3 forward = normalize(target - roBase);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = normalize(cross(right, forward));

    // Slow cinematic roll plus a tiny hit-driven kick. Still spline-driven,
    // but unmistakably a demo rather than a sober architectural camera.
    float roll = sin(localTime * 0.37) * 0.14 + uBeat * 0.045;
    float cr = cos(roll);
    float sr = sin(roll);
    vec3 rolledRight = right * cr + up * sr;
    vec3 rolledUp = up * cr - right * sr;

    vec3 sum = vec3(0.0);
    float frameSeed = floor(uTime * 50.0);
    for (int sampleIndex = 0; sampleIndex < 4; sampleIndex += 1) {
      vec2 seed = gl_FragCoord.xy + vec2(
        frameSeed * 0.713 + float(sampleIndex) * 31.7,
        float(sampleIndex) * 83.17 + frameSeed * 1.371
      );
      vec2 jitter = (vec2(rand(seed), rand(seed)) - 0.5) * (2.0 / uResolution.y);
      vec3 rd = normalize(
        forward * 1.72 +
        rolledRight * (uv.x + jitter.x) +
        rolledUp * (uv.y + jitter.y)
      );
      sum += pathTrace(roBase, rd, seed);
    }

    vec3 color = sum * 0.25;
    color += vec3(0.08, 0.025, 0.10) * pow(clamp(uBeat, 0.0, 1.0), 0.7);
    color = color / (vec3(1.0) + color);
    color = pow(max(color, vec3(0.0)), vec3(0.45454545));

    float dither = (bayer4(gl_FragCoord.xy) / 15.0 - 0.5) * 0.108;
    color = nearestC64(clamp(color + vec3(dither), 0.0, 1.0));

    float scanline = mod(floor(gl_FragCoord.y), 2.0);
    color *= 0.86 + scanline * 0.14;
    return color;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = (frag * 2.0 - uResolution.xy) / uResolution.y;
    vec3 color = renderPathTrace2(uv);
    gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
  }
`;

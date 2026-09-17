import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface AnalysisFrame {
  energy: number;
  beat: number;
  high: number;
  bass: number;
}

export function findRootMp3(root = process.cwd()): string {
  const files = readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".mp3"))
    .sort()
    .filter((name) => statSync(resolve(root, name)).isFile());

  if (files.length === 0) {
    throw new Error("No MP3 found. Put exactly one .mp3 file in the repository root.");
  }
  if (files.length > 1) {
    throw new Error(`Multiple MP3 files found: ${files.join(", ")}. Keep exactly one in the root.`);
  }
  return resolve(root, files[0]!);
}

export function probeDuration(audioPath: string): number {
  const result = Bun.spawnSync([
    "ffprobe", "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", audioPath
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr.toString()}`);
  }
  const duration = Number.parseFloat(result.stdout.toString().trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not determine MP3 duration.");
  return duration;
}

export async function decodeMono(audioPath: string, sampleRate = 22_050): Promise<Float32Array> {
  const process = Bun.spawn([
    "ffmpeg", "-v", "error", "-i", audioPath,
    "-f", "f32le", "-ac", "1", "-ar", String(sampleRate), "pipe:1"
  ], { stdout: "pipe", stderr: "pipe" });
  const [buffer, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited
  ]);
  if (exitCode !== 0) throw new Error(`ffmpeg audio decode failed: ${stderr}`);
  return new Float32Array(buffer);
}

export function analyseAudio(samples: Float32Array, sampleRate: number, fps: number): AnalysisFrame[] {
  const samplesPerFrame = sampleRate / fps;
  const frameCount = Math.ceil(samples.length / samplesPerFrame);
  const rawEnergy = new Float32Array(frameCount);
  const rawHigh = new Float32Array(frameCount);
  const rawBass = new Float32Array(frameCount);

  // One-pole low-pass around 180 Hz gives us a deterministic kick/bass envelope
  // for the headless renderer without needing an FFT dependency.
  const bassAlpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate);
  let bassLow = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = Math.floor(frame * samplesPerFrame);
    const end = Math.min(samples.length, Math.floor((frame + 1) * samplesPerFrame));
    let squares = 0;
    let high = 0;
    let bassSquares = 0;
    let previous = samples[start] ?? 0;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index] ?? 0;
      squares += sample * sample;
      high += Math.abs(sample - previous);
      bassLow += (sample - bassLow) * bassAlpha;
      bassSquares += bassLow * bassLow;
      previous = sample;
    }
    const length = Math.max(1, end - start);
    rawEnergy[frame] = Math.sqrt(squares / length);
    rawHigh[frame] = high / length;
    rawBass[frame] = Math.sqrt(bassSquares / length);
  }

  const sortedEnergy = Array.from(rawEnergy).sort((a, b) => a - b);
  const sortedHigh = Array.from(rawHigh).sort((a, b) => a - b);
  const sortedBass = Array.from(rawBass).sort((a, b) => a - b);
  const energyReference = sortedEnergy[Math.floor(sortedEnergy.length * 0.96)] || 1;
  const highReference = sortedHigh[Math.floor(sortedHigh.length * 0.96)] || 1;
  const bassReference = sortedBass[Math.floor(sortedBass.length * 0.94)] || 1;
  const frames: AnalysisFrame[] = [];
  let running = rawEnergy[0] ?? 0;
  let previous = running;
  let runningBass = rawBass[0] ?? 0;
  let previousBass = runningBass;
  let smoothedBass = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const current = rawEnergy[frame] ?? 0;
    running = running * 0.965 + current * 0.035;
    const onset = Math.max(0, current - Math.max(running * 1.22, previous * 0.92));
    const beat = Math.min(1, onset / Math.max(energyReference * 0.24, 0.0001));

    const currentBass = rawBass[frame] ?? 0;
    runningBass = runningBass * 0.94 + currentBass * 0.06;
    const bassLevel = Math.min(1, currentBass / bassReference);
    const bassOnset = Math.max(0, currentBass - Math.max(runningBass * 1.08, previousBass * 0.88));
    const bassPulse = Math.min(
      1,
      bassLevel * 0.18 + bassOnset / Math.max(bassReference * 0.12, 0.0001)
    );
    // Very fast attack, obvious release: this is for visible kick pumping, not
    // a pretty VU meter.
    smoothedBass = bassPulse > smoothedBass
      ? smoothedBass * 0.12 + bassPulse * 0.88
      : smoothedBass * 0.58 + bassPulse * 0.42;

    frames.push({
      energy: Math.min(1, current / energyReference),
      beat,
      high: Math.min(1, (rawHigh[frame] ?? 0) / highReference),
      bass: Math.min(1, smoothedBass)
    });
    previous = current;
    previousBass = currentBass;
  }
  return frames;
}

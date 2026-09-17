import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface AnalysisFrame {
  energy: number;
  beat: number;
  high: number;
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

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = Math.floor(frame * samplesPerFrame);
    const end = Math.min(samples.length, Math.floor((frame + 1) * samplesPerFrame));
    let squares = 0;
    let high = 0;
    let previous = samples[start] ?? 0;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index] ?? 0;
      squares += sample * sample;
      high += Math.abs(sample - previous);
      previous = sample;
    }
    const length = Math.max(1, end - start);
    rawEnergy[frame] = Math.sqrt(squares / length);
    rawHigh[frame] = high / length;
  }

  const sortedEnergy = Array.from(rawEnergy).sort((a, b) => a - b);
  const sortedHigh = Array.from(rawHigh).sort((a, b) => a - b);
  const energyReference = sortedEnergy[Math.floor(sortedEnergy.length * 0.96)] || 1;
  const highReference = sortedHigh[Math.floor(sortedHigh.length * 0.96)] || 1;
  const frames: AnalysisFrame[] = [];
  let running = rawEnergy[0] ?? 0;
  let previous = running;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const current = rawEnergy[frame] ?? 0;
    running = running * 0.965 + current * 0.035;
    const onset = Math.max(0, current - Math.max(running * 1.22, previous * 0.92));
    const beat = Math.min(1, onset / Math.max(energyReference * 0.24, 0.0001));
    frames.push({
      energy: Math.min(1, current / energyReference),
      beat,
      high: Math.min(1, (rawHigh[frame] ?? 0) / highReference)
    });
    previous = current;
  }
  return frames;
}

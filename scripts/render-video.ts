import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chromium } from "playwright";
import { C64_BOOT_END, C64_BOOT_KEY_TIMES, synthC64TypewriterClick } from "../src/boot";
import { analyseAudio, decodeMono, findRootMp3, probeDuration } from "./audio";

const FPS = 50;
const SAMPLE_RATE = 22_050;
const PORT = 4173;

interface Options {
  seconds?: number;
  output: string;
}

function parseOptions(args: string[]): Options {
  const options: Options = { output: resolve("output/status-cracktro.mp4") };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--seconds") options.seconds = Number(args[++index]);
    else if (args[index] === "--output") options.output = resolve(args[++index] ?? options.output);
  }
  return options;
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still booting.
    }
    await Bun.sleep(100);
  }
  throw new Error(`Vite did not become ready at ${url}`);
}

function assertTool(name: string): void {
  const result = Bun.spawnSync([name, "-version"], { stdout: "ignore", stderr: "ignore" });
  if (result.exitCode !== 0) throw new Error(`${name} is required but was not found in PATH.`);
}

function writePcmWav(path: string, samples: Float32Array, sampleRate: number): void {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    wav.writeInt16LE(Math.round(sample * 32767), 44 + index * bytesPerSample);
  }
  writeFileSync(path, wav);
}

function renderBootClickTrack(duration: number, path: string): void {
  const clickDuration = Math.min(duration, C64_BOOT_END + 0.2);
  const mix = new Float32Array(Math.max(1, Math.ceil(clickDuration * SAMPLE_RATE)));

  for (let keyIndex = 0; keyIndex < C64_BOOT_KEY_TIMES.length; keyIndex += 1) {
    const keyTime = C64_BOOT_KEY_TIMES[keyIndex] ?? Infinity;
    if (keyTime >= clickDuration) break;
    const click = synthC64TypewriterClick(SAMPLE_RATE, keyIndex % 4);
    const start = Math.floor(keyTime * SAMPLE_RATE);
    for (let sampleIndex = 0; sampleIndex < click.length; sampleIndex += 1) {
      const target = start + sampleIndex;
      if (target >= mix.length) break;
      mix[target] = (mix[target] ?? 0) + (click[sampleIndex] ?? 0);
    }
  }

  writePcmWav(path, mix, SAMPLE_RATE);
}

async function main(): Promise<void> {
  const options = parseOptions(Bun.argv.slice(2));
  assertTool("ffmpeg");
  assertTool("ffprobe");
  const audioPath = findRootMp3();
  const fullDuration = probeDuration(audioPath);
  const duration = options.seconds ? Math.min(fullDuration, options.seconds) : fullDuration;
  const frameCount = Math.ceil(duration * FPS);
  const outputDirectory = resolve(options.output, "..");
  const clickTrackPath = resolve(outputDirectory, ".status-c64-keyclicks.wav");
  mkdirSync(outputDirectory, { recursive: true });
  renderBootClickTrack(duration, clickTrackPath);

  console.log(`STATUS cracktro renderer`);
  console.log(`Audio: ${basename(audioPath)} (${fullDuration.toFixed(3)} s)`);
  console.log(`Video: ${frameCount} frames at ${FPS} fps -> ${options.output}`);
  console.log("Analysing music...");
  const samples = await decodeMono(audioPath, SAMPLE_RATE);
  const analysis = analyseAudio(samples, SAMPLE_RATE, FPS);

  const vite = Bun.spawn(["bunx", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
    stdout: "ignore",
    stderr: "inherit"
  });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let encoder: ReturnType<typeof Bun.spawn> | undefined;
  try {
    const url = `http://127.0.0.1:${PORT}/?render=1`;
    await waitForServer(url);
    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox",
        "--disable-dev-shm-usage"
      ]
    });
    const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__CRACKTRO_READY__ === true);

    encoder = Bun.spawn([
      "ffmpeg", "-y", "-v", "warning",
      "-framerate", String(FPS), "-f", "image2pipe", "-vcodec", "png", "-i", "pipe:0",
      "-i", audioPath,
      "-i", clickTrackPath,
      "-filter_complex", "[2:a]volume=1.25[clicks];[1:a][clicks]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.96[a]",
      "-map", "0:v:0", "-map", "[a]",
      "-vf", "scale=1600:1000:flags=neighbor,pad=1920:1080:160:40:black",
      "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart",
      options.output
    ], { stdin: "pipe", stdout: "inherit", stderr: "inherit" });
    const encoderInput = encoder.stdin;
    if (!encoderInput || typeof encoderInput === "number") {
      throw new Error("Could not open FFmpeg stdin pipe.");
    }

    const started = performance.now();
    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = frame / FPS;
      const audio = analysis[Math.min(frame, analysis.length - 1)] ?? { energy: 0, beat: 0, high: 0, bass: 0 };
      await page.evaluate(({ time, audio }) => window.renderFrame(time, audio), { time, audio });
      const png = await page.screenshot({ type: "png" });
      encoderInput.write(png);
      if (frame % FPS === 0 || frame === frameCount - 1) {
        const elapsed = (performance.now() - started) / 1000;
        const percent = ((frame + 1) / frameCount) * 100;
        process.stdout.write(`\r${percent.toFixed(1).padStart(5)}%  ${time.toFixed(1).padStart(6)}s  elapsed ${elapsed.toFixed(0)}s`);
      }
    }
    encoderInput.end();
    const exitCode = await encoder.exited;
    process.stdout.write("\n");
    if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}`);
    console.log(`Done: ${options.output}`);
  } finally {
    if (encoder && encoder.exitCode === null) encoder.kill();
    await browser?.close();
    vite.kill();
    await vite.exited;
    if (existsSync(clickTrackPath)) unlinkSync(clickTrackPath);
  }
}

await main();

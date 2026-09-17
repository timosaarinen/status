import { mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chromium } from "playwright";
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

async function main(): Promise<void> {
  const options = parseOptions(Bun.argv.slice(2));
  assertTool("ffmpeg");
  assertTool("ffprobe");
  const audioPath = findRootMp3();
  const fullDuration = probeDuration(audioPath);
  const duration = options.seconds ? Math.min(fullDuration, options.seconds) : fullDuration;
  const frameCount = Math.ceil(duration * FPS);
  mkdirSync(resolve(options.output, ".."), { recursive: true });

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
      "-map", "0:v:0", "-map", "1:a:0",
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
      const audio = analysis[Math.min(frame, analysis.length - 1)] ?? { energy: 0, beat: 0, high: 0 };
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
  }
}

await main();

import { C64_COLORS } from "./palette";

const PHOTO_WIDTH = 160;
const PHOTO_HEIGHT = 100;
const PHOTO_PART_START = 24;
const PHOTO_HOLD = 5;
const PHOTO_TRANSITION = 2;
const PHOTO_PART_END = PHOTO_PART_START + PHOTO_HOLD * 3 + PHOTO_TRANSITION * 2;

// User-supplied portraits, reduced to 160x100 and quantized to the repo's exact
// 16-colour C64 palette. The packed 4-bit pixels are deflate-compressed so the
// cracktro stays deterministic and self-contained without runtime asset fetches.
const PORTRAITS = [
  "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"
] as const;

const palette = C64_COLORS.map((hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff] as const;
});

let frames: HTMLCanvasElement[] = [];
let loadingStarted = false;

function base64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function decodePortrait(value: string): Promise<HTMLCanvasElement> {
  const compressed = base64Bytes(value);
  const input = new Blob([compressed]).stream();
  const output = input.pipeThrough(new DecompressionStream("deflate"));
  const packed = new Uint8Array(await new Response(output).arrayBuffer());
  const expected = (PHOTO_WIDTH * PHOTO_HEIGHT) / 2;
  if (packed.length !== expected) throw new Error(`Unexpected portrait payload size: ${packed.length}`);

  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_WIDTH;
  canvas.height = PHOTO_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Portrait canvas is unavailable");
  context.imageSmoothingEnabled = false;

  const image = context.createImageData(PHOTO_WIDTH, PHOTO_HEIGHT);
  for (let pixel = 0; pixel < PHOTO_WIDTH * PHOTO_HEIGHT; pixel += 1) {
    const packedByte = packed[pixel >> 1] ?? 0;
    const colorIndex = (pixel & 1) === 0 ? packedByte >> 4 : packedByte & 0x0f;
    const color = palette[colorIndex] ?? palette[0]!;
    const target = pixel * 4;
    image.data[target] = color[0];
    image.data[target + 1] = color[1];
    image.data[target + 2] = color[2];
    image.data[target + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function ensureLoaded(): void {
  if (loadingStarted) return;
  loadingStarted = true;
  void Promise.all(PORTRAITS.map(decodePortrait)).then((decoded) => {
    frames = decoded;
  });
}

function hash01(seed: number): number {
  const value = Math.sin(seed * 91.733 + 17.17) * 43758.5453;
  return value - Math.floor(value);
}

function pingPong(value: number): number {
  const phase = ((value % 2) + 2) % 2;
  return 1 - Math.abs(phase - 1);
}

function drawStill(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  beat: number
): void {
  const scale = 2 + beat * 0.08;
  const width = PHOTO_WIDTH * scale;
  const height = PHOTO_HEIGHT * scale;
  context.save();
  context.translate(160, 100);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawTiledRotozoom(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  scale: number,
  rotation: number,
  alpha: number
): void {
  context.save();
  context.globalAlpha = alpha;
  context.translate(160, 100);
  context.rotate(rotation);
  context.scale(scale * 2, scale * 2);
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      context.drawImage(image, x * PHOTO_WIDTH - PHOTO_WIDTH / 2, y * PHOTO_HEIGHT - PHOTO_HEIGHT / 2);
    }
  }
  context.restore();
}

function drawTransition(
  context: CanvasRenderingContext2D,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement,
  transitionIndex: number,
  progress: number,
  time: number,
  beat: number
): void {
  const direction = transitionIndex % 2 === 0 ? 1 : -1;
  const beatKick = beat * 0.22;
  drawTiledRotozoom(context, from, 1 + progress * 1.5 + beatKick, direction * progress * Math.PI * 1.35, 1 - progress * 0.72);
  drawTiledRotozoom(context, to, 0.18 + progress * 0.82 + beatKick * 0.35, -direction * (1 - progress) * Math.PI * 1.1, progress);

  // Deterministic pseudo-random flashes make the handoff feel like a classic
  // image-scramble effect. Music controls how hard the flashes hit.
  const tick = Math.floor(time * 16);
  const randomFrame = frames[Math.floor(hash01(tick + transitionIndex * 131) * frames.length)] ?? to;
  const randomAlpha = (hash01(tick * 1.91 + 7.3) > 0.68 ? 0.10 : 0) + beat * 0.24;
  if (randomAlpha > 0.02) {
    context.save();
    context.globalAlpha = Math.min(0.36, randomAlpha);
    const xJitter = Math.round((hash01(tick * 2.7) - 0.5) * 18);
    context.drawImage(randomFrame, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT, xJitter, 0, 320, 200);
    context.restore();
  }
}

function drawPhotoCopper(context: CanvasRenderingContext2D, time: number, beat: number): void {
  const colors = ["#8e5029", "#c46c71", "#edf171", "#ffffff", "#706deb", "#75cec8"] as const;
  const pulse = 1 + beat * 2.4;
  context.save();
  context.globalAlpha = Math.min(1, 0.58 + beat * 0.34);
  for (let index = 0; index < 6; index += 1) {
    const lane = index / 6;
    const y = Math.round(-6 + pingPong(time * (0.22 + index * 0.008) + lane * 2) * 212);
    const thickness = Math.max(1, Math.round((1 + (index & 1)) * pulse));
    context.fillStyle = colors[(index + Math.floor(beat * 5)) % colors.length] ?? "#ffffff";
    context.fillRect(0, y, 320, thickness);
  }
  context.restore();
}

export function drawPhotoPart(
  context: CanvasRenderingContext2D,
  time: number,
  energy: number,
  beat: number
): boolean {
  ensureLoaded();
  if (time < PHOTO_PART_START || time >= PHOTO_PART_END || frames.length !== 3) return false;

  const local = time - PHOTO_PART_START;
  let stillIndex = 0;
  let transitionIndex = -1;
  let transitionProgress = 0;

  if (local < PHOTO_HOLD) {
    stillIndex = 0;
  } else if (local < PHOTO_HOLD + PHOTO_TRANSITION) {
    transitionIndex = 0;
    transitionProgress = (local - PHOTO_HOLD) / PHOTO_TRANSITION;
  } else if (local < PHOTO_HOLD * 2 + PHOTO_TRANSITION) {
    stillIndex = 1;
  } else if (local < PHOTO_HOLD * 2 + PHOTO_TRANSITION * 2) {
    transitionIndex = 1;
    transitionProgress = (local - (PHOTO_HOLD * 2 + PHOTO_TRANSITION)) / PHOTO_TRANSITION;
  } else {
    stillIndex = 2;
  }

  context.save();
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, 320, 200);

  if (transitionIndex >= 0) {
    drawTransition(
      context,
      frames[transitionIndex]!,
      frames[transitionIndex + 1]!,
      transitionIndex,
      transitionProgress,
      time,
      beat
    );
  } else {
    drawStill(context, frames[stillIndex]!, beat);
  }

  if (energy > 0.72) {
    context.globalAlpha = Math.min(0.18, (energy - 0.72) * 0.6);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 320, 200);
    context.globalAlpha = 1;
  }

  drawPhotoCopper(context, time, beat);
  context.restore();
  return true;
}

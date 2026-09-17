export const C64_BOOT_TEXT = "PREPARING STATUS UPDATE FOR TIMO...";
export const C64_BOOT_START = 0.22;

const GLYPHS: Record<string, readonly number[]> = {
  " ": [0,0,0,0,0,0,0,0], ".": [0,0,0,0,0,24,24,0], "*": [0,102,60,255,60,102,0,0],
  "0": [60,102,110,118,102,102,60,0], "1": [24,56,24,24,24,24,126,0], "2": [60,102,6,12,24,48,126,0],
  "3": [60,102,6,28,6,102,60,0], "4": [12,28,44,76,126,12,12,0], "5": [126,96,124,6,6,102,60,0],
  "6": [28,48,96,124,102,102,60,0], "7": [126,102,6,12,24,24,24,0], "8": [60,102,102,60,102,102,60,0],
  "9": [60,102,102,62,6,12,56,0],
  "A": [24,60,102,102,126,102,102,0], "B": [124,102,102,124,102,102,124,0],
  "C": [60,102,96,96,96,102,60,0], "D": [120,108,102,102,102,108,120,0],
  "E": [126,96,96,124,96,96,126,0], "F": [126,96,96,124,96,96,96,0],
  "G": [60,102,96,110,102,102,60,0], "H": [102,102,102,126,102,102,102,0],
  "I": [60,24,24,24,24,24,60,0], "J": [30,12,12,12,12,108,56,0],
  "K": [102,108,120,112,120,108,102,0], "L": [96,96,96,96,96,96,126,0],
  "M": [99,119,127,107,99,99,99,0], "N": [102,118,126,126,110,102,102,0],
  "O": [60,102,102,102,102,102,60,0], "P": [124,102,102,124,96,96,96,0],
  "Q": [60,102,102,102,110,60,14,0], "R": [124,102,102,124,120,108,102,0],
  "S": [60,102,96,60,6,102,60,0], "T": [126,90,24,24,24,24,60,0],
  "U": [102,102,102,102,102,102,60,0], "V": [102,102,102,102,102,60,24,0],
  "W": [99,99,99,107,127,119,99,0], "X": [102,102,60,24,60,102,102,0],
  "Y": [102,102,102,60,24,24,60,0], "Z": [126,6,12,24,48,96,126,0]
};

function jitter(index: number): number {
  const value = Math.sin((index + 1) * 91.733) * 43758.5453;
  return value - Math.floor(value);
}

export function c64BootCharacterDelay(index: number, character: string): number {
  let delay = 0.045 + jitter(index) * 0.065;
  if (character === " ") delay += 0.055;
  if (character === ".") delay += 0.105;
  return delay;
}

export const C64_BOOT_KEY_TIMES: readonly number[] = (() => {
  const times: number[] = [];
  let time = C64_BOOT_START;
  for (let index = 0; index < C64_BOOT_TEXT.length; index += 1) {
    time += c64BootCharacterDelay(index, C64_BOOT_TEXT[index] ?? " ");
    times.push(time);
  }
  return times;
})();

export const C64_BOOT_END = (C64_BOOT_KEY_TIMES[C64_BOOT_KEY_TIMES.length - 1] ?? C64_BOOT_START) + 0.72;

export function c64BootVisibleCharacters(time: number): number {
  let visible = 0;
  while (visible < C64_BOOT_KEY_TIMES.length && time >= (C64_BOOT_KEY_TIMES[visible] ?? Infinity)) visible += 1;
  return visible;
}

export function drawC64Glyph(
  context: CanvasRenderingContext2D,
  character: string,
  x: number,
  y: number,
  color: string
): void {
  const rows = GLYPHS[character.toUpperCase()] ?? GLYPHS[" "]!;
  context.fillStyle = color;
  for (let row = 0; row < 8; row += 1) {
    const bits = rows[row] ?? 0;
    for (let column = 0; column < 8; column += 1) {
      if ((bits & (0x80 >> column)) !== 0) context.fillRect(x + column, y + row, 1, 1);
    }
  }
}

export function drawC64Text(
  context: CanvasRenderingContext2D,
  text: string,
  column: number,
  row: number,
  color: string
): void {
  for (let index = 0; index < text.length; index += 1) {
    drawC64Glyph(context, text[index] ?? " ", (column + index) * 8, row * 8, color);
  }
}

// Approximation of Compute!'s 1988 C64 Key Clicker "TYPEWRITER" patch:
// SID voice 2 data 0,255,0,0,128,19,0 and gate toggling 128/129 per key.
export function synthC64TypewriterClick(sampleRate: number, variation = 0): Float32Array {
  const duration = 0.085;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  const sidClock = 985_248;
  const frequencyWord = 65_280; // $FF00
  const noiseClock = (sidClock * frequencyWord) / 16_777_216;
  const samplesPerStep = sampleRate / noiseClock;
  let lfsr = (0x5a17d3 ^ ((variation + 1) * 0x1f123)) & 0x7fffff;
  let phase = 0;
  let held = 0;
  let previous = 0;

  for (let index = 0; index < samples.length; index += 1) {
    phase += 1;
    if (phase >= samplesPerStep) {
      phase -= samplesPerStep;
      const feedback = ((lfsr >> 22) ^ (lfsr >> 17)) & 1;
      lfsr = ((lfsr << 1) | feedback) & 0x7fffff;
      held = ((lfsr & 0xffff) / 32767.5) - 1;
    }

    const t = index / sampleRate;
    const attack = Math.min(1, t / 0.004);
    const decay = Math.max(0, 1 - Math.max(0, t - 0.004) / 0.066);
    const highPass = held - previous * 0.82;
    previous = held;
    samples[index] = highPass * attack * decay * 0.42;
  }
  return samples;
}

import { describe, expect, test } from "bun:test";
import { analyseAudio } from "../scripts/audio";

describe("audio analysis", () => {
  test("detects a transient deterministically", () => {
    const sampleRate = 1_000;
    const samples = new Float32Array(sampleRate * 2);
    for (let index = 1_000; index < 1_050; index += 1) samples[index] = 1;
    const frames = analyseAudio(samples, sampleRate, 50);
    expect(frames).toHaveLength(100);
    expect(Math.max(...frames.map((frame) => frame.beat))).toBeGreaterThan(0.5);
    expect(frames.every((frame) => frame.energy >= 0 && frame.energy <= 1)).toBe(true);
  });
});

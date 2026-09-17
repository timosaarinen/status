import "./style.css";
import { C64_BOOT_KEY_TIMES, synthC64TypewriterClick } from "./boot";
import { CracktroDemo, type AudioFrame, type RenderApi } from "./demo";

declare global {
  interface Window {
    __CRACKTRO_READY__: boolean;
    renderFrame: RenderApi["renderFrame"];
  }
}

const shaderCanvas = document.querySelector<HTMLCanvasElement>("#shader");
const screen = document.querySelector<HTMLCanvasElement>("#screen");
const playButton = document.querySelector<HTMLButtonElement>("#play");
const status = document.querySelector<HTMLSpanElement>("#status");

if (!shaderCanvas || !screen || !playButton || !status) {
  throw new Error("Cracktro DOM is incomplete");
}

const demo = new CracktroDemo(shaderCanvas, screen);
const params = new URLSearchParams(location.search);
const renderMode = params.has("render");

window.renderFrame = (time: number, audio: AudioFrame): void => {
  demo.renderFrame(time, audio);
};
window.__CRACKTRO_READY__ = true;
demo.renderFrame(0, { energy: 0, beat: 0, high: 0 });

if (renderMode) {
  document.body.classList.add("render-mode");
} else {
  let context: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let audio: HTMLAudioElement | undefined;
  let data: Uint8Array<ArrayBuffer> | undefined;
  let animationFrame = 0;
  let previousEnergy = 0;
  let playedBootClicks = 0;
  const clickBuffers: AudioBuffer[] = [];

  const ensureClickBuffers = (audioContext: AudioContext): void => {
    if (clickBuffers.length > 0) return;
    for (let variation = 0; variation < 4; variation += 1) {
      const samples = synthC64TypewriterClick(audioContext.sampleRate, variation);
      const buffer = audioContext.createBuffer(1, samples.length, audioContext.sampleRate);
      buffer.copyToChannel(samples, 0);
      clickBuffers.push(buffer);
    }
  };

  const playBootClick = (index: number): void => {
    if (!context) return;
    ensureClickBuffers(context);
    const source = context.createBufferSource();
    source.buffer = clickBuffers[index % clickBuffers.length] ?? null;
    const gain = context.createGain();
    gain.gain.value = 0.72;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
  };

  const frame = (): void => {
    if (!audio || !analyser || !data) return;
    analyser.getByteFrequencyData(data);
    let sum = 0;
    let high = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = (data[index] ?? 0) / 255;
      sum += value * value;
      if (index > data.length * 0.55) high += value;
    }
    const energy = Math.sqrt(sum / data.length);
    const beat = Math.max(0, energy - previousEnergy * 0.93) * 8;
    previousEnergy = previousEnergy * 0.72 + energy * 0.28;
    demo.renderFrame(audio.currentTime, {
      energy: Math.min(1, energy * 2.2),
      beat: Math.min(1, beat),
      high: Math.min(1, high / (data.length * 0.45) * 2)
    });

    while (
      playedBootClicks < C64_BOOT_KEY_TIMES.length &&
      audio.currentTime >= (C64_BOOT_KEY_TIMES[playedBootClicks] ?? Infinity)
    ) {
      playBootClick(playedBootClicks);
      playedBootClicks += 1;
    }

    status.textContent = `${audio.currentTime.toFixed(1)} / ${Number.isFinite(audio.duration) ? audio.duration.toFixed(1) : "..."}`;
    animationFrame = requestAnimationFrame(frame);
  };

  playButton.addEventListener("click", async () => {
    if (!audio) {
      status.textContent = "LOADING...";
      context = new AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      data = new Uint8Array(analyser.frequencyBinCount);
      audio = new Audio("/__audio.mp3");
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audio.addEventListener("ended", () => {
        cancelAnimationFrame(animationFrame);
        playButton.textContent = "RUN AGAIN";
        status.textContent = "NOT EVEN CLOSE.";
      });
    }

    if (audio.paused) {
      if (audio.ended) {
        audio.currentTime = 0;
        playedBootClicks = 0;
        previousEnergy = 0;
      }
      await context?.resume();
      await audio.play();
      playButton.textContent = "PAUSE";
      cancelAnimationFrame(animationFrame);
      frame();
    } else {
      audio.pause();
      playButton.textContent = "CONTINUE";
      cancelAnimationFrame(animationFrame);
    }
  });
}

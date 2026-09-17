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
const timeline = document.querySelector<HTMLInputElement>("#timeline");
const timecode = document.querySelector<HTMLSpanElement>("#timecode");
const status = document.querySelector<HTMLSpanElement>("#status");

if (!shaderCanvas || !screen || !playButton || !timeline || !timecode || !status) {
  throw new Error("Cracktro DOM is incomplete");
}

const demo = new CracktroDemo(shaderCanvas, screen);
const params = new URLSearchParams(location.search);
const renderMode = params.has("render");

window.renderFrame = (time: number, audio: AudioFrame): void => {
  demo.renderFrame(time, audio);
};
window.__CRACKTRO_READY__ = true;
demo.renderFrame(0, { energy: 0, beat: 0, high: 0, bass: 0 });

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "--:--.--";
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

if (renderMode) {
  document.body.classList.add("render-mode");
} else {
  let context: AudioContext | undefined;
  let analyser: AnalyserNode | undefined;
  let data: Uint8Array<ArrayBuffer> | undefined;
  let mediaSource: MediaElementAudioSourceNode | undefined;
  let animationFrame = 0;
  let previousEnergy = 0;
  let smoothedBass = 0;
  let playedBootClicks = 0;
  let suppressBeatFrames = 0;
  let scrubbing = false;
  let scrubTime: number | undefined;
  let committedSeekTime: number | undefined;
  let lastAudioFrame: AudioFrame = { energy: 0, beat: 0, high: 0, bass: 0 };
  const clickBuffers: AudioBuffer[] = [];

  // Load enough of the media for arbitrary seeking during development. The
  // AudioContext itself still waits for a user gesture, as required by browsers.
  const audio = new Audio("/__audio.mp3");
  audio.preload = "auto";

  const syncBootClickCursor = (time: number): void => {
    let count = 0;
    while (count < C64_BOOT_KEY_TIMES.length && time >= (C64_BOOT_KEY_TIMES[count] ?? Infinity)) count += 1;
    playedBootClicks = count;
  };

  const displayedTime = (): number => {
    if (scrubbing && scrubTime !== undefined) return scrubTime;
    if (committedSeekTime !== undefined) return committedSeekTime;
    return audio.currentTime;
  };

  const settleCommittedSeek = (): void => {
    if (committedSeekTime === undefined || audio.seeking) return;
    if (Math.abs(audio.currentTime - committedSeekTime) <= 0.35) {
      committedSeekTime = undefined;
    }
  };

  const updateTransport = (): void => {
    settleCommittedSeek();
    const duration = audio.duration;
    const shownTime = displayedTime();
    if (Number.isFinite(duration) && duration > 0) {
      timeline.disabled = false;
      timeline.max = String(duration);
      timeline.value = String(Math.max(0, Math.min(duration, shownTime)));
      timecode.textContent = `${formatTime(shownTime)} / ${formatTime(duration)}`;
    } else {
      timeline.disabled = true;
      timecode.textContent = `${formatTime(shownTime)} / --:--.--`;
    }
  };

  const renderScrubbedFrame = (targetTime: number): void => {
    demo.renderFrame(targetTime, {
      energy: lastAudioFrame.energy,
      beat: 0,
      high: lastAudioFrame.high,
      bass: lastAudioFrame.bass
    });
  };

  const timelineTarget = (): number | undefined => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return undefined;
    return Math.max(0, Math.min(audio.duration, Number(timeline.value)));
  };

  const previewTimeline = (): void => {
    const targetTime = timelineTarget();
    if (targetTime === undefined) return;

    scrubbing = true;
    scrubTime = targetTime;
    committedSeekTime = undefined;
    renderScrubbedFrame(targetTime);
    updateTransport();
    status.textContent = "SCRUBBING";
  };

  const commitTimeline = (): void => {
    const targetTime = scrubTime ?? timelineTarget();
    if (targetTime === undefined) return;

    scrubbing = false;
    scrubTime = undefined;
    committedSeekTime = targetTime;
    audio.currentTime = targetTime;
    syncBootClickCursor(targetTime);
    suppressBeatFrames = 3;
    renderScrubbedFrame(targetTime);
    updateTransport();
    status.textContent = audio.paused ? "SCRUB READY" : "PLAYING";
  };

  audio.addEventListener("loadedmetadata", () => {
    updateTransport();
    status.textContent = "SCRUB READY — DRAG TIMELINE ANYWHERE";
  });
  audio.addEventListener("durationchange", updateTransport);
  audio.addEventListener("seeked", () => {
    settleCommittedSeek();
    if (audio.paused) renderScrubbedFrame(audio.currentTime);
    updateTransport();
  });
  audio.addEventListener("error", () => {
    status.textContent = "MP3 LOAD FAILED";
  });
  audio.addEventListener("ended", () => {
    cancelAnimationFrame(animationFrame);
    committedSeekTime = undefined;
    scrubTime = undefined;
    scrubbing = false;
    updateTransport();
    playButton.textContent = "RUN AGAIN";
    status.textContent = "NOT EVEN CLOSE.";
  });

  timeline.addEventListener("pointerdown", () => {
    scrubbing = true;
    scrubTime = displayedTime();
    committedSeekTime = undefined;
  });
  timeline.addEventListener("input", previewTimeline);
  timeline.addEventListener("change", commitTimeline);
  timeline.addEventListener("pointerup", () => {
    if (scrubbing) commitTimeline();
  });
  timeline.addEventListener("pointercancel", () => {
    if (scrubbing) commitTimeline();
  });

  const ensureClickBuffers = (audioContext: AudioContext): void => {
    if (clickBuffers.length > 0) return;
    for (let variation = 0; variation < 4; variation += 1) {
      const samples = synthC64TypewriterClick(audioContext.sampleRate, variation);
      const buffer = audioContext.createBuffer(1, samples.length, audioContext.sampleRate);
      buffer.copyToChannel(samples, 0);
      clickBuffers.push(buffer);
    }
  };

  const ensurePlaybackGraph = (): void => {
    if (context && analyser && data && mediaSource) return;
    context = new AudioContext();
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.42;
    data = new Uint8Array(analyser.frequencyBinCount);
    mediaSource = context.createMediaElementSource(audio);
    mediaSource.connect(analyser);
    analyser.connect(context.destination);
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
    if (!analyser || !data) return;
    analyser.getByteFrequencyData(data);
    let sum = 0;
    let high = 0;
    let bassSquares = 0;
    let bassBins = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = (data[index] ?? 0) / 255;
      sum += value * value;
      if (index > data.length * 0.55) high += value;
      // fftSize 1024 => roughly 43–47 Hz/bin on normal desktop sample rates.
      // Bins 1..5 therefore isolate the kick/bass region instead of using
      // generic full-band energy for the 3D-object pulse.
      if (index >= 1 && index <= 5) {
        bassSquares += value * value;
        bassBins += 1;
      }
    }
    const energy = Math.sqrt(sum / data.length);
    const bassNow = Math.min(1, Math.sqrt(bassSquares / Math.max(1, bassBins)) * 1.75);
    smoothedBass = bassNow > smoothedBass
      ? smoothedBass * 0.24 + bassNow * 0.76
      : smoothedBass * 0.74 + bassNow * 0.26;
    let beat = Math.max(0, energy - previousEnergy * 0.93) * 8;
    previousEnergy = previousEnergy * 0.72 + energy * 0.28;
    if (suppressBeatFrames > 0) {
      beat = 0;
      suppressBeatFrames -= 1;
    }

    lastAudioFrame = {
      energy: Math.min(1, energy * 2.2),
      beat: Math.min(1, beat),
      high: Math.min(1, high / (data.length * 0.45) * 2),
      bass: Math.min(1, smoothedBass)
    };

    if (scrubbing && scrubTime !== undefined) {
      renderScrubbedFrame(scrubTime);
    } else {
      demo.renderFrame(audio.currentTime, lastAudioFrame);

      while (
        playedBootClicks < C64_BOOT_KEY_TIMES.length &&
        audio.currentTime >= (C64_BOOT_KEY_TIMES[playedBootClicks] ?? Infinity)
      ) {
        playBootClick(playedBootClicks);
        playedBootClicks += 1;
      }
    }

    updateTransport();
    if (!scrubbing) status.textContent = "PLAYING";
    animationFrame = requestAnimationFrame(frame);
  };

  playButton.addEventListener("click", async () => {
    ensurePlaybackGraph();

    if (audio.paused) {
      if (audio.ended) {
        audio.currentTime = 0;
        playedBootClicks = 0;
        previousEnergy = 0;
        smoothedBass = 0;
        committedSeekTime = undefined;
        scrubTime = undefined;
        scrubbing = false;
        lastAudioFrame = { energy: 0, beat: 0, high: 0, bass: 0 };
      } else {
        syncBootClickCursor(audio.currentTime);
      }
      await context?.resume();
      await audio.play();
      playButton.textContent = "PAUSE";
      status.textContent = "PLAYING";
      cancelAnimationFrame(animationFrame);
      frame();
    } else {
      audio.pause();
      playButton.textContent = "CONTINUE";
      status.textContent = "PAUSED / SCRUB READY";
      cancelAnimationFrame(animationFrame);
      updateTransport();
    }
  });

  audio.load();
}

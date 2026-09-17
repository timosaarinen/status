import * as THREE from "three";
import { C64, C64_COLORS } from "./palette";
import { drawGlyph, drawText, textWidth } from "./bitmap-font";
import { fragmentShader, vertexShader } from "./shader";

export interface AudioFrame {
  energy: number;
  beat: number;
  high: number;
}

export interface RenderApi {
  renderFrame(time: number, audio: AudioFrame): void;
}

const SCROLLER =
  "*** PAIKALLA. ***  WELCOME TO A CRACKTRO FROM THE WRONG TIMELINE.  " +
  "YOU MAY THINK YOU KNOW WHAT TIMO IS BUILDING.  YOU MAY HAVE SEEN THE CODE, " +
  "THE MACHINES, THE GAMES, THE COFFEE AND THE QUESTIONABLE ELECTRICAL DECISIONS.  " +
  "YOU MAY EVEN BELIEVE YOU UNDERSTAND THE PLAN.  NOT EVEN FUCKING CLOSE.  " +
  "GREETZ FLY OUT TO KOIVUKYLA, HAVUKOSKI, THE SALORA MANAGER, EVERY RESURRECTED LAPTOP, " +
  "C64 ENVY, ELITE FIGHTERS, MIKROBITTI, PELIT-LEHTI, THE MACHINES THAT SHOULD HAVE " +
  "STAYED DEAD, AND EVERY SENSIBLE PERSON WHO KNEW BETTER THAN TO BEGIN.  STILL HERE?  " +
  "GOOD.  THE NEXT PROJECT STARTED FIVE MINUTES AGO.  NOT EVEN FUCKING CLOSE.  ***     ";

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function centeredX(text: string, scale: number): number {
  return Math.floor((320 - textWidth(text, scale)) / 2);
}

export class CracktroDemo implements RenderApi {
  private readonly shaderCanvas: HTMLCanvasElement;
  private readonly screen: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(shaderCanvas: HTMLCanvasElement, screen: HTMLCanvasElement) {
    this.shaderCanvas = shaderCanvas;
    this.screen = screen;
    const context = screen.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D canvas is unavailable");
    this.context = context;
    this.context.imageSmoothingEnabled = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas: shaderCanvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "low-power"
    });
    this.renderer.setSize(160, 100, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uBeat: { value: 0 },
        uSection: { value: 0 },
        uResolution: { value: new THREE.Vector2(160, 100) }
      }
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  renderFrame(time: number, audio: AudioFrame): void {
    const energy = clamp(audio.energy);
    const beat = clamp(audio.beat);
    this.material.uniforms.uTime!.value = time;
    this.material.uniforms.uEnergy!.value = energy;
    this.material.uniforms.uBeat!.value = beat;
    this.material.uniforms.uSection!.value = Math.floor(time / 16);
    this.renderer.render(this.scene, this.camera);

    const context = this.context;
    context.fillStyle = C64.black;
    context.fillRect(0, 0, 320, 200);
    context.imageSmoothingEnabled = false;
    context.drawImage(this.shaderCanvas, 0, 0, 160, 100, 0, 0, 320, 200);

    this.drawRasterInterrupts(time, beat);
    this.drawTitle(time, energy, beat);
    this.drawScroller(time, energy, beat);
    this.drawBorder(time, beat);
    this.drawBootText(time);
  }

  private drawRasterInterrupts(time: number, beat: number): void {
    const context = this.context;
    context.save();
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < 5; index += 1) {
      const y = Math.round(70 + Math.sin(time * (1.4 + index * 0.07) + index * 1.9) * 48 + index * 8);
      const height = 2 + ((index + Math.floor(time * 8)) % 3);
      context.fillStyle = C64_COLORS[(index * 3 + Math.floor(time * 7)) % C64_COLORS.length] ?? C64.white;
      context.globalAlpha = 0.38 + beat * 0.35;
      context.fillRect(0, y, 320, height);
    }
    context.restore();
  }

  private drawTitle(time: number, energy: number, beat: number): void {
    const context = this.context;
    const cycle = Math.floor(time * 8 + beat * 7);
    const wobble = Math.round(Math.sin(time * 2.2) * (1 + beat * 3));
    const visible = time > 0.8;
    if (!visible) return;

    const lines = [
      { text: "NOT EVEN", y: 19, scale: 3, color: C64.lightBlue },
      { text: "FUCKING", y: 45, scale: 4, color: C64.yellow },
      { text: "CLOSE", y: 79, scale: 4, color: C64.cyan }
    ];

    for (const [lineIndex, line] of lines.entries()) {
      const x = centeredX(line.text, line.scale) + (lineIndex === 1 ? wobble : 0);
      const shadowColor = C64_COLORS[(cycle + lineIndex * 4) % C64_COLORS.length] ?? C64.purple;
      drawText(context, line.text, x + 4, line.y + 4, C64.black, line.scale);
      drawText(context, line.text, x + 2, line.y + 2, shadowColor, line.scale);
      drawText(context, line.text, x, line.y, line.color, line.scale);
    }

    if (beat > 0.7) {
      context.save();
      context.globalAlpha = beat * 0.55;
      context.strokeStyle = C64.white;
      context.lineWidth = 1;
      const inset = Math.floor((1 - beat) * 18);
      context.strokeRect(inset, inset, 319 - inset * 2, 199 - inset * 2);
      context.restore();
    }

    if (energy < 0.08 && time > 2) {
      drawText(context, "THINK YOU KNOW ME?", centeredX("THINK YOU KNOW ME?", 1), 112, C64.lightGray, 1);
    }
  }

  private drawScroller(time: number, energy: number, beat: number): void {
    const context = this.context;
    const speed = 42 + energy * 24;
    const advance = 6;
    const totalWidth = SCROLLER.length * advance;
    const offset = ((time * speed) % totalWidth + totalWidth) % totalWidth;
    const firstCharacter = Math.floor(offset / advance);
    const subPixel = offset % advance;
    const visibleCount = Math.ceil(320 / advance) + 3;

    context.fillStyle = C64.black;
    context.fillRect(0, 157, 320, 43);
    context.fillStyle = C64.purple;
    context.fillRect(0, 157, 320, 2);
    context.fillStyle = C64.lightBlue;
    context.fillRect(0, 159, 320, 1);

    for (let column = -1; column < visibleCount; column += 1) {
      const sourceIndex = (firstCharacter + column + SCROLLER.length) % SCROLLER.length;
      const character = SCROLLER[sourceIndex] ?? " ";
      const x = Math.round(column * advance - subPixel);
      const wave = Math.sin(x * 0.055 + time * 4.3) * (8 + energy * 7);
      const secondWave = Math.sin(x * 0.019 - time * 2.1) * 3;
      const y = Math.round(174 + wave + secondWave);
      const paletteIndex = (Math.floor(x / 18) + Math.floor(time * 6) + 16) % 16;
      const color = beat > 0.86 ? C64.white : (C64_COLORS[paletteIndex] ?? C64.cyan);
      drawGlyph(context, character, x + 1, y + 1, C64.black, 1);
      drawGlyph(context, character, x, y, color, 1);
    }
  }

  private drawBorder(time: number, beat: number): void {
    const context = this.context;
    const colorIndex = (Math.floor(time * 3) + Math.floor(beat * 8)) % 16;
    context.strokeStyle = C64_COLORS[colorIndex] ?? C64.blue;
    context.lineWidth = 2;
    context.strokeRect(1, 1, 318, 198);
  }

  private drawBootText(time: number): void {
    if (time >= 0.8) return;
    const phase = Math.floor(time * 12);
    const text = phase < 3 ? "READY." : phase < 6 ? "RUN" : "PAIKALLA.";
    this.context.fillStyle = C64.blue;
    this.context.fillRect(0, 0, 320, 200);
    drawText(this.context, text, 18, 24, C64.lightBlue, 2);
    if (phase >= 3) drawText(this.context, "STATUS 2026", 18, 48, C64.white, 1);
  }
}

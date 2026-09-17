import * as THREE from "three";
import { C64 } from "./palette";
import { drawGlyph, drawText, textWidth } from "./bitmap-font";
import { C64_BOOT_END, C64_BOOT_TEXT, c64BootVisibleCharacters, drawC64Text } from "./boot";
import { drawPhotoPart } from "./photo-part";
import { pathTrace2FragmentShader, pathTrace2VertexShader } from "./path-trace-2";
import { fragmentShader, vertexShader } from "./shader";

export interface AudioFrame {
  energy: number;
  beat: number;
  high: number;
  bass: number;
}

export interface RenderApi {
  renderFrame(time: number, audio: AudioFrame): void;
}

const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 200;
const SCROLLER_TOP = 157;
const SCROLLER_SPEED = 50;
const SCROLLER_ADVANCE = 6;
const PATH_TRACE_START = 43;
const PATH_TRACE_END = 55;
const PATH_TRACE_2_START = 190;
const PATH_TRACE_2_END = 216;
const SCROLLER =
  "*** PAIKALLA. ***  WELCOME TO A CRACKTRO FROM THE WRONG TIMELINE.  " +
  "YOU MAY THINK YOU KNOW WHAT TIMO IS BUILDING.  YOU MAY HAVE SEEN THE CODE, " +
  "THE MACHINES, THE GAMES, THE COFFEE AND THE QUESTIONABLE ELECTRICAL DECISIONS.  " +
  "YOU MAY EVEN BELIEVE YOU UNDERSTAND THE PLAN.  NOT EVEN FUCKING CLOSE.  " +
  "GREETZ FLY OUT TO KOIVUKYLA, HAVUKOSKI, THE SALORA MANAGER, EVERY RESURRECTED LAPTOP, " +
  "C64 ENVY, ELITE FIGHTERS, MIKROBITTI, PELIT-LEHTI, THE MACHINES THAT SHOULD HAVE " +
  "STAYED DEAD, AND EVERY SENSIBLE PERSON WHO KNEW BETTER THAN TO BEGIN.  STILL HERE?  " +
  "GOOD.  THE NEXT PROJECT STARTED FIVE MINUTES AGO.  NOT EVEN FUCKING CLOSE.  " +
  "FUCKINGS TO KELA.  I'LL LEAVE POTENTIAL MILLIONS OF TAXES TO ESTONIA ♥  ***     ";

const SCROLLER_COLORS = [C64.lightBlue, C64.cyan, C64.white, C64.yellow, C64.lightRed] as const;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function centeredX(text: string, scale: number): number {
  return Math.floor((SCREEN_WIDTH - textWidth(text, scale)) / 2);
}

export class CracktroDemo implements RenderApi {
  private readonly shaderCanvas: HTMLCanvasElement;
  private readonly screen: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly scrollerStrip: HTMLCanvasElement;
  private readonly scrollerContext: CanvasRenderingContext2D;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly material: THREE.ShaderMaterial;
  private readonly trace2Material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly trace2Scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(shaderCanvas: HTMLCanvasElement, screen: HTMLCanvasElement) {
    this.shaderCanvas = shaderCanvas;
    this.screen = screen;
    const context = screen.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D canvas is unavailable");
    this.context = context;
    this.context.imageSmoothingEnabled = false;

    this.scrollerStrip = document.createElement("canvas");
    this.scrollerStrip.width = SCREEN_WIDTH;
    this.scrollerStrip.height = 7;
    const scrollerContext = this.scrollerStrip.getContext("2d");
    if (!scrollerContext) throw new Error("Scroller canvas is unavailable");
    this.scrollerContext = scrollerContext;
    this.scrollerContext.imageSmoothingEnabled = false;

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
        uBass: { value: 0 },
        uSection: { value: 0 },
        uTraceActive: { value: 0 },
        uResolution: { value: new THREE.Vector2(160, 100) }
      }
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    this.trace2Material = new THREE.ShaderMaterial({
      vertexShader: pathTrace2VertexShader,
      fragmentShader: pathTrace2FragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uBeat: { value: 0 },
        uBass: { value: 0 },
        uHigh: { value: 0 },
        uResolution: { value: new THREE.Vector2(160, 100) }
      }
    });
    this.trace2Scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.trace2Material));
  }

  renderFrame(time: number, audio: AudioFrame): void {
    const energy = clamp(audio.energy);
    const beat = clamp(audio.beat);
    const bass = clamp(audio.bass);
    const high = clamp(audio.high);
    const tracePart1 = time >= PATH_TRACE_START && time < PATH_TRACE_END;
    const tracePart2 = time >= PATH_TRACE_2_START && time < PATH_TRACE_2_END;

    this.material.uniforms.uTime!.value = time;
    this.material.uniforms.uEnergy!.value = energy;
    this.material.uniforms.uBeat!.value = beat;
    this.material.uniforms.uBass!.value = bass;
    this.material.uniforms.uSection!.value = Math.floor(time / 16);
    this.material.uniforms.uTraceActive!.value = tracePart1 ? 1 : 0;

    if (tracePart2) {
      this.trace2Material.uniforms.uTime!.value = time;
      this.trace2Material.uniforms.uEnergy!.value = energy;
      this.trace2Material.uniforms.uBeat!.value = beat;
      this.trace2Material.uniforms.uBass!.value = bass;
      this.trace2Material.uniforms.uHigh!.value = high;
      this.renderer.render(this.trace2Scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    const context = this.context;
    context.fillStyle = C64.black;
    context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    context.imageSmoothingEnabled = false;
    context.drawImage(this.shaderCanvas, 0, 0, 160, 100, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    if (tracePart1) {
      this.drawPathTracerOverlay(time, beat, bass, 1);
    } else if (tracePart2) {
      this.drawPathTracerOverlay(time, beat, bass, 2);
    } else {
      this.drawRasterAccents(time);
      this.drawTitle(time, energy, beat);
      this.drawScroller(time, beat);
      drawPhotoPart(context, time, energy, beat);
    }
    this.drawBorder(time, beat);
    this.drawBootText(time);
  }

  private drawPathTracerOverlay(time: number, beat: number, bass: number, part: 1 | 2): void {
    const context = this.context;
    const localTime = time - (part === 2 ? PATH_TRACE_2_START : PATH_TRACE_START);
    const blink = Math.floor(localTime * 4) % 2 === 0;
    const titleColor = beat > 0.82 ? C64.white : C64.lightBlue;
    const title = part === 2 ? "PATH TRACER 64 II" : "PATH TRACER 64";
    const subtitle = part === 2
      ? "SPLINE CAM / MUSIC OBJECTS / 4 SPP"
      : "3 BOUNCES / 4 SPP / 16 COLOURS";
    const rays = part === 2 ? "FLY THROUGH THE NOISE" : "38911 RAYS FREE";

    context.save();
    context.globalAlpha = 0.88;
    context.fillStyle = C64.black;
    context.fillRect(0, 0, SCREEN_WIDTH, 18);
    context.fillRect(0, 142, SCREEN_WIDTH, 17);
    context.restore();

    drawText(context, title, centeredX(title, 2), 2, titleColor, 2);
    drawText(context, subtitle, centeredX(subtitle, 1), 145, C64.lightGray, 1);
    drawText(context, rays, centeredX(rays, 1), 153, blink ? C64.yellow : C64.orange, 1);

    const meterWidth = Math.round(42 * bass);
    context.fillStyle = C64.darkGray;
    context.fillRect(6, 132, 44, 4);
    context.fillStyle = bass > 0.72 ? C64.yellow : C64.purple;
    context.fillRect(7, 133, meterWidth, 2);
  }

  private drawRasterAccents(time: number): void {
    const context = this.context;
    const bars = [
      { baseY: 132, phase: 0, color: C64.purple },
      { baseY: 139, phase: 1.8, color: C64.blue },
      { baseY: 146, phase: 3.2, color: C64.lightBlue }
    ];

    context.save();
    context.globalAlpha = 0.72;
    for (const bar of bars) {
      const y = Math.round(bar.baseY + Math.sin(time * 1.1 + bar.phase) * 2);
      context.fillStyle = C64.black;
      context.fillRect(0, y - 1, SCREEN_WIDTH, 3);
      context.fillStyle = bar.color;
      context.fillRect(0, y, SCREEN_WIDTH, 1);
    }
    context.restore();
  }

  private drawTitle(time: number, energy: number, beat: number): void {
    if (time <= C64_BOOT_END) return;

    const context = this.context;
    const pulse = Math.sin(time * 1.45) > 0 ? C64.purple : C64.blue;
    const lines = [
      { text: "NOT EVEN", y: 19, scale: 3, color: C64.lightBlue },
      { text: "FUCKING", y: 45, scale: 4, color: C64.yellow },
      { text: "CLOSE", y: 79, scale: 4, color: C64.cyan }
    ];

    for (const line of lines) {
      const x = centeredX(line.text, line.scale);
      drawText(context, line.text, x + 4, line.y + 4, C64.black, line.scale);
      drawText(context, line.text, x + 2, line.y + 2, pulse, line.scale);
      drawText(context, line.text, x, line.y, line.color, line.scale);
    }

    const tag = energy < 0.08 && time > C64_BOOT_END + 1.2 ? "THINK YOU KNOW ME?" : "STATUS / 2026";
    drawText(context, tag, centeredX(tag, 1), 116, C64.lightGray, 1);

    if (beat > 0.78) {
      context.save();
      context.globalAlpha = (beat - 0.78) * 2.4;
      context.strokeStyle = C64.white;
      context.lineWidth = 1;
      context.strokeRect(3, 3, 313, 193);
      context.restore();
    }
  }

  private drawScroller(time: number, beat: number): void {
    const context = this.context;
    const strip = this.scrollerContext;

    // Start the scroller only after the C64 boot/typewriter section. The text
    // begins completely off-screen at x=320 and enters naturally from the
    // right instead of inheriting several seconds of hidden scroll time.
    const scrollTime = Math.max(0, time - C64_BOOT_END);
    const textWidthPixels = SCROLLER.length * SCROLLER_ADVANCE;
    const cycleWidth = SCREEN_WIDTH + textWidthPixels;
    const cycleOffset = (scrollTime * SCROLLER_SPEED) % cycleWidth;
    const startX = SCREEN_WIDTH - cycleOffset;

    context.fillStyle = C64.black;
    context.fillRect(0, SCROLLER_TOP, SCREEN_WIDTH, SCREEN_HEIGHT - SCROLLER_TOP);
    context.fillStyle = C64.purple;
    context.fillRect(0, SCROLLER_TOP, SCREEN_WIDTH, 2);
    context.fillStyle = C64.lightBlue;
    context.fillRect(0, SCROLLER_TOP + 2, SCREEN_WIDTH, 1);
    context.fillStyle = C64.blue;
    context.fillRect(0, SCREEN_HEIGHT - 2, SCREEN_WIDTH, 1);

    strip.clearRect(0, 0, SCREEN_WIDTH, 7);

    // Only draw characters whose cells can overlap the 320-pixel strip. This
    // keeps the entrance/exit non-wrapping while still allowing the whole
    // message to restart from the right after it has completely left the left.
    const firstCharacter = Math.max(0, Math.floor((-startX) / SCROLLER_ADVANCE) - 1);
    const lastCharacter = Math.min(
      SCROLLER.length - 1,
      Math.ceil((SCREEN_WIDTH - startX) / SCROLLER_ADVANCE) + 1
    );

    for (let sourceIndex = firstCharacter; sourceIndex <= lastCharacter; sourceIndex += 1) {
      const character = SCROLLER[sourceIndex] ?? " ";
      const x = Math.round(startX + sourceIndex * SCROLLER_ADVANCE);
      const color = beat > 0.9
        ? C64.white
        : SCROLLER_COLORS[Math.floor(sourceIndex / 3) % SCROLLER_COLORS.length] ?? C64.cyan;
      drawGlyph(strip, character, x, 0, color, 1);
    }

    context.save();
    context.imageSmoothingEnabled = false;
    for (let x = 0; x < SCREEN_WIDTH; x += 1) {
      const primary = Math.sin(x * 0.057 + time * 2.15) * 8;
      const secondary = Math.sin(x * 0.021 - time * 1.05 + 1.4) * 2;
      const y = Math.round(174 + primary + secondary);
      context.drawImage(this.scrollerStrip, x, 0, 1, 7, x, y, 1, 7);
    }
    context.restore();
  }

  private drawBorder(time: number, beat: number): void {
    if (time <= C64_BOOT_END) return;
    const context = this.context;
    const colors = [C64.blue, C64.purple, C64.lightBlue] as const;
    const color = beat > 0.88 ? C64.white : colors[Math.floor(time * 0.75) % colors.length] ?? C64.blue;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(1, 1, 318, 198);
  }

  private drawBootText(time: number): void {
    if (time > C64_BOOT_END) return;

    const context = this.context;
    context.fillStyle = C64.blue;
    context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    drawC64Text(context, "**** COMMODORE 64 BASIC V2 ****", 4, 1, C64.lightBlue);
    drawC64Text(context, "64K RAM SYSTEM  38911 BASIC BYTES FREE", 1, 3, C64.lightBlue);

    const visibleCount = c64BootVisibleCharacters(time);
    const typed = C64_BOOT_TEXT.slice(0, visibleCount);
    drawC64Text(context, typed, 0, 7, C64.lightBlue);

    const cursorVisible = Math.floor(time * 2) % 2 === 0;
    if (cursorVisible) {
      const cursorColumn = Math.min(39, visibleCount);
      context.fillStyle = C64.lightBlue;
      context.fillRect(cursorColumn * 8, 7 * 8, 8, 8);
    }
  }
}

"use client";

import { useEffect, useRef } from "react";
import { fragmentShader, vertexShader } from "./shader";

export type Scene = {
  /** 0 → 1 while the visitor holds. 1 means the dream is real. */
  progress: number;
  /** Where the hold started, in 0–1 with y pointing up. */
  press: [number, number];
  pointer: [number, number];
  /** 0 = night, 1 = morning. */
  day: number;
  /** Short flash when something lands (a line appears, a key is typed). */
  pulse: number;
  /** Time scale; drops for reduced motion. */
  motion: number;
};

type Props = {
  scene: React.RefObject<Scene>;
  onFrame: (dt: number) => void;
  /** The brand mark that melts in the dream and sets solid when it's real. */
  mark: { src: string; width: number; height: number };
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader failed to compile");
  }
  return shader;
}

export default function DreamField({ scene, onFrame, mark }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(onFrame);

  useEffect(() => {
    frameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });

    let raf = 0;
    let last = performance.now();

    if (!gl) {
      // No WebGL: the CSS gradient on the canvas stays visible and the
      // interaction still runs.
      const tick = (now: number) => {
        frameRef.current(Math.min((now - last) / 1000, 1 / 30));
        last = now;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexShader));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentShader));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u("uRes");
    const uTime = u("uTime");
    const uProgress = u("uProgress");
    const uPress = u("uPress");
    const uPointer = u("uPointer");
    const uDay = u("uDay");
    const uPulse = u("uPulse");
    gl.uniform1i(u("uText"), 0);

    const texture = gl.createTexture();
    const textCanvas = document.createElement("canvas");

    const logo = new Image();
    logo.src = mark.src;

    // The mark is drawn into its own canvas at screen resolution, so it stays
    // crisp even when the effect itself renders at a lower scale.
    const drawMark = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(window.innerWidth * scale);
      const h = Math.round(window.innerHeight * scale);
      textCanvas.width = w;
      textCanvas.height = h;
      const ctx = textCanvas.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      if (logo.complete && logo.naturalWidth) {
        const ratio = mark.width / mark.height;
        const drawH = Math.min(h * 0.46, (w * 0.8) / ratio);
        const drawW = drawH * ratio;
        ctx.drawImage(logo, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    logo.onload = drawMark;

    // Render scale adapts to the device: drop resolution if frames run long.
    let quality = 1;
    const resize = () => {
      const narrow = window.innerWidth < 720;
      const dpr = Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 1.25) * quality;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      drawMark();
    };
    resize();
    window.addEventListener("resize", resize);

    let time = 0;
    let slowFrames = 0;
    let frames = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      frames++;
      if (frames > 30) {
        // Gaps longer than ~90ms are the browser throttling a hidden window, not a slow GPU.
        if (dt < 0.09) slowFrames = dt > 1 / 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames > 45 && quality > 0.55) {
          quality *= 0.8;
          slowFrames = 0;
          resize();
        }
      }

      frameRef.current(dt);
      const s = scene.current;
      time += dt * s.motion;
      gl.uniform1f(uTime, time);
      gl.uniform1f(uProgress, s.progress);
      gl.uniform2f(uPress, s.press[0], s.press[1]);
      gl.uniform2f(uPointer, s.pointer[0], s.pointer[1]);
      gl.uniform1f(uDay, s.day);
      gl.uniform1f(uPulse, s.pulse);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [scene, mark]);

  return <canvas ref={canvasRef} className="field" aria-hidden="true" />;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { animate, AnimatePresence, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import DreamField, { type Scene } from "./DreamField";
import WakeView from "./WakeView";
import { Drone } from "@/lib/drone";

type Phase = "dream" | "awake";

const HOLD_SECONDS = 2.4;
const LINES = ["We dream.", "We build.", "We solve."];
const THRESHOLDS = [0.1, 0.42, 0.72];
// Critically damped return spring (Apple's damping 1.0, response 0.55s).
const RETURN_OMEGA = (2 * Math.PI) / 0.55;
const RING_LENGTH = 2 * Math.PI * 38;

function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported; the visual feedback carries on its own.
  }
}

// The brand's lockup with the ivory knocked out, so it sits on night and morning alike.
const LOGO = { src: "/brand/logo-mark.webp", width: 1052, height: 681 };

export default function Experience() {
  const reduceMotion = useReducedMotion();
  const scene = useRef<Scene>({
    progress: 0,
    press: [0.5, 0.5],
    pointer: [0.5, 0.5],
    day: 0,
    pulse: 0,
    motion: 1,
  });
  const [phase, setPhase] = useState<Phase>("dream");
  const [hint, setHint] = useState("Press and hold");
  const [soundOn, setSoundOn] = useState(false);

  const phaseRef = useRef<Phase>("dream");
  const holding = useRef(false);
  const autopilot = useRef(false);
  const velocity = useRef(0);
  const linesShown = useRef(0);
  const pointerTarget = useRef<[number, number]>([0.5, 0.5]);
  const dayAnimation = useRef<AnimationPlaybackControls | null>(null);
  const drone = useRef<Drone | null>(null);
  const reduceRef = useRef(false);

  const ringRef = useRef<HTMLDivElement>(null);
  const ringArc = useRef<SVGCircleElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    reduceRef.current = !!reduceMotion;
    scene.current.motion = reduceMotion ? 0.15 : 1;
  }, [reduceMotion]);

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", phase === "awake" ? "#F2EBDD" : "#0B0A08");
    if (phase === "dream") {
      // Coming back to sleep: the ring and lines return to where they left off,
      // so the dream folds back into the point it was woken from.
      const [x, y] = scene.current.press;
      if (ringRef.current) {
        ringRef.current.style.left = `${x * 100}%`;
        ringRef.current.style.top = `${(1 - y) * 100}%`;
      }
      lineRefs.current.forEach((el, i) => el?.classList.toggle("is-on", i < linesShown.current));
    }
  }, [phase]);

  const animateDay = useCallback((to: number) => {
    const s = scene.current;
    dayAnimation.current?.stop();
    dayAnimation.current = animate(s.day, to, {
      type: "spring",
      bounce: 0,
      duration: reduceRef.current ? 0.6 : to === 1 ? 1.8 : 1.2,
      onUpdate: (v) => {
        s.day = v;
      },
    });
  }, []);

  const wake = useCallback(() => {
    const s = scene.current;
    phaseRef.current = "awake";
    holding.current = false;
    autopilot.current = false;
    velocity.current = 0;
    s.progress = 1;
    s.pulse = 1;
    haptic([12, 40, 24]);
    drone.current?.chime();
    animateDay(1);
    setPhase("awake");
  }, [animateDay]);

  const sleep = useCallback(() => {
    phaseRef.current = "dream";
    setHint("Press and hold");
    animateDay(0);
    setPhase("dream");
  }, [animateDay]);

  const step = useCallback(
    (dt: number) => {
      const s = scene.current;

      if (phaseRef.current === "dream") {
        const driving = holding.current || autopilot.current;
        if (driving) {
          const prev = s.progress;
          const rate = autopilot.current ? 2.4 : 1;
          s.progress = Math.min(1, s.progress + (dt / HOLD_SECONDS) * rate * (0.55 + 0.9 * s.progress));
          velocity.current = (s.progress - prev) / dt;
          if (s.progress >= 1) wake();
        } else if (s.day < 0.35 && (s.progress > 0 || velocity.current !== 0)) {
          // Released: the spring starts from the live value and inherits the
          // hold's velocity, so there's no seam between pressing and letting go.
          const accel = -RETURN_OMEGA * RETURN_OMEGA * s.progress - 2 * RETURN_OMEGA * velocity.current;
          velocity.current += accel * dt;
          s.progress = Math.min(0.999, Math.max(0, s.progress + velocity.current * dt));
          if (s.progress < 1e-4 && Math.abs(velocity.current) < 1e-3) {
            s.progress = 0;
            velocity.current = 0;
          }
        }

        const shown = THRESHOLDS.filter((t) => s.progress >= t).length;
        if (shown !== linesShown.current) {
          if (shown > linesShown.current) {
            haptic(8);
            drone.current?.tick(shown);
            s.pulse = 1;
          }
          linesShown.current = shown;
          lineRefs.current.forEach((el, i) => el?.classList.toggle("is-on", i < shown));
        }

        if (ringArc.current && ringRef.current) {
          ringArc.current.style.strokeDashoffset = String(RING_LENGTH * (1 - s.progress));
          ringRef.current.style.opacity = String(holding.current ? 1 : Math.min(1, s.progress * 5));
        }
      }

      const k = 1 - Math.exp(-dt * 6);
      s.pointer[0] += (pointerTarget.current[0] - s.pointer[0]) * k;
      s.pointer[1] += (pointerTarget.current[1] - s.pointer[1]) * k;
      s.pulse = Math.max(0, s.pulse - dt * 2.2);
      drone.current?.update(s.progress, s.day);
    },
    [wake],
  );

  const onFrame = useCallback(
    (frameDt: number) => {
      // Integrate in small steps so the hold takes the same real time and the
      // spring stays stable even when frames arrive slowly.
      const steps = Math.max(1, Math.ceil(frameDt * 60));
      for (let i = 0; i < steps; i++) step(frameDt / steps);
    },
    [step],
  );

  const begin = useCallback((x: number, y: number) => {
    const s = scene.current;
    // Only re-anchor once the last circle has collapsed; grabbing it mid-return
    // picks the same circle back up.
    if (s.progress < 0.02) {
      s.press = [x / window.innerWidth, 1 - y / window.innerHeight];
      if (ringRef.current) {
        ringRef.current.style.left = `${x}px`;
        ringRef.current.style.top = `${y}px`;
      }
    }
    holding.current = true;
    ringRef.current?.classList.add("is-pressed");
    setHint("Keep holding");
  }, []);

  const release = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    ringRef.current?.classList.remove("is-pressed");
    if (phaseRef.current === "dream") setHint("Hold a little longer");
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointerTarget.current = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
    };
    const keyDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== "dream" || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input")) return;
      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        begin(window.innerWidth / 2, window.innerHeight / 2);
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "Enter") release();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
    };
  }, [begin, release]);

  useEffect(() => () => drone.current?.dispose(), []);

  const toggleSound = () => {
    drone.current ??= new Drone();
    drone.current.setEnabled(!soundOn);
    setSoundOn(!soundOn);
  };

  const skip = () => {
    if (scene.current.progress < 0.02) {
      scene.current.press = [0.5, 0.5];
      if (ringRef.current) {
        ringRef.current.style.left = "50%";
        ringRef.current.style.top = "50%";
      }
    }
    autopilot.current = true;
  };

  return (
    <div className="experience" data-phase={phase}>
      <DreamField scene={scene} onFrame={onFrame} mark={LOGO} />

      <header className="bar">
        <Image className="logo" src={LOGO.src} width={74} height={48} alt="The Dream Project" priority />
        <div className="bar__tools">
          <button type="button" className="chip" onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? "Sound on" : "Sound off"}
          </button>
          {phase === "awake" && (
            <button type="button" className="chip" onClick={sleep}>
              Back to sleep
            </button>
          )}
        </div>
      </header>

      {phase === "dream" && (
        <>
          <div
            className="hold"
            role="button"
            tabIndex={0}
            aria-label="Press and hold to wake the dream. Space or Enter also works."
            onPointerDown={(e) => {
              if (e.pointerType === "mouse" && e.button !== 0) return;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Synthetic or already-released pointer; tracking still works without capture.
              }
              begin(e.clientX, e.clientY);
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
            onContextMenu={(e) => e.preventDefault()}
          />

          <div ref={ringRef} className="ring" aria-hidden="true">
            {/* The brand's DP roundel, filling with gold as the hold builds. */}
            <svg viewBox="0 0 88 88" width="88" height="88">
              <circle className="ring__track" cx="44" cy="44" r="38" />
              <circle
                ref={ringArc}
                className="ring__arc"
                cx="44"
                cy="44"
                r="38"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={RING_LENGTH}
              />
            </svg>
            <span className="ring__mark">DP</span>
          </div>

          <p className="whisper" aria-live="polite">
            {LINES.map((line, i) => (
              <span
                key={line}
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
              >
                {line}
              </span>
            ))}
          </p>

          <p className="hint">{hint}</p>
          <button type="button" className="skip" onClick={skip}>
            Just tell me what this is
          </button>
        </>
      )}

      <AnimatePresence>
        {phase === "awake" && (
          <WakeView
            key="wake"
            onType={() => {
              scene.current.pulse = Math.min(1, scene.current.pulse + 0.5);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

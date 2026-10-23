"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";

const LINES = ["We dream.", "We build.", "We solve."];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INSTAGRAM = "https://www.instagram.com/thedreamproject.life/";

type Status = "idle" | "sending" | "done" | "error";

export default function WakeView({ onType }: { onType: () => void }) {
  const reduce = useReducedMotion();
  const [word, setWord] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const wordInput = useRef<HTMLInputElement>(null);

  // Materialize: each line arrives from below, out of focus, the way the
  // whispered lines were drifting in the dream.
  const rise = (i: number) =>
    reduce
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.4, delay: 0.2 + i * 0.06 },
        }
      : {
          initial: { opacity: 0, y: 56, filter: "blur(16px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          exit: { opacity: 0, y: 32, filter: "blur(12px)", transition: { duration: 0.45, delay: (5 - i) * 0.03 } },
          transition: { type: "spring" as const, bounce: 0, duration: 1.2, delay: 0.45 + i * 0.09 },
        };

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const id = window.setTimeout(() => wordInput.current?.focus({ preventScroll: true }), 1300);
    return () => window.clearTimeout(id);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setError("Add your full email address, like name@domain.com.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), word: word.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Your place wasn't saved. Try again in a moment.");
      setStatus("done");
      onType();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Your place wasn't saved. Try again in a moment.");
    }
  }

  const finished = word.trim();

  return (
    <motion.main className="wake" exit={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <div className="wake__grid">
        <div>
          <h1 className="stack">
            {LINES.map((line, i) => (
              <motion.span key={line} className="stack__line" {...rise(i)}>
                {line}
              </motion.span>
            ))}
          </h1>
          <motion.div className="stack stack__line stack__open" {...rise(3)}>
            We{" "}
            <label className="autosize" data-value={word}>
              <span className="sr-only">Finish the sentence: We…</span>
              <input
                ref={wordInput}
                value={word}
                size={1}
                maxLength={24}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={status === "done"}
                onChange={(e) => {
                  setWord(e.target.value.replace(/\s+/g, " ").replace(/^\s/, ""));
                  onType();
                }}
              />
            </label>
            {finished ? "." : ""}
          </motion.div>
          <motion.p className="prompt" {...rise(4)}>
            {status === "done" ? "Your line is saved." : "Finish the sentence. What are you here to do?"}
          </motion.p>
        </div>

        <motion.aside className="panel" {...rise(5)}>
          <p className="decision">This isn&rsquo;t a dream. It&rsquo;s a decision.</p>
          <p className="lede">
            The Dream Project is a collective of creators, founders and entrepreneurs turning ideas into reality.
            Projects, events, a podcast and a network of people building things. The doors open soon.
          </p>

          {status === "done" ? (
            <div className="done" role="status">
              <h2>You&rsquo;re on the list.</h2>
              <p>
                {finished
                  ? `We'll email you when the doors open, and we'll hold you to “We ${finished}.”`
                  : "We'll email you when the doors open."}
              </p>
            </div>
          ) : (
            <form className="join" onSubmit={submit} noValidate>
              <label htmlFor="email" className="join__label">
                Be first in when the doors open
              </label>
              <div className="join__row">
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@domain.com"
                  value={email}
                  aria-invalid={!!error}
                  aria-describedby="join-error"
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                />
                <button type="submit" disabled={status === "sending"}>
                  {status === "sending" ? "Saving…" : "Save my place"}
                </button>
              </div>
              <p id="join-error" className="join__error" aria-live="polite">
                {error}
              </p>
            </form>
          )}

          <a className="follow" href={INSTAGRAM} target="_blank" rel="noreferrer">
            Follow the build on Instagram
            <span>@thedreamproject.life</span>
          </a>
        </motion.aside>
      </div>
    </motion.main>
  );
}

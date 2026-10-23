// Opt-in sound. A low chord that opens up as the visitor holds, a soft tick
// when each line lands, and a bell when the dream becomes real.
export class Drone {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private voices: { osc: OscillatorNode; ratio: number }[];
  private enabled = false;
  private suspendTimer: number | null = null;

  constructor() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 320;
    this.filter.Q.value = 4;
    this.filter.connect(this.master);
    this.master.connect(ctx.destination);

    // Root, fifth and a slightly detuned octave.
    this.voices = [
      { ratio: 1, type: "sine" as OscillatorType, level: 0.6 },
      { ratio: 1.4983, type: "triangle" as OscillatorType, level: 0.22 },
      { ratio: 2.006, type: "triangle" as OscillatorType, level: 0.18 },
    ].map(({ ratio, type, level }) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 98 * ratio;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain);
      gain.connect(this.filter);
      osc.start();
      return { osc, ratio };
    });
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.ctx.resume();
  }

  update(progress: number, day: number) {
    const now = this.ctx.currentTime;
    const base = 98 * 2 ** progress;
    for (const v of this.voices) v.osc.frequency.setTargetAtTime(base * v.ratio, now, 0.06);
    this.filter.frequency.setTargetAtTime(320 + 2600 * progress * (1 - day * 0.6), now, 0.08);
    // The drone belongs to the dream: it fades out as morning arrives, leaving
    // only the wake chime to ring out.
    const level = this.enabled ? (0.025 + 0.07 * progress) * (1 - day) : 0;
    this.master.gain.setTargetAtTime(level, now, 0.15);

    // Once silent, suspend the audio engine; wake it if the dream returns.
    const silent = !this.enabled || day > 0.995;
    if (silent && this.ctx.state === "running") {
      this.suspendTimer ??= window.setTimeout(() => {
        this.suspendTimer = null;
        this.ctx.suspend();
      }, 2500);
    } else if (!silent) {
      if (this.suspendTimer !== null) {
        window.clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    }
  }

  private blip(freq: number, peak: number, decay: number) {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  }

  tick(step: number) {
    this.blip(392 * 2 ** (step / 4), 0.05, 0.25);
  }

  chime() {
    this.blip(784, 0.07, 2.4);
    this.blip(1176, 0.035, 1.8);
    this.blip(1568, 0.02, 1.2);
  }

  dispose() {
    if (this.suspendTimer !== null) window.clearTimeout(this.suspendTimer);
    this.ctx.close();
  }
}
